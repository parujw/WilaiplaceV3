import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signatureMatches } from "./line-signature";

const SECRET = "test-channel-secret";
const body = '{"events":[{"type":"message"}]}';
const sign = (payload: string, secret = SECRET) =>
  createHmac("sha256", secret).update(payload).digest("base64");

describe("signatureMatches", () => {
  it("ลายเซ็นถูกต้องผ่าน", () => {
    expect(signatureMatches(body, sign(body), SECRET)).toBe(true);
  });

  it("เนื้อความถูกแก้ระหว่างทาง ต้องไม่ผ่าน", () => {
    expect(signatureMatches('{"events":[{"type":"unfollow"}]}', sign(body), SECRET)).toBe(false);
  });

  it("เซ็นด้วยกุญแจอื่น ต้องไม่ผ่าน — กันคนอื่นยิง webhook ปลอมเข้ามา", () => {
    expect(signatureMatches(body, sign(body, "กุญแจของคนอื่น"), SECRET)).toBe(false);
  });

  it("ไม่มีลายเซ็นมาเลย ต้องไม่ผ่าน", () => {
    expect(signatureMatches(body, null, SECRET)).toBe(false);
    expect(signatureMatches(body, undefined, SECRET)).toBe(false);
    expect(signatureMatches(body, "", SECRET)).toBe(false);
  });

  it("ลายเซ็นยาวไม่เท่ากันต้องไม่ผ่าน และต้องไม่โยน error", () => {
    expect(signatureMatches(body, "สั้นเกินไป", SECRET)).toBe(false);
  });

  it("ยังไม่ได้ตั้ง secret = ไม่ผ่านทุกกรณี ไม่ใช่ปล่อยผ่านหมด", () => {
    expect(signatureMatches(body, sign(body), undefined)).toBe(false);
    expect(signatureMatches(body, sign(body), "")).toBe(false);
  });
});
