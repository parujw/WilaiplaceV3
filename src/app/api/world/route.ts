import { NextResponse } from "next/server";
import { getWorld } from "@/lib/repo";
import { getSelectedPropertyId, getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * คิวงานของพนักงาน W World เป็น JSON — อ่านอย่างเดียว ไม่แก้ข้อมูล
 * ให้ตัวตั้งเวลาภายนอกดึงไปสรุป/แจ้งเตือนต่อได้ (ต้องมี session เหมือนหน้าเว็บ)
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });

  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return NextResponse.json({ error: "ยังไม่ได้เลือกอาคาร" }, { status: 400 });
  if (user.propertyIds.length > 0 && !user.propertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ในอาคารนี้" }, { status: 403 });
  }

  const world = await getWorld(propertyId);
  return NextResponse.json({ propertyId, generatedAt: new Date().toISOString(), ...world });
}
