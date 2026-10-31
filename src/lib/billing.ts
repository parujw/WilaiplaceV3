/**
 * คำนวณบิล — ไม่แตะฐานข้อมูล รับ input ออก output เท่านั้น
 * ทุกอย่างในไฟล์นี้ทดสอบได้ด้วย vitest
 */

import type { Bill, BillLine, Cycle, Lease, MeterReading } from "./types";

export interface BillInput {
  lease: Pick<Lease, "rent" | "rates" | "dueDay">;
  elecPrevious: number;
  elecCurrent: number;
  waterPrevious: number;
  waterCurrent: number;
  /** ยอดค้างจากบิลก่อนหน้า */
  carryOver?: number;
  discount?: number;
  extras?: Array<{ label: string; amount: number }>;
}

export interface BillDraft {
  lines: BillLine[];
  total: number;
}

/** มิเตอร์ขึ้นรอบใหม่ (เช่น 9998 → 0012) ต้องไม่คิดติดลบ */
export function meterUnits(previous: number, current: number, digits = 5): number {
  if (current >= previous) return current - previous;
  const rollover = 10 ** digits;
  const units = current + rollover - previous;
  // ถ้าคิดแล้วยังดูไม่สมเหตุผล แปลว่าจดผิด ไม่ใช่หมุนรอบ
  return units > rollover / 2 ? 0 : units;
}

export interface MeterValues {
  elecPrevious: number;
  elecCurrent: number;
  waterPrevious: number;
  waterCurrent: number;
}

/** รายการค่าไฟค่าน้ำจากเลขมิเตอร์ — ไม่ได้ใช้เลย (0 หน่วย) ก็ไม่ใส่รายการ */
export function meterLines(meter: MeterValues, rates: Pick<Lease["rates"], "elec" | "water">): BillLine[] {
  const lines: BillLine[] = [];
  const elecUnits = meterUnits(meter.elecPrevious, meter.elecCurrent);
  if (elecUnits > 0) {
    lines.push({
      type: "electricity",
      label: `ค่าไฟ (${meter.elecPrevious} → ${meter.elecCurrent})`,
      qty: elecUnits,
      rate: rates.elec,
      amount: elecUnits * rates.elec,
    });
  }
  const waterUnits = meterUnits(meter.waterPrevious, meter.waterCurrent);
  if (waterUnits > 0) {
    lines.push({
      type: "water",
      label: `ค่าน้ำ (${meter.waterPrevious} → ${meter.waterCurrent})`,
      qty: waterUnits,
      rate: rates.water,
      amount: waterUnits * rates.water,
    });
  }
  return lines;
}

/**
 * จดมิเตอร์ใหม่หลังออกบิลไปแล้ว — เปลี่ยนเฉพาะรายการค่าไฟค่าน้ำ รายการอื่นคงเดิม
 *
 * บิลกับเลขมิเตอร์ต้องตรงกันเสมอ เลขของรอบนี้คือเลขครั้งก่อนของรอบหน้า
 * แก้เลขแล้วไม่แก้บิล หน่วยที่ต่างกันจะหายไปหรือถูกคิดซ้ำในบิลเดือนหน้า
 *
 * ค่าต่อหน่วยใช้ของที่อยู่ในบิลเดิม ถ้าแก้ราคาในบิลไว้เองก็ไม่โดนทับ
 * บิลเดิมไม่มีรายการไฟหรือน้ำ (เดือนก่อนไม่ได้ใช้) จึงใช้ค่าของสัญญา
 * รายการใหม่ใส่ที่เดิม หรือต่อท้ายค่าเช่าถ้าบิลเดิมไม่มี ลำดับบนใบแจ้งหนี้ไม่กระโดด
 */
export function withMeterLines(
  lines: BillLine[],
  meter: MeterValues,
  leaseRates: Pick<Lease["rates"], "elec" | "water">,
): BillLine[] {
  const isMeter = (l: BillLine) => l.type === "electricity" || l.type === "water";
  const rates = {
    elec: lines.find((l) => l.type === "electricity")?.rate ?? leaseRates.elec,
    water: lines.find((l) => l.type === "water")?.rate ?? leaseRates.water,
  };

  const firstMeter = lines.findIndex(isMeter);
  const rentIndex = lines.findIndex((l) => l.type === "rent");
  const at = firstMeter >= 0 ? firstMeter : rentIndex + 1;

  const kept = lines.filter((l) => !isMeter(l));
  // ตำแหน่งที่จะแทรกในรายการที่ตัดค่าไฟค่าน้ำออกแล้ว — นับเฉพาะรายการที่อยู่ก่อนหน้า
  const insertAt = lines.slice(0, at).filter((l) => !isMeter(l)).length;
  return [...kept.slice(0, insertAt), ...meterLines(meter, rates), ...kept.slice(insertAt)];
}

export function buildBill(input: BillInput): BillDraft {
  const { lease } = input;
  const lines: BillLine[] = [];

  lines.push({ type: "rent", label: "ค่าเช่าห้อง", qty: 1, rate: lease.rent, amount: lease.rent });

  lines.push(...meterLines(input, lease.rates));

  if (lease.rates.ac > 0)
    lines.push({ type: "ac", label: "ค่าเช่าแอร์", qty: 1, rate: lease.rates.ac, amount: lease.rates.ac });
  if (lease.rates.internet > 0)
    lines.push({
      type: "internet", label: "ค่าอินเทอร์เน็ต", qty: 1,
      rate: lease.rates.internet, amount: lease.rates.internet,
    });
  if (lease.rates.parking > 0)
    lines.push({
      type: "parking", label: "ค่าที่จอดรถ", qty: 1,
      rate: lease.rates.parking, amount: lease.rates.parking,
    });

  for (const extra of input.extras ?? []) {
    if (extra.amount === 0) continue;
    lines.push({ type: "other", label: extra.label, qty: 1, rate: extra.amount, amount: extra.amount });
  }

  if (input.carryOver && input.carryOver > 0)
    lines.push({
      type: "carryOver", label: "ยอดค้างยกมา", qty: 1,
      rate: input.carryOver, amount: input.carryOver,
    });

  if (input.discount && input.discount > 0)
    lines.push({ type: "discount", label: "ส่วนลด", qty: 1, rate: -input.discount, amount: -input.discount });

  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

/** "202609" → "202610" */
export function nextCycle(cycle: Cycle): Cycle {
  const year = Number(cycle.slice(0, 4));
  const month = Number(cycle.slice(4, 6));
  return month === 12 ? `${year + 1}01` : `${year}${String(month + 1).padStart(2, "0")}`;
}

export function previousCycle(cycle: Cycle): Cycle {
  const year = Number(cycle.slice(0, 4));
  const month = Number(cycle.slice(4, 6));
  return month === 1 ? `${year - 1}12` : `${year}${String(month - 1).padStart(2, "0")}`;
}

export function currentCycle(now = new Date()): Cycle {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** วันครบกำหนดของรอบบิล = วันที่ dueDay ของเดือนถัดจากรอบบิล */
export function dueDateFor(cycle: Cycle, dueDay: number): string {
  const next = nextCycle(cycle);
  const year = next.slice(0, 4);
  const month = next.slice(4, 6);
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const day = Math.min(Math.max(dueDay, 1), lastDay);
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

/** อายุหนี้เป็นวัน — ใช้แยกกลุ่มยอดค้างในหน้าหลัก */
export function daysOverdue(dueDate: string, today = new Date()): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const ms = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function agingBucket(days: number): "current" | "1-30" | "31-60" | "60+" {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  return "60+";
}

/**
 * ห้องนี้ออกบิลค่าเช่าของรอบนี้ไปแล้วหรือยัง
 *
 * ดูที่ "มีรายการค่าเช่าอยู่ในบิล" ไม่ใช่ "มีบิลของรอบนี้"
 * เพราะบิลที่ไม่มีค่าเช่ามีอยู่จริงและไม่ควรบล็อกบิลค่าเช่า เช่น
 *   เก็บค่ามัดจำตอนจอง แล้วค่อยออกบิลค่าเช่าปลายเดือน
 *   ออกบิลค่าซ่อมของเสียหายแยกใบ
 * ของเดิมนับทุกใบ พอออกบิลมัดจำไปแล้วห้องนั้นจะออกบิลค่าเช่าไม่ได้ทั้งเดือน
 */
export function hasRentBill(bills: Bill[], roomId: string, cycle: Cycle): boolean {
  return bills.some(
    (b) =>
      b.roomId === roomId &&
      b.cycle === cycle &&
      b.status !== "void" &&
      b.lines.some((l) => l.type === "rent"),
  );
}

export function lastReadingFor(readings: MeterReading[], roomId: string, beforeCycle: Cycle): MeterReading | null {
  const candidates = readings
    .filter((r) => r.roomId === roomId && r.cycle < beforeCycle)
    .sort((a, b) => b.cycle.localeCompare(a.cycle));
  return candidates[0] ?? null;
}
