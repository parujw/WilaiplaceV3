import type { NextConfig } from "next";

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
};

export default config;
