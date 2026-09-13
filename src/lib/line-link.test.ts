import { describe, expect, it } from "vitest";
import { checkRedeemable, expiryFrom, extractCode, newCode, type LineLink } from "./line-link";

const NOW = new Date("2026-09-13T00:00:00Z");

const link = (over: Partial<LineLink> = {}): LineLink => ({
  code: "ABC234",
  propertyId: "wlp1",
  tenantId: "T0001",
  createdAt: "2026-09-10T00:00:00.000Z",
  expiresAt: "2026-09-17T00:00:00.000Z",
  ...over,
});

describe("newCode", () => {
  it("ยาว 6 ตัว และไม่มีตัวที่อ่านสับสน (0 O 1 I L)", () => {
    for (let i = 0; i < 200; i++) {
      const code = newCode();
      expect(code).toHaveLength(6);
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });
});

describe("extractCode", () => {
  it("อ่านรหัสออกจากวิธีพิมพ์แบบต่างๆ ที่คนใช้จริง", () => {
    expect(extractCode("ABC234")).toBe("ABC234");
    expect(extractCode("abc234")).toBe("ABC234");
    expect(extractCode("ลงทะเบียน ABC234")).toBe("ABC234");
    expect(extractCode("รหัส abc234 ครับ")).toBe("ABC234");
    expect(extractCode("  ABC234  ")).toBe("ABC234");
  });

  it("คั่นกลางด้วยขีดหรือช่องว่างก็ยังอ่านออก", () => {
    expect(extractCode("ABC-234")).toBe("ABC234");
    expect(extractCode("ABC 234")).toBe("ABC234");
  });

  it("ทักมาเฉยๆ ต้องได้ null ไม่ใช่เดารหัสมั่ว", () => {
    expect(extractCode("สวัสดีครับ")).toBeNull();
    expect(extractCode("ค่าเช่าเดือนนี้เท่าไหร่")).toBeNull();
    expect(extractCode("")).toBeNull();
  });

  it("ความยาวไม่ตรงหรือมีตัวที่ไม่ได้ใช้ในรหัส ต้องไม่ผ่าน", () => {
    expect(extractCode("ABC23")).toBeNull();
    expect(extractCode("ABC2345")).toBeNull();
    // 0 กับ 1 ไม่อยู่ในชุดตัวอักษรของรหัส
    expect(extractCode("ABC201")).toBeNull();
  });

  it("เลขห้องที่ผู้เช่าพิมพ์มาเองต้องไม่กลายเป็นรหัส", () => {
    expect(extractCode("301")).toBeNull();
    expect(extractCode("ห้อง 301")).toBeNull();
  });
});

describe("checkRedeemable", () => {
  it("รหัสปกติใช้ได้", () => {
    expect(checkRedeemable(link(), NOW, null)).toBeNull();
  });

  it("ไม่มีรหัสนี้", () => {
    expect(checkRedeemable(null, NOW, null)).toBe("not-found");
  });

  it("ใช้ไปแล้วใช้ซ้ำไม่ได้ — กันคนที่เห็นรหัสในแชตแล้วเอาไปใช้ต่อ", () => {
    expect(checkRedeemable(link({ usedAt: "2026-09-11T00:00:00Z" }), NOW, null)).toBe("used");
  });

  it("หมดอายุแล้วใช้ไม่ได้", () => {
    expect(checkRedeemable(link({ expiresAt: "2026-09-12T23:59:00Z" }), NOW, null)).toBe("expired");
  });

  it("หมดอายุพอดีวินาทีนั้นถือว่าหมด", () => {
    expect(checkRedeemable(link({ expiresAt: NOW.toISOString() }), NOW, null)).toBe("expired");
  });

  it("ไลน์ไอดีที่ผูกกับคนอื่นอยู่แล้ว เอามาใช้รหัสของอีกคนไม่ได้", () => {
    expect(checkRedeemable(link(), NOW, "T0009")).toBe("bound-elsewhere");
  });

  it("แต่ถ้าเป็นคนเดิม ผูกซ้ำได้ ไม่ต้องบล็อก", () => {
    expect(checkRedeemable(link(), NOW, "T0001")).toBeNull();
  });

  it("ตรวจว่าใช้แล้วก่อนตรวจหมดอายุ — รหัสที่ทั้งใช้แล้วทั้งหมดอายุ ควรบอกว่าใช้แล้ว", () => {
    const both = link({ usedAt: "2026-09-11T00:00:00Z", expiresAt: "2026-09-12T00:00:00Z" });
    expect(checkRedeemable(both, NOW, null)).toBe("used");
  });
});

describe("expiryFrom", () => {
  it("หมดอายุใน 7 วัน", () => {
    expect(expiryFrom(NOW)).toBe("2026-09-20T00:00:00.000Z");
  });
});
