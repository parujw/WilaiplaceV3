import { describe, expect, it } from "vitest";
import { BillEditError, billEditPatch, normalizeLines, recalcTotals } from "./bill-edit";
import type { BillLine } from "./types";

const line = (over: Partial<BillLine> = {}): BillLine => ({
  type: "rent", label: "ค่าเช่าห้อง", qty: 1, rate: 3200, amount: 3200, ...over,
});

describe("normalizeLines", () => {
  it("คิดยอดจากจำนวน × ราคาต่อหน่วย", () => {
    const [l] = normalizeLines([{ type: "electricity", label: "ค่าไฟ", qty: 117, rate: 8 }]);
    expect(l.amount).toBe(936);
  });

  it("ส่วนลดเก็บเป็นค่าติดลบเสมอ ไม่ว่าจะกรอกมาแบบไหน", () => {
    const [plus] = normalizeLines([{ type: "discount", label: "ส่วนลด", qty: 1, rate: 200 }]);
    const [minus] = normalizeLines([{ type: "discount", label: "ส่วนลด", qty: 1, rate: -200 }]);
    expect(plus.amount).toBe(-200);
    expect(minus.amount).toBe(-200);
  });

  it("ปัดทศนิยมไม่ให้หลุด 936.0000000001 ไปถึงใบแจ้งหนี้", () => {
    const [l] = normalizeLines([{ type: "water", label: "ค่าน้ำ", qty: 0.1, rate: 0.2 }]);
    expect(l.amount).toBe(0.02);
  });

  it("ประเภทที่ไม่รู้จักตกลงมาเป็นอื่นๆ ไม่ใช่พัง", () => {
    const [l] = normalizeLines([{ type: "สารพัด", label: "ค่าอะไรสักอย่าง", qty: 1, rate: 50 }]);
    expect(l.type).toBe("other");
  });

  it("ไม่มีชื่อรายการ / ไม่ใช่ตัวเลข / ไม่มีรายการเลย ต้องไม่ผ่าน", () => {
    expect(() => normalizeLines([{ type: "rent", label: "  ", qty: 1, rate: 1 }])).toThrow(BillEditError);
    expect(() => normalizeLines([{ type: "rent", label: "ค่าเช่า", qty: 1, rate: "abc" }])).toThrow(BillEditError);
    expect(() => normalizeLines([])).toThrow(BillEditError);
  });
});

describe("recalcTotals", () => {
  it("ยังไม่จ่ายเลย = ค้างชำระเต็มจำนวน", () => {
    expect(recalcTotals([line()], 0)).toEqual({ total: 3200, balance: 3200, status: "unpaid" });
  });

  it("จ่ายมาบางส่วน = ชำระบางส่วน", () => {
    expect(recalcTotals([line()], 1000)).toEqual({ total: 3200, balance: 2200, status: "partial" });
  });

  it("แก้ยอดลงมาเท่าที่จ่ายแล้ว = ปิดบิลเป็นชำระแล้ว", () => {
    expect(recalcTotals([line({ rate: 1000, amount: 1000 })], 1000).status).toBe("paid");
  });

  it("แก้ยอดต่ำกว่าที่รับเงินมาแล้วไม่ได้ — บิลจะค้างติดลบ", () => {
    expect(() => recalcTotals([line({ rate: 500, amount: 500 })], 1000)).toThrow(/ต่ำกว่ายอดที่รับชำระ/);
  });

  it("ส่วนลดมากกว่ายอดจนติดลบไม่ได้", () => {
    const lines = [line({ rate: 100, amount: 100 }), line({ type: "discount", label: "ส่วนลด", rate: -500, amount: -500 })];
    expect(() => recalcTotals(lines, 0)).toThrow(/ติดลบ/);
  });
});

describe("billEditPatch", () => {
  it("คืนรายการใหม่พร้อมยอดที่คิดใหม่ทั้งชุด", () => {
    const patch = billEditPatch(
      { paid: 0, status: "unpaid" },
      { lines: [{ type: "rent", label: "ค่าเช่าห้อง", qty: 1, rate: 3200 }], dueDate: "2026-10-05", note: "แก้เลขมิเตอร์" },
    );
    expect(patch).toMatchObject({ total: 3200, balance: 3200, status: "unpaid", dueDate: "2026-10-05", note: "แก้เลขมิเตอร์" });
  });

  it("บิลที่ยกเลิกไปแล้วแก้ไม่ได้", () => {
    expect(() =>
      billEditPatch({ paid: 0, status: "void" }, { lines: [{ type: "rent", label: "x", qty: 1, rate: 1 }] }),
    ).toThrow(/ยกเลิกไปแล้ว/);
  });

  it("วันครบกำหนดผิดรูปแบบไม่ผ่าน", () => {
    expect(() =>
      billEditPatch({ paid: 0, status: "unpaid" }, { lines: [{ type: "rent", label: "x", qty: 1, rate: 1 }], dueDate: "5/10/2569" }),
    ).toThrow(/YYYY-MM-DD/);
  });
});
