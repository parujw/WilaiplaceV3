/**
 * แก้บิลที่ออกไปแล้ว — คำนวณล้วน ไม่แตะฐานข้อมูล
 *
 * บิลที่ออกผิดมีสองแบบ และต้องจัดการคนละทาง
 *   ตัวเลขผิด  (จดมิเตอร์ผิด ลืมส่วนลด)  → แก้รายการในบิลเดิม เลขที่บิลคงเดิม
 *   ไม่ควรมีบิลนี้ (ออกซ้ำ ห้องว่าง)      → ยกเลิกหรือลบทิ้ง (ดู bill-remove.ts)
 *
 * ห้ามแก้ยอดรวมให้ต่ำกว่าที่รับเงินมาแล้ว ไม่งั้นบิลจะค้างติดลบ
 * ถ้าเก็บเกินจริงต้องลบใบเสร็จที่รับเกินก่อน แล้วค่อยแก้ยอด
 */

import type { Bill, BillLine, BillLineType, BillStatus } from "./types";

/** ประเภทที่ให้เลือกได้ในหน้าแก้บิล — carryOver ไม่อยู่ในนี้เพราะระบบคำนวณเองตอนออกบิล */
export const EDITABLE_LINE_TYPES: BillLineType[] = [
  "rent", "electricity", "water", "ac", "internet", "parking", "deposit", "other", "carryOver", "discount",
];

export const LINE_TYPE_LABEL: Record<BillLineType, string> = {
  rent: "ค่าเช่าห้อง",
  electricity: "ค่าไฟ",
  water: "ค่าน้ำ",
  ac: "ค่าเช่าแอร์",
  internet: "ค่าอินเทอร์เน็ต",
  parking: "ค่าที่จอดรถ",
  deposit: "เงินประกัน",
  other: "อื่นๆ",
  carryOver: "ยอดค้างยกมา",
  discount: "ส่วนลด",
};

export interface LineInput {
  type: string;
  label: string;
  qty: number | string;
  rate: number | string;
}

/** ปัดทศนิยม 2 ตำแหน่ง — คูณกันแล้วได้ 936.0000000001 ไม่ควรหลุดไปถึงใบแจ้งหนี้ */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class BillEditError extends Error {}

/**
 * แปลงรายการที่กรอกในหน้าจอเป็น BillLine ที่เก็บได้
 * ส่วนลดเก็บเป็นค่าติดลบเสมอ ไม่ว่าคนกรอกจะใส่เครื่องหมายลบมาหรือไม่
 */
export function normalizeLines(input: LineInput[]): BillLine[] {
  const lines: BillLine[] = [];

  for (const raw of input) {
    const label = String(raw.label ?? "").trim();
    const type = (EDITABLE_LINE_TYPES as string[]).includes(raw.type)
      ? (raw.type as BillLineType)
      : "other";
    const qty = Number(raw.qty);
    const rate = Number(raw.rate);

    if (!label) throw new BillEditError("ทุกรายการต้องมีชื่อรายการ");
    if (!Number.isFinite(qty) || !Number.isFinite(rate)) {
      throw new BillEditError(`รายการ "${label}" กรอกตัวเลขไม่ถูกต้อง`);
    }
    if (qty < 0) throw new BillEditError(`รายการ "${label}" จำนวนติดลบไม่ได้`);

    // ส่วนลดจะกรอก 200 หรือ -200 ก็ได้ ระบบบังคับให้เป็นลบเอง
    const signedRate = type === "discount" ? -Math.abs(rate) : rate;
    lines.push({ type, label, qty: round2(qty), rate: round2(signedRate), amount: round2(qty * signedRate) });
  }

  if (lines.length === 0) throw new BillEditError("บิลต้องมีอย่างน้อย 1 รายการ");
  return lines;
}

export interface BillTotals {
  total: number;
  balance: number;
  status: BillStatus;
}

/**
 * ยอดรวมและสถานะใหม่หลังแก้รายการ
 * paid มาจากใบเสร็จที่ออกไปแล้ว ห้ามเปลี่ยนจากหน้าแก้บิล
 */
export function recalcTotals(lines: BillLine[], paid: number): BillTotals {
  const total = round2(lines.reduce((sum, l) => sum + l.amount, 0));

  if (total < 0) throw new BillEditError("ยอดรวมติดลบไม่ได้ ตรวจส่วนลดอีกครั้ง");
  if (total < paid) {
    throw new BillEditError(
      `ยอดรวมใหม่ (${total.toLocaleString("th-TH")}) ต่ำกว่ายอดที่รับชำระไปแล้ว (${paid.toLocaleString("th-TH")}) ` +
        "ถ้ารับเงินเกินต้องลบใบเสร็จที่รับเกินก่อน",
    );
  }

  const balance = round2(total - paid);
  const status: BillStatus = balance <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  return { total, balance, status };
}

/** ส่วนของบิลที่หน้าแก้บิลเปลี่ยนได้ — เขียนทับทั้งชุดเพื่อไม่ให้ยอดกับรายการหลุดจากกัน */
export function billEditPatch(
  bill: Pick<Bill, "paid" | "status">,
  input: { lines: LineInput[]; dueDate?: string; note?: string },
): Record<string, unknown> {
  if (bill.status === "void") throw new BillEditError("บิลนี้ยกเลิกไปแล้ว แก้ไม่ได้");

  const lines = normalizeLines(input.lines);
  const totals = recalcTotals(lines, bill.paid);

  const patch: Record<string, unknown> = { lines, ...totals };
  if (input.dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new BillEditError("วันครบกำหนดต้องเป็นรูปแบบ YYYY-MM-DD");
    patch.dueDate = input.dueDate;
  }
  // ลบหมายเหตุออกได้ด้วยการส่งค่าว่างมา
  if (input.note !== undefined) patch.note = input.note.trim();
  return patch;
}
