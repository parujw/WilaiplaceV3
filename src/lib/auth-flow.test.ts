import { describe, expect, it } from "vitest";
import { prefersRedirect, resolveAuthDomain } from "./auth-flow";

const FALLBACK = "wilaiplacev3.firebaseapp.com";

const base = {
  configured: null as string | null,
  fallback: FALLBACK,
  host: "wilaiplace-v3.vercel.app",
  protocol: "https:",
  proxiedProject: "wilaiplacev3",
  projectId: "wilaiplacev3",
};

describe("resolveAuthDomain", () => {
  it("ใช้โดเมนของเว็บเองเมื่อรันบน https — ทำให้ Safari ไม่บล็อก", () => {
    expect(resolveAuthDomain(base)).toBe("wilaiplace-v3.vercel.app");
  });

  it("ค่าที่ตั้งไว้ใน env ชนะทุกอย่าง — เป็นทางถอยกลับถ้า proxy พัง", () => {
    expect(resolveAuthDomain({ ...base, configured: FALLBACK })).toBe(FALLBACK);
  });

  it("บน http (dev) ไม่ proxy เพราะ Firebase handler ต้องเป็น https", () => {
    expect(resolveAuthDomain({ ...base, host: "localhost:3000", protocol: "http:" })).toBe(FALLBACK);
  });

  it("ไม่มี host ให้ใช้ ก็กลับไปใช้ค่าตั้งต้น", () => {
    expect(resolveAuthDomain({ ...base, host: "" })).toBe(FALLBACK);
  });

  it("ตอน build ไม่มี proxy ก็ไม่ชี้มาที่ตัวเอง — ไม่อย่างนั้น /__/auth/handler จะ 404", () => {
    expect(resolveAuthDomain({ ...base, proxiedProject: "" })).toBe(FALLBACK);
  });

  it("proxy ถูกสร้างไว้ให้โปรเจกต์อื่น ก็ไม่ชี้มาที่ตัวเอง", () => {
    expect(resolveAuthDomain({ ...base, proxiedProject: "wilaiplace-old" })).toBe(FALLBACK);
  });
});

describe("prefersRedirect", () => {
  const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
  const LINE_IOS =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Line/14.19.0";
  const MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  it("iPhone ใช้ redirect — ป็อปอัปบน iOS เชื่อถือไม่ได้", () => {
    expect(prefersRedirect(IPHONE)).toBe(true);
  });

  it("เบราว์เซอร์ใน LINE ใช้ redirect — window.open ถูกบล็อก", () => {
    expect(prefersRedirect(LINE_IOS)).toBe(true);
  });

  it("Android ใช้ redirect", () => {
    expect(prefersRedirect("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/131")).toBe(true);
  });

  it("Chrome บน Mac ใช้ป็อปอัป — ไม่ต้องออกจากหน้าเดิม", () => {
    expect(prefersRedirect(MAC)).toBe(false);
  });

  it("iPad ที่แอบอ้างว่าเป็น Mac จับได้จาก touch points", () => {
    expect(prefersRedirect(MAC, 5)).toBe(true);
    expect(prefersRedirect(MAC, 0)).toBe(false);
  });

  it("ไม่รู้ว่าเบราว์เซอร์อะไร ให้ลองป็อปอัปก่อน", () => {
    expect(prefersRedirect("")).toBe(false);
  });
});
