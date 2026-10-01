/**
 * การตัดสินใจรอบๆ การล็อกอิน Google แยกออกมาเป็นฟังก์ชันบริสุทธิ์
 * เพื่อเทสต์ได้โดยไม่ต้องมีเบราว์เซอร์จริง
 */

/**
 * Safari ตั้งแต่ 16.1 และ in-app browser บล็อก storage ของโดเมนที่สาม
 * ถ้า authDomain เป็น <project>.firebaseapp.com ซึ่งคนละโดเมนกับเว็บเรา
 * หน้าต่างล็อกอินจะส่งผลกลับมาไม่ได้ ปุ่มค้างที่ "กำลังเข้าสู่ระบบ" ตลอดไปโดยไม่มี error
 *
 * ทางแก้ที่ Firebase แนะนำคือ proxy /__/auth/* ไปที่ firebaseapp.com
 * แล้วใช้โดเมนของเราเองเป็น authDomain ทุกอย่างจึงเป็น first-party
 *
 * ตั้ง NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ใน Vercel = ปิดกลไกนี้ ใช้ค่านั้นตรงๆ
 * (ทางถอยกลับถ้า proxy มีปัญหา แก้ env ตัวเดียวไม่ต้องแก้โค้ด)
 */
export function resolveAuthDomain(opts: {
  /** ค่าจาก NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ถ้าตั้งไว้ */
  configured: string | null;
  /** ค่าตั้งต้น <project>.firebaseapp.com */
  fallback: string;
  /** window.location.host */
  host: string;
  /** window.location.protocol */
  protocol: string;
  /** โปรเจกต์ที่ rewrite ชี้ไปตอน build — ว่าง = ตอน build ไม่มีค่า เลยไม่มี proxy */
  proxiedProject: string;
  /** โปรเจกต์ที่กำลังใช้อยู่ตอนรัน */
  projectId: string;
}): string {
  if (opts.configured) return opts.configured;

  // http ไม่ใช้ proxy เพราะ Firebase handler ต้องวิ่งบน https เท่านั้น
  if (opts.protocol !== "https:") return opts.fallback;
  if (!opts.host) return opts.fallback;

  /*
   * ชี้มาที่โดเมนตัวเองได้เฉพาะเมื่อ proxy ที่ build ไว้ตรงกับโปรเจกต์ที่ใช้อยู่จริง
   * ไม่ตรง = /__/auth/handler จะเป็น 404 แล้วผู้ใช้ค้างอยู่หน้าไม่พบหน้าเว็บ
   * ซึ่งแย่กว่าอาการเดิม จึงยอมถอยไปใช้โดเมน firebaseapp.com แบบเก่า
   */
  if (!opts.proxiedProject || opts.proxiedProject !== opts.projectId) return opts.fallback;

  return opts.host;
}

/**
 * บนมือถือและ in-app browser ป็อปอัปเชื่อถือไม่ได้
 * LINE เป็นช่องทางหลักของผู้เช่า ถ้าเปิดจากแชทจะเป็น in-app browser เสมอ
 * กรณีนี้ redirect ทั้งหน้าแทน ไม่ต้องพึ่ง window.open
 */
export function prefersRedirect(ua: string, maxTouchPoints = 0): boolean {
  if (!ua) return false;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && maxTouchPoints > 1);
  const inApp = /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|Messenger|MicroMessenger|; wv\)/.test(ua);
  const android = /Android/.test(ua);
  return ios || inApp || android;
}
