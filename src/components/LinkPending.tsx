"use client";

import { useLinkStatus } from "next/link";

/**
 * ไฟแสดงว่ากำลังโหลดอยู่ในลิงก์
 *
 * ทุกหน้าอ่านข้อมูลสดจากเซิร์ฟเวอร์ ระหว่างรอ Next จะยังคาหน้าเดิมไว้
 * ไม่มีอะไรขยับเลย คนใช้เลยนึกว่ากดไม่ติดแล้วกดซ้ำอีกสองสามที
 * useLinkStatus บอกได้ทันทีที่แตะว่าลิงก์นี้กำลังโหลด
 *
 * ต้องอยู่ข้างใน <Link> เท่านั้น อยู่นอกจะ pending ไม่ขึ้น
 */

/** วงกลมหมุน ใช้แทนลูกศรท้ายแถวตอนกำลังโหลด */
export function LinkSpinner({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className={`spinner ${className}`} role="status" aria-label="กำลังโหลด" />;
}

/** ลูกศรปกติ สลับเป็นวงกลมหมุนเมื่อกำลังโหลด */
export function PendingSwap({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? <span className="spinner" role="status" aria-label="กำลังโหลด" /> : <>{children}</>;
}

/** ทั้งการ์ดหรี่ลงตอนกำลังโหลด ใช้กับปุ่มใหญ่ที่ไม่มีที่ใส่วงกลมหมุน */
export function PendingDim({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "block h-full opacity-55 transition-opacity" : "block h-full"}>{children}</span>;
}
