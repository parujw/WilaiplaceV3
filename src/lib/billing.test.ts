import { describe, expect, it } from "vitest";
import type { Bill } from "./types";
import { agingBucket, buildBill, dueDateFor, meterUnits, nextCycle, previousCycle, hasRentBill } from "./billing";

const lease = {
  rent: 3500,
  dueDay: 5,
  rates: { elec: 8, water: 20, ac: 500, internet: 0, parking: 0 },
};

describe("meterUnits", () => {
  it("คิดผลต่างปกติ", () => expect(meterUnits(1025, 1142)).toBe(117));
  it("จดเท่าเดิมได้ 0", () => expect(meterUnits(500, 500)).toBe(0));
  it("มิเตอร์หมุนครบรอบไม่คิดติดลบ", () => expect(meterUnits(99_980, 20, 5)).toBe(40));
  it("จดผิด (ตัวเลขลดฮวบ) คืน 0 แทนที่จะคิดเงินมหาศาล", () => expect(meterUnits(9000, 10, 5)).toBe(0));
});

describe("buildBill", () => {
  it("รวมค่าเช่า ค่าไฟ ค่าน้ำ ค่าแอร์", () => {
    const { lines, total } = buildBill({
      lease, elecPrevious: 7639, elecCurrent: 7695, waterPrevious: 0, waterCurrent: 7,
    });
    expect(lines.map((l) => l.type)).toEqual(["rent", "electricity", "water", "ac"]);
    expect(total).toBe(3500 + 56 * 8 + 7 * 20 + 500);
    expect(total).toBe(4588); // ตรงกับบิล BILL-202609-0021 ของ V2
  });

  it("ไม่ออกรายการค่าไฟถ้าหน่วยเป็น 0", () => {
    const { lines } = buildBill({
      lease, elecPrevious: 100, elecCurrent: 100, waterPrevious: 0, waterCurrent: 0,
    });
    expect(lines.some((l) => l.type === "electricity")).toBe(false);
  });

  it("ส่วนลดหักออกจากยอดรวม", () => {
    const { total } = buildBill({
      lease: { ...lease, rent: 4000, rates: { ...lease.rates, ac: 0 } },
      elecPrevious: 1161, elecCurrent: 1236, waterPrevious: 0, waterCurrent: 4, discount: 500,
    });
    expect(total).toBe(4180); // ตรงกับบิล BILL-202608-0017 ของ V2
  });

  it("ยอดค้างยกมาเข้าไปในบิลใหม่", () => {
    const { total } = buildBill({
      lease: { ...lease, rates: { ...lease.rates, ac: 0 } },
      elecPrevious: 0, elecCurrent: 0, waterPrevious: 0, waterCurrent: 0, carryOver: 1200,
    });
    expect(total).toBe(4700);
  });
});

describe("cycle", () => {
  it("ข้ามปีได้", () => {
    expect(nextCycle("202612")).toBe("202701");
    expect(previousCycle("202701")).toBe("202612");
  });
  it("คืนค่าเป็น string 6 หลักเสมอ", () => {
    expect(nextCycle("202609")).toBe("202610");
    expect(nextCycle("202609")).toHaveLength(6);
  });
});

describe("dueDateFor", () => {
  it("ครบกำหนดวันที่ 5 ของเดือนถัดไป", () => expect(dueDateFor("202609", 5)).toBe("2026-10-05"));
  it("ข้ามปี", () => expect(dueDateFor("202612", 5)).toBe("2027-01-05"));
  it("ไม่เกินวันสุดท้ายของเดือน", () => expect(dueDateFor("202601", 31)).toBe("2026-02-28"));
});

describe("agingBucket", () => {
  it("แยกกลุ่มตามอายุหนี้", () => {
    expect(agingBucket(0)).toBe("current");
    expect(agingBucket(15)).toBe("1-30");
    expect(agingBucket(45)).toBe("31-60");
    expect(agingBucket(90)).toBe("60+");
  });
});


describe("hasRentBill", () => {
  const bill = (over: Partial<Bill> = {}): Bill => ({
    id: "B1", propertyId: "wlp1", billNo: "BILL-202609-0001", invoiceNo: "INV-202609-0001",
    cycle: "202609", roomId: "wlp1-101", roomNo: "101", leaseId: "L1",
    tenantSnapshot: { tenantId: "T1", name: "ผู้เช่า", phone: "" },
    lines: [{ type: "rent", label: "ค่าเช่าห้อง", qty: 1, rate: 3000, amount: 3000 }],
    total: 3000, paid: 0, balance: 3000, status: "unpaid",
    issuedAt: "2026-09-25", dueDate: "2026-10-05", sentToLineAt: null, ...over,
  });

  const deposit = (over: Partial<Bill> = {}) =>
    bill({ id: "B2", lines: [{ type: "deposit", label: "ค่ามัดจำ", qty: 1, rate: 5000, amount: 5000 }], ...over });

  it("มีบิลค่าเช่าของรอบนั้นแล้ว", () => {
    expect(hasRentBill([bill()], "wlp1-101", "202609")).toBe(true);
  });

  it("บิลมัดจำไม่นับเป็นบิลค่าเช่า — เคสที่เคยทำให้ออกบิลค่าเช่าไม่ได้ทั้งเดือน", () => {
    expect(hasRentBill([deposit()], "wlp1-101", "202609")).toBe(false);
  });

  it("มีทั้งบิลมัดจำและบิลค่าเช่า = ออกแล้ว", () => {
    expect(hasRentBill([deposit(), bill()], "wlp1-101", "202609")).toBe(true);
  });

  it("บิลที่ยกเลิกแล้วไม่นับ", () => {
    expect(hasRentBill([bill({ status: "void" })], "wlp1-101", "202609")).toBe(false);
  });

  it("คนละห้องหรือคนละรอบไม่นับ", () => {
    expect(hasRentBill([bill()], "wlp1-102", "202609")).toBe(false);
    expect(hasRentBill([bill()], "wlp1-101", "202608")).toBe(false);
  });
});
