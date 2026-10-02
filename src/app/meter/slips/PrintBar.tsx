"use client";

import Link from "next/link";

/**
 * แถบปุ่มลอย — ซ่อนตอนพิมพ์จริงด้วย .print-bar ใน slips.css
 *
 * ต้องมีปุ่มกลับเสมอ ตอนติดตั้งเป็น PWA หน้านี้เปิดในหน้าต่างที่ไม่มีแถบที่อยู่
 * ไม่มีปุ่มกลับคือค้างอยู่หน้านี้ ออกไม่ได้นอกจากปิดแอปทิ้ง
 * ใช้ลิงก์ตรงไม่ใช่ history.back() เพราะเปิดแท็บใหม่จะไม่มีประวัติให้ย้อน
 */
export function PrintBar({ backHref }: { backHref: string }) {
  return (
    <div className="print-bar">
      <Link href={backHref} className="back">
        ‹ กลับ
      </Link>
      <button type="button" onClick={() => window.print()}>
        พิมพ์ / บันทึกเป็น PDF
      </button>
    </div>
  );
}
