import { Sarabun } from "next/font/google";

/** ฟอนต์ของใบจดมิเตอร์ทุกแบบ — ใบที่มีชื่อผู้เช่ากับใบเปล่าต้องหน้าตาเดียวกัน */
export const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});
