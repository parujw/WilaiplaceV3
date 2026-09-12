/**
 * คำนวณบิล — ไม่แตะฐานข้อมูล รับ input ออก output เท่านั้น
 * ทุกอย่างในไฟล์นี้ทดสอบได้ด้วย vitest
 */

import type { BillLine, Cycle, Lease, MeterReading } from "./types";

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

export function buildBill(input: BillInput): BillDraft {
  const { lease } = input;
  const lines: BillLine[] = [];

  lines.push({ type: "rent", label: "ค่าเช่าห้อง", qty: 1, rate: lease.rent, amount: lease.rent });

  const elecUnits = meterUnits(input.elecPrevious, input.elecCurrent);
  if (elecUnits > 0) {
    lines.push({
      type: "electricity",
      label: `ค่าไฟ (${input.elecPrevious} → ${input.elecCurrent})`,
      qty: elecUnits,
      rate: lease.rates.elec,
      amount: elecUnits * lease.rates.elec,
    });
  }

  const waterUnits = meterUnits(input.waterPrevious, input.waterCurrent);
  if (waterUnits > 0) {
    lines.push({
      type: "water",
      label: `ค่าน้ำ (${input.waterPrevious} → ${input.waterCurrent})`,
      qty: waterUnits,
      rate: lease.rates.water,
      amount: waterUnits * lease.rates.water,
    });
  }

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

export function lastReadingFor(readings: MeterReading[], roomId: string, beforeCycle: Cycle): MeterReading | null {
  const candidates = readings
    .filter((r) => r.roomId === roomId && r.cycle < beforeCycle)
    .sort((a, b) => b.cycle.localeCompare(a.cycle));
  return candidates[0] ?? null;
}
