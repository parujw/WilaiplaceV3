import { NextResponse } from "next/server";
import { buildBill, dueDateFor, lastReadingFor } from "@/lib/billing";
import { db } from "@/lib/db";
import { audit, getRoomViews, listBills, listMeterReadings, nextBillNo } from "@/lib/repo";
import { getSelectedPropertyId, getSessionUser } from "@/lib/session";
import type { WriteOp } from "@/lib/db/store";
import type { Bill, MeterReading } from "@/lib/types";

interface ReadingInput {
  roomId: string;
  elecCurrent: number;
  waterCurrent: number;
  discount?: number;
  extraLabel?: string;
  extraAmount?: number;
}

/**
 * ออกบิลทั้งตึกในครั้งเดียว
 * บันทึก meterReadings + bills + auditLog ให้ครบ ถ้าพังกลางทางต้องไม่เหลือของครึ่งๆ กลางๆ
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "ไม่มีสิทธิ์ออกบิล" }, { status: 403 });

  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return NextResponse.json({ error: "ยังไม่ได้เลือกอาคาร" }, { status: 400 });

  const body = (await request.json()) as { cycle?: string; readings?: ReadingInput[] };
  const cycle = String(body.cycle ?? "");
  if (!/^\d{6}$/.test(cycle)) return NextResponse.json({ error: "รอบบิลต้องเป็นตัวเลข 6 หลัก" }, { status: 400 });

  const inputs = (body.readings ?? []).filter((r) => r?.roomId);
  if (inputs.length === 0) return NextResponse.json({ error: "ไม่มีห้องที่จะออกบิล" }, { status: 400 });

  const [views, existing, readings] = await Promise.all([
    getRoomViews(propertyId),
    listBills(propertyId, { cycle }),
    listMeterReadings(propertyId),
  ]);

  const viewByRoom = new Map(views.map((v) => [v.room.id, v]));
  const billedRooms = new Set(existing.filter((b) => b.status !== "void").map((b) => b.roomId));

  const ops: WriteOp[] = [];
  const created: Array<{ roomNo: string; billNo: string; total: number }> = [];
  const skipped: string[] = [];

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
    if (billedRooms.has(room.id)) {
      skipped.push(`ห้อง ${room.roomNo}: ออกบิลรอบนี้ไปแล้ว`);
      continue;
    }

    const previous = lastReadingFor(readings, room.id, cycle);
    const elecPrevious = previous?.elecCurrent ?? 0;
    const waterPrevious = previous?.waterCurrent ?? 0;
    const elecCurrent = Number(input.elecCurrent);
    const waterCurrent = Number(input.waterCurrent);
    if (!Number.isFinite(elecCurrent) || !Number.isFinite(waterCurrent)) {
      skipped.push(`ห้อง ${room.roomNo}: เลขมิเตอร์ไม่ถูกต้อง`);
      continue;
    }

    // ยอดค้างจากบิลเก่ายกมาใส่บิลใหม่ ไม่ให้หนี้หาย
    const older = await listBills(propertyId, { roomId: room.id });
    const carryOver = older
      .filter((b) => b.cycle < cycle && b.status !== "void")
      .reduce((sum, b) => sum + b.balance, 0);

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

    const reading: MeterReading = {
      id: `MR-${cycle}-${room.roomNo}`,
      propertyId,
      roomId: room.id,
      cycle,
      elecPrevious, elecCurrent, waterPrevious, waterCurrent,
      readAt: issuedAt,
      readBy: user.email,
    };

    ops.push(
      { type: "set", collection: "meterReadings", id: reading.id, data: reading as unknown as Record<string, unknown> },
      { type: "set", collection: "bills", id: bill.id, data: bill as unknown as Record<string, unknown> },
    );
    created.push({ roomNo: room.roomNo, billNo, total: draft.total });
  }

  if (ops.length === 0) {
    return NextResponse.json({ error: "ไม่มีห้องที่ออกบิลได้", skipped }, { status: 400 });
  }

  await db().batch(ops);
  await audit(user, {
    propertyId,
    action: "bill.issue-batch",
    targetType: "cycle",
    targetId: cycle,
    before: { billsBefore: existing.length },
    after: { created: created.map((c) => c.billNo), skipped },
  });

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    total: created.reduce((s, c) => s + c.total, 0),
  });
}
