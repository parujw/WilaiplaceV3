import type { PaymentInfo } from "./types";

/**
 * ช่องทางรับชำระที่ติดมากับระบบ ใช้เมื่ออาคารยังไม่ได้กรอกของตัวเอง
 *
 * รูป QR มาจากบัตร Thai QR Payment ใบเดิมของวิไลเพลส ตรวจแล้วว่าสแกนได้
 * payload เดียวกับต้นฉบับ (เป็น QR แบบไม่ระบุจำนวนเงิน ใช้ได้กับทุกบิล)
 *
 * อาคารไหนใช้บัญชีอื่นต้องกรอกทับที่หน้า ตั้งค่า → ใบแจ้งหนี้
 * ไม่งั้นเงินจะเข้าบัญชีนี้ หน้าตั้งค่าจึงเตือนไว้ตอนที่ยังใช้ค่าเริ่มต้นอยู่
 */
export const DEFAULT_PAYMENT: PaymentInfo = {
  method: "PromptPay / KBank",
  accountName: "น.ส. วิไล กรแก้ว",
  accountNo: "xxx-x-x1085-x",
  reference: "004999245266571",
  qrUrl: "/promptpay-qr.png",
  note: "กรุณาส่งสลิปหลังโอนผ่าน LINE",
};

/** ข้อมูลที่กรอกไว้ ถ้ายังไม่ได้กรอกใช้ค่าเริ่มต้น */
export function paymentFor(payment: PaymentInfo | undefined | null): PaymentInfo {
  if (!payment) return DEFAULT_PAYMENT;
  const filled = payment.method || payment.accountName || payment.accountNo || payment.qrUrl;
  if (!filled) return DEFAULT_PAYMENT;
  // กรอกเองบางช่อง ช่องที่เว้นไว้ยังใช้ค่าเริ่มต้นได้ ยกเว้น QR ที่ต้องคู่กับบัญชีเสมอ
  return {
    method: payment.method || DEFAULT_PAYMENT.method,
    accountName: payment.accountName,
    accountNo: payment.accountNo,
    reference: payment.reference,
    note: payment.note || DEFAULT_PAYMENT.note,
    qrUrl: payment.qrUrl,
  };
}

export function isUsingDefaultPayment(payment: PaymentInfo | undefined | null): boolean {
  if (!payment) return true;
  return !(payment.method || payment.accountName || payment.accountNo || payment.qrUrl);
}
