/**
 * บัญชีไลน์ทางการที่ผู้เช่าใช้ติดต่อกลับ
 *
 * ไม่ใช่ความลับ — เป็นไอดีที่ตั้งใจให้คนทั่วไปเห็นและกดเพิ่มเพื่อนอยู่แล้ว
 * ต่างจาก LINE_CHANNEL_ACCESS_TOKEN กับ LINE_CHANNEL_SECRET ที่ต้องอยู่ใน env เท่านั้น
 *
 * เปลี่ยนบัญชีเมื่อไหร่ต้องแก้สองที่ให้ตรงกัน
 *   1. ค่าในไฟล์นี้
 *   2. public/line-qr.png ซึ่งเป็น QR ของ ADD_URL อันเดียวกัน
 * สร้าง QR ใหม่ด้วย: python3 -c "import segno; segno.make('<ADD_URL>', error='h').save('public/line-qr.png', scale=12, border=2)"
 */
export const LINE_CONTACT = {
  /** ไอดีที่ผู้เช่าพิมพ์ค้นหาในไลน์ได้เอง เผื่อสแกน QR ไม่ติด */
  id: "@933yhkou",
  /** ลิงก์เพิ่มเพื่อนที่ QR ชี้ไปหา */
  addUrl: "https://lin.ee/P8Go6Dyr",
  /** QR ที่สร้างจาก addUrl — error correction ระดับ H ทนหมึกจางและกระดาษยับ */
  qrPath: "/line-qr.png",
} as const;
