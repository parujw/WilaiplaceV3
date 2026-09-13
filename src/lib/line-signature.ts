import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ตรวจว่า request ที่เข้ามาที่ webhook มาจาก LINE จริง
 *
 * URL ของ webhook เป็นที่อยู่สาธารณะ ใครก็ยิงเข้ามาได้
 * ถ้าไม่ตรวจลายเซ็น ใครก็ปลอมเป็นผู้เช่าส่งรหัสผูกบัญชีเข้ามาได้
 *
 * ต้องคิดจาก raw body ก่อน parse เพราะ LINE เซ็นจากไบต์ที่ส่งมาจริง
 * parse แล้ว stringify ใหม่ ลำดับ key หรือช่องว่างต่างไปนิดเดียว ลายเซ็นก็ไม่ตรง
 *
 * รับ secret เป็นพารามิเตอร์ ไม่อ่าน env เอง จะได้ทดสอบได้โดยไม่ต้องพึ่ง environment
 */
export function signatureMatches(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined,
): boolean {
  // ยังไม่ได้ตั้ง secret = ปฏิเสธทุกกรณี ไม่ใช่ปล่อยผ่านหมด
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
