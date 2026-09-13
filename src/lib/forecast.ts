/**
 * ข้อมูลบริหารห้องพักและประมาณการรายได้ 1-5 ปี — คำนวณล้วน ไม่แตะฐานข้อมูล
 *
 * ตั้งต้นจาก "สัญญาที่เดินอยู่" ไม่ใช่ "ประวัติบิล" โดยตั้งใจ
 * ประวัติบิลที่ย้ายมาจาก V2 มีอยู่สองรอบ ลากเส้นแนวโน้มจากสองจุดแล้วทายไปห้าปี
 * ได้ตัวเลขที่ดูน่าเชื่อแต่ไม่มีอะไรรองรับ ส่วนสัญญาบอกรายได้ประจำที่ผูกไว้จริง
 *
 * ค่าน้ำค่าไฟไม่นับเป็นรายได้ เพราะเก็บจากผู้เช่าแล้วจ่ายการไฟฟ้า/ประปาต่อ
 * ผ่านมือเฉยๆ นับรวมเมื่อไหร่ตัวเลขรายได้จะพองโดยไม่มีกำไรเพิ่ม
 * นับเฉพาะค่าเช่ากับค่าบริการรายเดือนที่เก็บคงที่ (แอร์ เน็ต ที่จอดรถ)
 *
 * ทุกฟังก์ชันรับ input ออก output ทดสอบได้ด้วย vitest
 */

import type { Bill, Cycle, Lease, Room } from "./types";

/* ------------------------------ รายได้ประจำ ------------------------------ */

export interface RecurringIncome {
  /** ค่าเช่าห้องรวมต่อเดือน */
  rent: number;
  /** ค่าบริการรายเดือนที่เก็บคงที่ — แอร์ เน็ต ที่จอดรถ */
  services: number;
  total: number;
  /** จำนวนสัญญาที่นับรวม */
  leases: number;
}

/** รายได้ประจำต่อเดือนจากสัญญาที่ยังเดินอยู่ */
export function recurringMonthly(leases: Lease[]): RecurringIncome {
  const active = leases.filter((l) => l.status === "active");
  const rent = active.reduce((sum, l) => sum + l.rent, 0);
  const services = active.reduce((sum, l) => sum + l.rates.ac + l.rates.internet + l.rates.parking, 0);
  return { rent, services, total: rent + services, leases: active.length };
}

/** รายได้ที่เสียไปเพราะห้องยังว่าง คิดจากราคาป้ายของห้องนั้น */
export function vacancyLoss(rooms: Room[]): { rooms: number; monthly: number; yearly: number } {
  const vacant = rooms.filter((r) => !r.activeLeaseId);
  const monthly = vacant.reduce((sum, r) => sum + r.baseRent, 0);
  return { rooms: vacant.length, monthly, yearly: monthly * 12 };
}

/* ------------------------------ อัตราเก็บเงิน ----------------------------- */

/**
 * เก็บเงินได้จริงกี่เปอร์เซ็นต์จากที่ออกบิลไป
 * ไม่มีบิลเลยคืน null ไม่ใช่ 0 หรือ 1 — "ยังไม่รู้" กับ "เก็บไม่ได้เลย" คนละเรื่อง
 */
export function collectionRate(bills: Bill[]): number | null {
  const live = bills.filter((b) => b.status !== "void");
  const billed = live.reduce((sum, b) => sum + b.total, 0);
  if (billed <= 0) return null;
  return live.reduce((sum, b) => sum + b.paid, 0) / billed;
}

/* ------------------------------ ประมาณการปี ------------------------------ */

export interface Assumptions {
  /** สัดส่วนห้องที่มีคนอยู่ 0-1 */
  occupancy: number;
  /** เก็บเงินได้จริง 0-1 */
  collection: number;
  /** ขึ้นค่าเช่าต่อปี 0-1 เช่น 0.03 = 3% */
  rentIncrease: number;
  years: number;
}

export interface YearProjection {
  /** ปี ค.ศ. */
  year: number;
  /** ปี พ.ศ. สำหรับแสดงผล */
  buddhistYear: number;
  /** เต็มทุกห้อง เก็บได้ครบ */
  potential: number;
  /** หลังหักห้องว่างและเก็บไม่ได้ */
  expected: number;
  /** ส่วนต่างระหว่างสองอันบน */
  gap: number;
}

export const DEFAULT_ASSUMPTIONS: Omit<Assumptions, "occupancy" | "collection"> = {
  rentIncrease: 0,
  years: 5,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * ประมาณการรายได้รายปี
 *
 * potential = ถ้าทุกห้องมีคนอยู่ในราคาปัจจุบัน และเก็บเงินได้ครบทุกบาท
 * expected  = potential × อัตราเข้าอยู่ × อัตราเก็บเงินได้
 *
 * คิดแบบง่ายด้วยความตั้งใจ: ตัวเลขนี้ใช้ตัดสินใจว่าจะขึ้นค่าเช่าหรือลงทุนซ่อมไหม
 * ไม่ใช่งบการเงิน แบบจำลองที่ซับซ้อนกว่านี้จะซ่อนสมมติฐานจนตรวจไม่ได้ว่าเชื่อได้แค่ไหน
 */
export function projectYears(
  fullOccupancyMonthly: number,
  assumptions: Assumptions,
  startYear = new Date().getFullYear(),
): YearProjection[] {
  const occupancy = clamp01(assumptions.occupancy);
  const collection = clamp01(assumptions.collection);
  const growth = Number.isFinite(assumptions.rentIncrease) ? assumptions.rentIncrease : 0;
  const years = Math.min(10, Math.max(1, Math.round(assumptions.years)));

  return Array.from({ length: years }, (_, i) => {
    const potential = fullOccupancyMonthly * 12 * (1 + growth) ** i;
    const expected = potential * occupancy * collection;
    return {
      year: startYear + i,
      buddhistYear: startYear + i + 543,
      potential: Math.round(potential),
      expected: Math.round(expected),
      gap: Math.round(potential - expected),
    };
  });
}

/* ----------------------------- สัญญาหมดอายุ ----------------------------- */

export interface ExpiryBucket {
  /** ปี พ.ศ. หรือ null = สัญญาไม่ระบุวันสิ้นสุด */
  buddhistYear: number | null;
  leases: number;
  /** รายได้ต่อเดือนที่ผูกกับสัญญากลุ่มนี้ */
  monthly: number;
}

/**
 * สัญญาที่เดินอยู่จะหมดอายุปีไหนบ้าง — บอกว่ารายได้ก้อนไหนต้องต่อสัญญาเมื่อไหร่
 * สัญญาที่ไม่ระบุวันสิ้นสุดแยกไว้เป็นกลุ่มของตัวเอง ไม่ใช่เอาไปกองรวมกับปีปัจจุบัน
 */
export function expirySchedule(leases: Lease[]): ExpiryBucket[] {
  const buckets = new Map<number | null, ExpiryBucket>();

  for (const lease of leases.filter((l) => l.status === "active")) {
    const year = lease.endDate ? Number(lease.endDate.slice(0, 4)) + 543 : null;
    const key = Number.isFinite(year as number) ? year : null;
    const bucket = buckets.get(key) ?? { buddhistYear: key, leases: 0, monthly: 0 };
    bucket.leases += 1;
    bucket.monthly += lease.rent;
    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.buddhistYear === null) return 1;
    if (b.buddhistYear === null) return -1;
    return a.buddhistYear - b.buddhistYear;
  });
}

/* ------------------------------ ค่าเช่าต่อห้อง ----------------------------- */

export interface RentBand {
  min: number;
  max: number;
  average: number;
  /** ค่าเช่าเฉลี่ยต่อห้องทั้งหมด รวมห้องว่าง — บอกผลตอบแทนจริงของสินทรัพย์ */
  perRoom: number;
}

export function rentBand(leases: Lease[], roomCount: number): RentBand | null {
  const rents = leases.filter((l) => l.status === "active").map((l) => l.rent);
  if (rents.length === 0) return null;
  const sum = rents.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...rents),
    max: Math.max(...rents),
    average: Math.round(sum / rents.length),
    perRoom: roomCount > 0 ? Math.round(sum / roomCount) : 0,
  };
}

/* --------------------------- รายได้จริงย้อนหลัง --------------------------- */

export interface CycleActual {
  cycle: Cycle;
  billed: number;
  collected: number;
}

/** รายได้จริงที่เก็บได้แต่ละรอบ ใช้เทียบกับประมาณการว่าห่างกันแค่ไหน */
export function actualsByCycle(bills: Bill[]): CycleActual[] {
  const byCycle = new Map<Cycle, CycleActual>();
  for (const b of bills) {
    if (b.status === "void") continue;
    const row = byCycle.get(b.cycle) ?? { cycle: b.cycle, billed: 0, collected: 0 };
    row.billed += b.total;
    row.collected += b.paid;
    byCycle.set(b.cycle, row);
  }
  return [...byCycle.values()].sort((a, b) => a.cycle.localeCompare(b.cycle));
}
