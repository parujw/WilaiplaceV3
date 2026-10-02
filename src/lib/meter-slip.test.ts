import { describe, expect, it } from "vitest";
import { chunk, slipDueDate, SLIPS_PER_PAGE } from "./meter-slip";

describe("slipDueDate", () => {
  it("คืนวันที่ตามรอบบิล", () => {
    expect(slipDueDate("202610", 25)).toBe("2026-10-25");
  });

  it("เดือนที่มี 30 วัน ขอวันที่ 31 ให้เลื่อนมาวันสุดท้าย ไม่ล้นไปเดือนหน้า", () => {
    expect(slipDueDate("202611", 31)).toBe("2026-11-30");
  });

  it("กุมภาพันธ์ปีอธิกสุรทินได้ 29 ไม่ใช่ 28", () => {
    expect(slipDueDate("202402", 31)).toBe("2024-02-29");
    expect(slipDueDate("202502", 31)).toBe("2025-02-28");
  });

  it("เดือนธันวาคมไม่ข้ามปี", () => {
    expect(slipDueDate("202612", 25)).toBe("2026-12-25");
  });

  it("รอบบิลหรือวันที่ที่ใช้ไม่ได้ คืน null ไม่เดาให้", () => {
    expect(slipDueDate("2026", 25)).toBeNull();
    expect(slipDueDate("202613", 25)).toBeNull();
    expect(slipDueDate("202600", 25)).toBeNull();
    expect(slipDueDate("202610", 0)).toBeNull();
    expect(slipDueDate("202610", 2.5)).toBeNull();
  });
});

describe("chunk", () => {
  it("แบ่งเท่าๆ กันเมื่อหารลงตัว", () => {
    expect(chunk([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it("หน้าสุดท้ายไม่ครบก็ปล่อยไว้ ไม่เติมช่องว่าง", () => {
    expect(chunk([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
  });

  it("17 ห้องตามจำนวนใบต่อแผ่นที่ใช้จริง — ไม่มีใบตกหล่น แผ่นสุดท้ายไม่ครบได้", () => {
    const pages = chunk(Array.from({ length: 17 }, (_, i) => i), SLIPS_PER_PAGE);
    expect(pages).toHaveLength(Math.ceil(17 / SLIPS_PER_PAGE));
    expect(pages.flat()).toHaveLength(17);
    expect(pages.every((p) => p.length <= SLIPS_PER_PAGE)).toBe(true);
  });

  it("ไม่มีอะไรเลย ก็ไม่มีหน้า", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("ขนาดหน้าที่ใช้ไม่ได้ ให้รวมเป็นหน้าเดียวแทนที่จะวนไม่จบ", () => {
    expect(chunk([1, 2], 0)).toEqual([[1, 2]]);
    expect(chunk([1, 2], -3)).toEqual([[1, 2]]);
    expect(chunk([], 0)).toEqual([]);
  });
});
