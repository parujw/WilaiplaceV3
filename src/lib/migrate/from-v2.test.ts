import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectionsOf } from "./apply";
import { migrateV2, type V2Export } from "./from-v2";

const v2 = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/v2-export.sample.json"), "utf8"),
) as V2Export;

const result = migrateV2(v2);

/** เดินดูทุก key ในเอกสาร รวมถึงที่ซ้อนอยู่ข้างใน */
function undefinedPaths(value: unknown, trail = ""): string[] {
  if (value === undefined) return [trail];
  if (Array.isArray(value)) return value.flatMap((item, i) => undefinedPaths(item, `${trail}[${i}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) => undefinedPaths(v, trail ? `${trail}.${key}` : key));
  }
  return [];
}

describe("migrateV2", () => {
  it("แปลงครบทุก collection", () => {
    expect(result.rooms).toHaveLength(17);
    expect(result.tenants).toHaveLength(15);
    expect(result.leases).toHaveLength(15);
    expect(result.bills).toHaveLength(18);
    expect(result.payments).toHaveLength(18);
  });

  it("ไม่มี undefined หลงเหลือในเอกสารสักตัว", () => {
    // Firestore ปฏิเสธทั้งเอกสารถ้าเจอ undefined แม้แค่ field เดียว
    // เคยพังจริงตอนย้ายข้อมูล เพราะห้องที่ไม่มีหมายเหตุได้ note: undefined ติดไปด้วย
    const bad = collectionsOf(result).flatMap(({ name, docs }) =>
      docs.flatMap((doc) => undefinedPaths(doc, `${name}/${doc.id}`)),
    );
    expect(bad).toEqual([]);
  });

  it("ห้องที่ไม่มีหมายเหตุ ไม่มี key note ติดมาเลย", () => {
    const plain = result.rooms.find((r) => !v2.rooms.find((x) => x.roomNo === r.roomNo)?.note)!;
    expect("note" in plain).toBe(false);
  });

  it("สัญญาที่ยังไม่จบ ไม่มี key endedReason", () => {
    const active = result.leases.find((l) => l.status === "active")!;
    expect("endedReason" in active).toBe(false);
  });

  it("cycle ของบิลเป็น string 6 หลักเสมอ", () => {
    for (const bill of result.bills) {
      expect(bill.cycle).toMatch(/^\d{6}$/);
    }
  });

  it("ห้องผูกสัญญา active ได้ไม่เกินหนึ่งฉบับ", () => {
    const used = result.rooms.map((r) => r.activeLeaseId).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });
});
