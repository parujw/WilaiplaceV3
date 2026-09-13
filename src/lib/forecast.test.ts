import { describe, expect, it } from "vitest";
import {
  actualsByCycle, collectionRate, expirySchedule, projectYears, recurringMonthly, rentBand, vacancyLoss,
} from "./forecast";
import type { Bill, Lease, Rates, Room } from "./types";

const RATES: Rates = { elec: 8, water: 20, ac: 500, internet: 0, parking: 0 };

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: "L-T0001", propertyId: "wlp1", roomId: "wlp1-101", tenantId: "T0001", status: "active",
  startDate: "2026-01-01", endDate: null, rent: 3200, deposit: 0, advance: 0,
  rates: RATES, dueDay: 5, depositRefund: null, ...over,
});

const room = (over: Partial<Room> = {}): Room => ({
  id: "wlp1-101", propertyId: "wlp1", roomNo: "101", floor: 1, type: "รายเดือน",
  baseRent: 3200, condition: "ready", activeLeaseId: "L-T0001", ...over,
});

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: "B1", propertyId: "wlp1", billNo: "BILL-202608-0001", invoiceNo: "INV-202608-0001",
  cycle: "202608", roomId: "wlp1-101", roomNo: "101", leaseId: "L-T0001",
  tenantSnapshot: { tenantId: "T0001", name: "ผู้เช่า", phone: "" },
  lines: [], total: 1000, paid: 1000, balance: 0, status: "paid",
  issuedAt: "2026-08-31", dueDate: "2026-09-05", sentToLineAt: null, ...over,
});

describe("recurringMonthly", () => {
  it("นับเฉพาะสัญญาที่เดินอยู่", () => {
    const r = recurringMonthly([lease(), lease({ id: "L2", status: "ended", rent: 9999 })]);
    expect(r.leases).toBe(1);
    expect(r.rent).toBe(3200);
  });

  it("ค่าบริการรายเดือนนับรวม แต่ค่าน้ำค่าไฟไม่นับ เพราะเก็บแล้วจ่ายต่อ", () => {
    const r = recurringMonthly([lease({ rates: { ...RATES, ac: 500, internet: 300, parking: 200 } })]);
    expect(r.services).toBe(1000);
    expect(r.total).toBe(4200);
  });
});

describe("vacancyLoss", () => {
  it("คิดจากราคาป้ายของห้องที่ยังว่าง", () => {
    const r = vacancyLoss([room(), room({ id: "r2", activeLeaseId: null, baseRent: 2600 })]);
    expect(r).toEqual({ rooms: 1, monthly: 2600, yearly: 31200 });
  });
});

describe("collectionRate", () => {
  it("เก็บได้ครบ = 1", () => {
    expect(collectionRate([bill()])).toBe(1);
  });

  it("บิลที่ยกเลิกไม่นับทั้งฝั่งออกและฝั่งเก็บ", () => {
    const rate = collectionRate([bill(), bill({ id: "B2", status: "void", total: 5000, paid: 0 })]);
    expect(rate).toBe(1);
  });

  it("ยังไม่มีบิลเลยคืน null ไม่ใช่ 0 — ยังไม่รู้ กับ เก็บไม่ได้เลย คนละเรื่อง", () => {
    expect(collectionRate([])).toBeNull();
    expect(collectionRate([bill({ status: "void" })])).toBeNull();
  });
});

describe("projectYears", () => {
  const base = { occupancy: 1, collection: 1, rentIncrease: 0, years: 5 };

  it("เต็มทุกห้องเก็บครบ = รายเดือน × 12 ทุกปี", () => {
    const rows = projectYears(10_000, base, 2026);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ year: 2026, buddhistYear: 2569, potential: 120_000, expected: 120_000, gap: 0 });
    expect(rows[4].expected).toBe(120_000);
  });

  it("ห้องว่างกับเก็บเงินไม่ได้ ทบกัน", () => {
    const [first] = projectYears(10_000, { ...base, occupancy: 0.8, collection: 0.9 }, 2026);
    expect(first.expected).toBe(86_400);
    expect(first.gap).toBe(33_600);
  });

  it("ขึ้นค่าเช่าทบต้นปีต่อปี ปีแรกยังไม่ขึ้น", () => {
    const rows = projectYears(10_000, { ...base, rentIncrease: 0.05 }, 2026);
    expect(rows[0].potential).toBe(120_000);
    expect(rows[1].potential).toBe(126_000);
    expect(rows[2].potential).toBe(132_300);
  });

  it("สมมติฐานเกินช่วงที่เป็นไปได้ถูกบีบกลับ ไม่ใช่ปล่อยให้ตัวเลขเพี้ยน", () => {
    const [row] = projectYears(10_000, { occupancy: 5, collection: -1, rentIncrease: 0, years: 1 });
    expect(row.expected).toBe(0);
  });

  it("จำนวนปีอยู่ในช่วง 1-10 เสมอ", () => {
    expect(projectYears(1, { ...base, years: 0 })).toHaveLength(1);
    expect(projectYears(1, { ...base, years: 99 })).toHaveLength(10);
  });
});

describe("expirySchedule", () => {
  it("จัดกลุ่มตามปีที่หมดอายุ พร้อมรายได้ที่ผูกอยู่", () => {
    const rows = expirySchedule([
      lease({ id: "a", endDate: "2027-03-31", rent: 3000 }),
      lease({ id: "b", endDate: "2027-08-31", rent: 4000 }),
      lease({ id: "c", endDate: "2028-01-31", rent: 5000 }),
    ]);
    expect(rows[0]).toEqual({ buddhistYear: 2570, leases: 2, monthly: 7000 });
    expect(rows[1]).toEqual({ buddhistYear: 2571, leases: 1, monthly: 5000 });
  });

  it("สัญญาไม่ระบุวันสิ้นสุดแยกเป็นกลุ่มของตัวเองและอยู่ท้ายสุด", () => {
    const rows = expirySchedule([lease({ id: "a", endDate: null }), lease({ id: "b", endDate: "2027-01-01" })]);
    expect(rows.at(-1)?.buddhistYear).toBeNull();
  });

  it("สัญญาที่จบไปแล้วไม่นับ", () => {
    expect(expirySchedule([lease({ status: "ended", endDate: "2026-01-01" })])).toHaveLength(0);
  });
});

describe("rentBand", () => {
  it("ค่าเช่าเฉลี่ยต่อห้องทั้งหมดต่ำกว่าค่าเฉลี่ยของสัญญา เพราะห้องว่างถ่วงลง", () => {
    const band = rentBand([lease({ rent: 3000 }), lease({ id: "b", rent: 5000 })], 4);
    expect(band).toEqual({ min: 3000, max: 5000, average: 4000, perRoom: 2000 });
  });

  it("ไม่มีสัญญาเลยคืน null", () => {
    expect(rentBand([], 10)).toBeNull();
  });
});

describe("actualsByCycle", () => {
  it("รวมยอดตามรอบ เรียงเก่าไปใหม่ และข้ามบิลที่ยกเลิก", () => {
    const rows = actualsByCycle([
      bill({ id: "1", cycle: "202609", total: 100, paid: 50 }),
      bill({ id: "2", cycle: "202608", total: 200, paid: 200 }),
      bill({ id: "3", cycle: "202609", total: 300, paid: 0, status: "void" }),
    ]);
    expect(rows).toEqual([
      { cycle: "202608", billed: 200, collected: 200 },
      { cycle: "202609", billed: 100, collected: 50 },
    ]);
  });
});
