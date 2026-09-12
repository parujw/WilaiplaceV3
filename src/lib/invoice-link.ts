import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ลิงก์ใบแจ้งหนี้ที่เดาไม่ได้
 *
 * เลขบิลเป็นเลขรัน (BILL-202609-0027) ถ้าใช้เป็น URL ตรงๆ ใครก็ไล่เลขอ่าน
 * ชื่อผู้เช่ากับยอดเงินของทุกห้องได้ จึงต่อท้ายด้วยโทเคนที่คำนวณจาก AUTH_SECRET
 *
 * เลือกวิธี derive แทนการสุ่มเก็บในบิล เพราะ
 *   - ลิงก์เดิมยังใช้ได้แม้ข้อมูลจะย้ายที่เก็บ ไม่ต้อง backfill บิลเก่า
 *   - โหมดสาธิตบน serverless ที่ข้อมูลอยู่ในหน่วยความจำก็ได้ลิงก์เดียวกันทุก instance
 *
 * แลกกับการเพิกถอนลิงก์รายใบไม่ได้ — เปลี่ยน AUTH_SECRET คือลิงก์เก่าตายทั้งหมด
 */

const TOKEN_LENGTH = 16;

/** ตั้ง AUTH_SECRET หรือยัง — ถ้ายัง โทเคนคำนวณจากค่า default ที่อยู่ในโค้ดสาธารณะ = เดาได้ */
export function hasInvoiceSecret(): boolean {
  return Boolean(process.env.AUTH_SECRET);
}

export function invoiceToken(billId: string): string {
  const secret = process.env.AUTH_SECRET ?? "wilai-communities-dev-secret";
  return createHmac("sha256", secret).update(`invoice:${billId}`).digest("base64url").slice(0, TOKEN_LENGTH);
}

export function invoicePath(billId: string): string {
  return `/invoice/${encodeURIComponent(billId)}?t=${invoiceToken(billId)}`;
}

export function verifyInvoiceToken(billId: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = invoiceToken(billId);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
