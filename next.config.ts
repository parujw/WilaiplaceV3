import type { NextConfig } from "next";

/**
 * โปรเจกต์ Firebase ที่ /__/auth/* จะถูกส่งต่อไปหา
 * อ่านตอน build เพราะ rewrite ถูกฝังลงใน build output ไม่ได้อ่านตอนรัน
 */
const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? "";

const config: NextConfig = {
  /*
   * Chrome ไร้หน้าจอที่ใช้วาดใบแจ้งหนี้ต้องไม่ถูก bundler รวมเข้าไปในไฟล์เดียว
   * มันเป็นไบนารีกับไฟล์บีบอัด ไม่ใช่โค้ด JS ที่ rewrite ได้
   * ถ้าไม่บอกตรงนี้จะ build ผ่านบนเครื่องแต่พังตอนรันจริงบน Vercel
   */
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },

  /*
   * ยืมหน้าจัดการล็อกอินของ Firebase มาเสิร์ฟบนโดเมนเราเอง
   *
   * ปกติ Firebase ให้เบราว์เซอร์คุยกับ <project>.firebaseapp.com ซึ่งเป็นคนละโดเมนกับเว็บนี้
   * Safari ตั้งแต่ 16.1 กับเบราว์เซอร์ในแอป (LINE, Facebook) บล็อก storage ของโดเมนที่สาม
   * หน้าต่างล็อกอินจึงส่งผลกลับมาไม่ได้ ปุ่มค้างที่ "กำลังเข้าสู่ระบบ" ตลอดไปแบบไม่มี error
   *
   * พอ proxy มาไว้ใต้โดเมนเดียวกัน ทุกอย่างกลายเป็น first-party ข้อจำกัดนั้นหายไป
   * ฝั่ง client จึงตั้ง authDomain เป็นโดเมนของเว็บนี้ (ดู src/lib/auth-flow.ts)
   */
  /*
   * บอกฝั่ง client ว่า proxy ถูกสร้างไว้ให้โปรเจกต์ไหน
   * ถ้าไม่ตรงกับโปรเจกต์ที่ใช้อยู่ตอนรัน client จะไม่ใช้โดเมนตัวเองเป็น authDomain
   * กันกรณี build ไม่มีค่า env แล้ว /__/auth/handler กลายเป็น 404
   */
  env: { NEXT_PUBLIC_AUTH_PROXY_PROJECT: project },

  async rewrites() {
    if (!project) return [];
    const handler = `https://${project}.firebaseapp.com`;
    return [
      { source: "/__/auth/:path*", destination: `${handler}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `${handler}/__/firebase/:path*` },
    ];
  },
};

export default config;
