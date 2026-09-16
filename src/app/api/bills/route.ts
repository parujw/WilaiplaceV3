import { ApiError, handle, readJson, requestOrigin, requireEditor } from "@/lib/api";
import { normalizeLines, recalcTotals, type LineInput } from "@/lib/bill-edit";
import { dueDateFor } from "@/lib/billing";
import { db } from "@/lib/db";
import { audit, getProperty, getRoomViews, getTenant, nextBillNo } from "@/lib/repo";
import type { Bill } from "@/lib/types";

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

    await db().set("bills", bill.id, bill as unknown as Record<string, unknown>);
    await audit(user, {
      propertyId,
      action: "bill.create",
      targetType: "bill",
      targetId: bill.id,
      before: null,
      after: { roomNo: bill.roomNo, total: bill.total, cycle, lines: lines.map((l) => l.label) },
    });

    return { ok: true, billId: bill.id, billNo, total: bill.total, origin: requestOrigin(request) };
  });
}
