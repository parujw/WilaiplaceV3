import { NextResponse } from "next/server";
import { buildBill, dueDateFor, lastReadingFor, nextCycle, withMeterLines } from "@/lib/billing";
import { BillEditError, recalcTotals } from "@/lib/bill-edit";
import { db } from "@/lib/db";
import { meterReadingId } from "@/lib/ids";
import { audit, getRoomViews, listBills, listLeases, listMeterReadings, nextBillNo } from "@/lib/repo";
import { carryOverFor, tenancyLeaseIds } from "@/lib/tenancy";
import { getSelectedPropertyId, getSessionUser } from "@/lib/session";
import type { WriteOp } from "@/lib/db/store";
import type { Bill, MeterReading } from "@/lib/types";

interface ReadingInput {
  roomId: string;
  /** เลขเดิมที่คนจดแก้มาเอง เผื่อรอบก่อนจดผิด ไม่ส่งมาก็ใช้ที่จดไว้รอบก่อน */
  elecPrevious?: number;
  waterPrevious?: number;
  elecCurrent: number;
  waterCurrent: number;
  discount?: number;
  extraLabel?: string;
  extraAmount?: number;
}

/**
 * จดมิเตอร์และออกบิลทั้งตึกในครั้งเดียว
 * บันทึก meterReadings + bills + auditLog ให้ครบ ถ้าพังกลางทางต้องไม่เหลือของครึ่งๆ กลางๆ
 *
 * แต่ละห้องที่ส่งมาเป็นหนึ่งในสามแบบ
 *   ยังไม่มีบิลค่าเช่ารอบนี้ + mode "issue"  → บันทึกเลข + ออกบิลใหม่
 *   ยังไม่มีบิลค่าเช่ารอบนี้ + mode "save"   → บันทึกเลขอย่างเดียว ออกบิลทีหลัง
 *     (ใบจดมิเตอร์ที่ผู้เช่าส่งกลับมาทยอยมาหลายวัน กรอกไว้ก่อนได้)
 *   มีบิลค่าเช่ารอบนี้แล้ว                    → บันทึกเลขใหม่ + แก้ค่าไฟค่าน้ำในบิลเดิม
 *     เลขของรอบนี้คือเลขครั้งก่อนของรอบหน้า แก้เลขแต่ไม่แก้บิล หน่วยจะหายหรือถูกคิดซ้ำ
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "ไม่มีสิทธิ์ออกบิล" }, { status: 403 });

  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return NextResponse.json({ error: "ยังไม่ได้เลือกอาคาร" }, { status: 400 });

  const body = (await request.json()) as { cycle?: string; readings?: ReadingInput[]; mode?: "issue" | "save" };
  const mode = body.mode === "save" ? "save" : "issue";
  const cycle = String(body.cycle ?? "");
  if (!/^\d{6}$/.test(cycle)) return NextResponse.json({ error: "รอบบิลต้องเป็นตัวเลข 6 หลัก" }, { status: 400 });

  const inputs = (body.readings ?? []).filter((r) => r?.roomId);
  if (inputs.length === 0) return NextResponse.json({ error: "ไม่มีห้องที่จะออกบิล" }, { status: 400 });

  const [views, allBills, readings, leases] = await Promise.all([
    getRoomViews(propertyId),
    listBills(propertyId),
    listMeterReadings(propertyId),
    listLeases(propertyId),
  ]);
  const existing = allBills.filter((b) => b.cycle === cycle);

  const viewByRoom = new Map(views.map((v) => [v.room.id, v]));
  // บิลค่าเช่าของรอบนี้ของแต่ละห้อง บิลมัดจำหรือบิลค่าซ่อมไม่นับ
  const rentBillOf = new Map(
    existing
      .filter((b) => b.status !== "void" && b.lines.some((l) => l.type === "rent"))
      .map((b) => [b.roomId, b]),
  );

  const ops: WriteOp[] = [];
  const created: Array<{ roomNo: string; billNo: string; total: number }> = [];
  const updated: Array<{ roomNo: string; billNo: string; total: number }> = [];
  const saved: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  for (const input of inputs) {
    const view = viewByRoom.get(input.roomId);
    if (!view) {
      skipped.push(`${input.roomId}: ไม่พบห้อง`);
      continue;
    }
    const { room, lease, tenant } = view;
    if (!lease || !tenant) {
      skipped.push(`ห้อง ${room.roomNo}: ไม่มีสัญญาที่ใช้งานอยู่`);
      continue;
    }
    // เลขเดิมมาจากที่จดไว้รอบก่อน แต่ถ้าคนจดแก้มา ให้เชื่อคนจด
    // รอบก่อนจดผิดแล้วไม่ให้แก้ หน่วยของรอบนี้จะผิดตามไปด้วยโดยที่แก้ไม่ได้เลย
    // แก้ตรงนี้มีผลกับบิลใบใหม่เท่านั้น ไม่ย้อนไปแก้บิลเก่าที่ออกไปแล้ว
    const previous = lastReadingFor(readings, room.id, cycle);
    const elecPrevious = Number.isFinite(Number(input.elecPrevious))
      ? Number(input.elecPrevious)
      : (previous?.elecCurrent ?? 0);
    const waterPrevious = Number.isFinite(Number(input.waterPrevious))
      ? Number(input.waterPrevious)
      : (previous?.waterCurrent ?? 0);
    if (elecPrevious < 0 || waterPrevious < 0) {
      skipped.push(`ห้อง ${room.roomNo}: เลขมิเตอร์เดิมติดลบไม่ได้`);
      continue;
    }
    const elecCurrent = Number(input.elecCurrent);
    const waterCurrent = Number(input.waterCurrent);
    if (!Number.isFinite(elecCurrent) || !Number.isFinite(waterCurrent)) {
      skipped.push(`ห้อง ${room.roomNo}: เลขมิเตอร์ไม่ถูกต้อง`);
      continue;
    }

    const meter = { elecPrevious, elecCurrent, waterPrevious, waterCurrent };
    const reading: MeterReading = {
      id: meterReadingId(propertyId, cycle, room.roomNo),
      propertyId,
      roomId: room.id,
      cycle,
      ...meter,
      readAt: new Date().toISOString().slice(0, 10),
      readBy: user.email,
    };
    const readingOp: WriteOp = {
      type: "set", collection: "meterReadings", id: reading.id, data: reading as unknown as Record<string, unknown>,
    };

    // รอบถัดไปจดไปแล้วด้วยเลขครั้งก่อนเป็นเลขเดิม — แก้รอบนี้แล้วรอบนั้นไม่ตรงกัน ต้องบอก
    const later = readings.find((r) => r.roomId === room.id && r.cycle === nextCycle(cycle));
    if (later && (later.elecPrevious !== elecCurrent || later.waterPrevious !== waterCurrent)) {
      warnings.push(
        `ห้อง ${room.roomNo}: รอบถัดไปใช้เลขครั้งก่อน ไฟ ${later.elecPrevious} น้ำ ${later.waterPrevious} ไปแล้ว ตรวจบิลรอบถัดไปด้วย`,
      );
    }

    const rentBill = rentBillOf.get(room.id);
    if (rentBill) {
      let lines;
      let totals;
      try {
        lines = withMeterLines(rentBill.lines, meter, lease.rates);
        totals = recalcTotals(lines, rentBill.paid);
      } catch (err) {
        skipped.push(`ห้อง ${room.roomNo}: ${err instanceof BillEditError ? err.message : "แก้บิลไม่สำเร็จ"}`);
        continue;
      }
      ops.push(readingOp, {
        type: "update", collection: "bills", id: rentBill.id, data: { lines, ...totals },
      });
      updated.push({ roomNo: room.roomNo, billNo: rentBill.billNo, total: totals.total });
      continue;
    }

    if (mode === "save") {
      ops.push(readingOp);
      saved.push(room.roomNo);
      continue;
    }

    // ยอดค้างจากบิลเก่ายกมาใส่บิลใหม่ ไม่ให้หนี้หาย
    // แต่ต้องเป็นหนี้ของการเช่าครั้งนี้เท่านั้น ของเดิมคิดจากห้องอย่างเดียว
    // ผู้เช่าใหม่ที่เข้ามาห้องที่คนเก่าค้างเงินไว้ จะโดนยอดค้างของคนเก่าใส่เข้าบิล
    // ส่วนคนที่ย้ายห้อง หนี้ก้อนเดิมก็ยังตามไปห้องใหม่ถูกต้อง
    const carryOver = carryOverFor(
      allBills,
      tenancyLeaseIds(leases, room.activeLeaseId),
      tenant.id,
      cycle,
    );

    const extras =
      input.extraLabel && Number(input.extraAmount)
        ? [{ label: input.extraLabel, amount: Number(input.extraAmount) }]
        : [];

    const draft = buildBill({
      lease, elecPrevious, elecCurrent, waterPrevious, waterCurrent,
      carryOver, discount: Number(input.discount) || 0, extras,
    });

    const { billNo, invoiceNo } = await nextBillNo(cycle);
    const issuedAt = new Date().toISOString().slice(0, 10);

    const bill: Bill = {
      id: billNo,
      propertyId,
      billNo,
      invoiceNo,
      cycle,
      roomId: room.id,
      roomNo: room.roomNo,
      leaseId: lease.id,
      tenantSnapshot: { tenantId: tenant.id, name: tenant.name, phone: tenant.phone },
      lines: draft.lines,
      total: draft.total,
      paid: 0,
      balance: draft.total,
      status: "unpaid",
      issuedAt,
      dueDate: dueDateFor(cycle, lease.dueDay),
      sentToLineAt: null,
    };

    ops.push(readingOp, {
      type: "set", collection: "bills", id: bill.id, data: bill as unknown as Record<string, unknown>,
    });
    created.push({ roomNo: room.roomNo, billNo, total: draft.total });
  }

  if (ops.length === 0) {
    return NextResponse.json({ error: skipped[0] ?? "ไม่มีห้องที่บันทึกได้", skipped }, { status: 400 });
  }

  await db().batch(ops);
  await audit(user, {
    propertyId,
    action: mode === "save" ? "meter.save-batch" : "bill.issue-batch",
    targetType: "cycle",
    targetId: cycle,
    before: { billsBefore: existing.length },
    after: { created: created.map((c) => c.billNo), updated: updated.map((u) => u.billNo), saved, skipped },
  });

  return NextResponse.json({
    ok: true,
    created,
    updated,
    saved,
    skipped,
    warnings,
    total: created.reduce((s, c) => s + c.total, 0),
  });
}
