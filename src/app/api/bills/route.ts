import { ApiError, handle, readJson, requestOrigin, requireEditor } from "@/lib/api";
import { normalizeLines, recalcTotals, type LineInput } from "@/lib/bill-edit";
import { dueDateFor, type MeterValues } from "@/lib/billing";
import { db } from "@/lib/db";
import type { WriteOp } from "@/lib/db/store";
import { meterReadingId } from "@/lib/ids";
import { audit, getProperty, getRoomViews, getTenant, listBills, nextBillNo } from "@/lib/repo";
import type { Bill, MeterReading } from "@/lib/types";

/**
 * ออกบิลใบเดียวแบบกรอกรายการเอง
 *
 * คนละทางกับ /api/bills/issue-batch ที่ออกบิลค่าเช่าทั้งตึกจากเลขมิเตอร์
 * ทางนั้นทำเดือนละครั้งและคิดรายการให้เอง ส่วนทางนี้ไว้ออกใบที่ไม่เข้ารอบ เช่น
 *   ค่ามัดจำตอนจอง ที่เก็บก่อนผู้เช่าเข้าอยู่
 *   ค่าซ่อมของเสียหายที่เรียกเก็บแยกใบ
 *   ค่าปรับจ่ายช้า หรือบิลที่ตกหล่นย้อนหลัง
 *
 * ไม่บล็อกว่าห้องนี้มีบิลของรอบนี้แล้วหรือยัง เพราะใบพวกนี้ตั้งใจให้ออกซ้อนได้
 */
interface CreateBillBody {
  roomId?: string;
  /** ผู้เช่าที่จะให้ปรากฏบนใบ ไม่ส่งมาก็ใช้คนที่อยู่ห้องนั้นตอนนี้ */
  tenantId?: string | null;
  /** ใช้ตอนเก็บเงินคนที่ยังไม่ได้เป็นผู้เช่าในระบบ เช่น มัดจำตอนจอง */
  tenantName?: string;
  cycle?: string;
  dueDate?: string;
  note?: string;
  lines?: LineInput[];
  /** เลขมิเตอร์ที่กรอกในหน้าออกบิล — บันทึกเป็นการจดของรอบนี้ด้วย */
  meter?: Partial<Record<keyof MeterValues, number | string>>;
}

/** เลขมิเตอร์ครบสี่ตัวและไม่ติดลบ ไม่งั้นไม่บันทึก — ไม่เดาให้ */
function meterFrom(input: CreateBillBody["meter"]): MeterValues | null {
  if (!input) return null;
  const keys = ["elecPrevious", "elecCurrent", "waterPrevious", "waterCurrent"] as const;
  // ช่องว่างต้องไม่กลายเป็น 0 — Number("") คือ 0 ซึ่งจะได้บิลค่าไฟหลายพันหน่วย
  if (keys.some((k) => input[k] === undefined || input[k] === null || String(input[k]).trim() === "")) {
    throw new ApiError("เลขมิเตอร์ต้องกรอกครบทั้งไฟและน้ำ ทั้งครั้งก่อนและครั้งนี้");
  }
  const values = keys.map((k) => Number(input[k]));
  if (values.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new ApiError("เลขมิเตอร์ต้องเป็นตัวเลขไม่ติดลบ ครบทั้งไฟและน้ำ");
  }
  const [elecPrevious, elecCurrent, waterPrevious, waterCurrent] = values;
  return { elecPrevious, elecCurrent, waterPrevious, waterCurrent };
}

export async function POST(request: Request) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("ออกบิล");
    const body = await readJson<CreateBillBody>(request);

    if (!body.roomId) throw new ApiError("ไม่ได้ระบุห้อง");
    const cycle = String(body.cycle ?? "");
    if (!/^\d{6}$/.test(cycle)) throw new ApiError("รอบบิลต้องเป็นตัวเลข 6 หลัก");

    const views = await getRoomViews(propertyId);
    const view = views.find((v) => v.room.id === body.roomId);
    if (!view) throw new ApiError("ไม่พบห้องนี้", 404);

    /* --- ใบนี้ออกในชื่อใคร --- */
    let tenantId: string | null = null;
    let name = "";
    let phone = "";

    if (body.tenantId) {
      const tenant = await getTenant(body.tenantId);
      if (!tenant || tenant.propertyId !== propertyId) throw new ApiError("ไม่พบผู้เช่ารายนี้", 404);
      tenantId = tenant.id;
      name = tenant.name;
      phone = tenant.phone;
    } else if (body.tenantName?.trim()) {
      // คนที่ยังไม่มีในระบบ — เก็บแค่ชื่อไว้บนใบ ไม่สร้างผู้เช่าให้อัตโนมัติ
      name = body.tenantName.trim();
    } else if (view.tenant) {
      tenantId = view.tenant.id;
      name = view.tenant.name;
      phone = view.tenant.phone;
    } else {
      throw new ApiError("ห้องนี้ไม่มีผู้เช่าอยู่ ต้องระบุชื่อผู้รับบิล");
    }

    const lines = normalizeLines(body.lines ?? []);
    const totals = recalcTotals(lines, 0);
    if (totals.total <= 0) throw new ApiError("ยอดรวมต้องมากกว่า 0");

    const property = await getProperty(propertyId);
    const dueDay = view.lease?.dueDay ?? property?.paymentDueDay ?? 5;
    const dueDate = body.dueDate?.trim() || dueDateFor(cycle, dueDay);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new ApiError("วันครบกำหนดต้องเป็นรูปแบบ YYYY-MM-DD");

    const { billNo, invoiceNo } = await nextBillNo(cycle);
    const bill: Bill = {
      id: billNo,
      propertyId,
      billNo,
      invoiceNo,
      cycle,
      roomId: view.room.id,
      roomNo: view.room.roomNo,
      leaseId: view.lease?.id ?? null,
      tenantSnapshot: { tenantId, name, phone },
      lines,
      total: totals.total,
      paid: 0,
      balance: totals.total,
      status: "unpaid",
      issuedAt: new Date().toISOString().slice(0, 10),
      dueDate,
      sentToLineAt: null,
      ...(body.note?.trim() ? { note: body.note.trim() } : {}),
    };

    const ops: WriteOp[] = [
      { type: "set", collection: "bills", id: bill.id, data: bill as unknown as Record<string, unknown> },
    ];

    /*
     * เลขมิเตอร์ที่กรอกมา บันทึกเป็นการจดของรอบนี้ในคราวเดียวกับบิล
     * ยกเว้นรอบนี้มีบิลค่าเช่าอยู่แล้ว — เลขของรอบผูกกับบิลใบนั้น
     * เขียนทับตรงนี้แล้วบิลเดิมกับเลขมิเตอร์จะไม่ตรงกัน แก้เลขต้องไปที่หน้าจดมิเตอร์
     */
    const meter = meterFrom(body.meter);
    let meterSaved = false;
    if (meter && view.lease) {
      const hasRentBill = (await listBills(propertyId)).some(
        (b) => b.roomId === view.room.id && b.cycle === cycle && b.status !== "void" && b.lines.some((l) => l.type === "rent"),
      );
      if (!hasRentBill) {
        const reading: MeterReading = {
          id: meterReadingId(propertyId, cycle, view.room.roomNo),
          propertyId,
          roomId: view.room.id,
          cycle,
          ...meter,
          readAt: bill.issuedAt,
          readBy: user.email,
        };
        ops.push({ type: "set", collection: "meterReadings", id: reading.id, data: reading as unknown as Record<string, unknown> });
        meterSaved = true;
      }
    }

    await db().batch(ops);
    await audit(user, {
      propertyId,
      action: "bill.create",
      targetType: "bill",
      targetId: bill.id,
      before: null,
      after: { roomNo: bill.roomNo, total: bill.total, cycle, lines: lines.map((l) => l.label), meter: meterSaved ? meter : null },
    });

    return { ok: true, billId: bill.id, billNo, total: bill.total, meterSaved, origin: requestOrigin(request) };
  });
}
