"use client";

import Link from "next/link";

/**
 * แถบปุ่มลอยบนหน้าพิมพ์ — ซ่อนตอนพิมพ์จริงด้วย .print-bar ใน print.css
 *
 * ต้องมีปุ่มกลับเสมอ หน้านี้เปิดจากหน้าบิลแบบแท็บใหม่ก็จริง
 * แต่ตอนติดตั้งเป็น PWA จะเปิดในหน้าต่างเดิมที่ไม่มีแถบที่อยู่ให้กดย้อน
 * ไม่มีปุ่มกลับคือค้างอยู่หน้านี้ ออกไม่ได้เลยนอกจากปิดแอปทิ้ง
 * ใช้ลิงก์ไปหน้าบิลตรงๆ ไม่ใช่ history.back() เพราะแท็บใหม่ไม่มีประวัติให้ย้อน
 */
export function PrintButton({ backHref }: { backHref: string }) {
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
