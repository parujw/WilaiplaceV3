import { describe, expect, it } from "vitest";
import { revenueMix, utilityShare } from "./revenue-mix";
import type { Bill, BillLine } from "./types";

const line = (type: BillLine["type"], amount: number): BillLine => ({
  type, label: type, qty: 1, rate: amount, amount,
});

const bill = (lines: BillLine[], over: Partial<Bill> = {}): Bill => ({
  id: "B1", propertyId: "wlp1", billNo: "BILL-202609-0001", invoiceNo: "INV-202609-0001",
  cycle: "202609", roomId: "wlp1-101", roomNo: "101", leaseId: "L1",
  tenantSnapshot: { tenantId: "T1", name: "ผู้เช่า", phone: "" },
  lines, total: lines.reduce((s, l) => s + l.amount, 0), paid: 0, balance: 0, status: "unpaid",
  issuedAt: "2026-09-30", dueDate: "2026-10-05", sentToLineAt: null, ...over,
});

describe("revenueMix", () => {
  it("แยกรายได้ตามหมวดและคิดสัดส่วนให้", () => {
    const mix = revenueMix([bill([line("rent", 3000), line("electricity", 800), line("water", 200)])]);
    expect(mix.revenue).toBe(4000);
    expect(mix.slices.map((s) => [s.category, s.amount])).toEqual([
      ["rent", 3000], ["electricity", 800], ["water", 200],
    ]);
    expect(mix.slices[0].share).toBe(0.75);
  });

  it("ยอดค้างยกมาไม่นับเป็นรายได้ — ไม่งั้นเดือนที่คนค้างเยอะรายได้จะพองเป็นสองเท่า", () => {
    const mix = revenueMix([bill([line("rent", 3000), line("carryOver", 5000)])]);
    expect(mix.revenue).toBe(3000);
    expect(mix.carryOver).toBe(5000);
    expect(mix.slices.some((s) => s.amount === 5000)).toBe(false);
  });

  it("เงินประกันแยกออกจากรายได้ เพราะต้องคืนตอนย้ายออก", () => {
    const mix = revenueMix([bill([line("rent", 3000), line("deposit", 6000)])]);
    expect(mix.revenue).toBe(3000);
    expect(mix.deposit).toBe(6000);
    expect(mix.slices).toHaveLength(1);
  });

  it("ส่วนลดเป็นตัวหัก ไม่ใช่ชิ้นส่วนติดลบในสัดส่วน", () => {
    const mix = revenueMix([bill([line("rent", 3000), line("discount", -200)])]);
    expect(mix.revenue).toBe(3000);
    expect(mix.discount).toBe(200);
    expect(mix.slices.every((s) => s.amount > 0)).toBe(true);
  });

  it("เน็ตกับที่จอดรถกองรวมเป็นอื่นๆ", () => {
    const mix = revenueMix([bill([line("internet", 300), line("parking", 200), line("other", 100)])]);
    expect(mix.slices).toEqual([
      { category: "other", label: "อื่นๆ", amount: 600, share: 1 },
    ]);
  });

  it("เรียงจากมากไปน้อย และตัดหมวดที่เป็นศูนย์ทิ้ง", () => {
    const mix = revenueMix([bill([line("water", 100), line("rent", 5000), line("ac", 500)])]);
    expect(mix.slices.map((s) => s.category)).toEqual(["rent", "ac", "water"]);
  });

  it("บิลที่ยกเลิกไม่นับ", () => {
    const mix = revenueMix([bill([line("rent", 3000)], { status: "void" })]);
    expect(mix.revenue).toBe(0);
    expect(mix.bills).toBe(0);
  });

  it("กรองเฉพาะรอบที่เลือกได้", () => {
    const bills = [
      bill([line("rent", 3000)], { id: "a", cycle: "202608" }),
      bill([line("rent", 4000)], { id: "b", cycle: "202609" }),
    ];
    expect(revenueMix(bills, "202609").revenue).toBe(4000);
    expect(revenueMix(bills).revenue).toBe(7000);
  });

  it("ไม่มีบิลเลยต้องไม่หารด้วยศูนย์", () => {
    const mix = revenueMix([]);
    expect(mix).toMatchObject({ revenue: 0, deposit: 0, discount: 0, carryOver: 0, bills: 0 });
    expect(mix.slices).toEqual([]);
  });

  it("สัดส่วนรวมกันได้ 1 เสมอ", () => {
    const mix = revenueMix([bill([line("rent", 3333), line("electricity", 777), line("water", 111)])]);
    expect(mix.slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10);
  });
});

describe("utilityShare", () => {
  it("บอกว่าค่าน้ำค่าไฟกินสัดส่วนเท่าไหร่ของรายได้", () => {
    const mix = revenueMix([bill([line("rent", 3000), line("electricity", 800), line("water", 200)])]);
    expect(utilityShare(mix)).toBe(0.25);
  });

  it("ไม่มีรายได้เลยคืน 0 ไม่ใช่ NaN", () => {
    expect(utilityShare(revenueMix([]))).toBe(0);
  });
});
