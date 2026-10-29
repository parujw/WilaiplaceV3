import { NextResponse } from "next/server";
import { buildTemplate } from "@/lib/import/xlsx";
import { getSessionUser } from "@/lib/session";

/** ดาวน์โหลด template Excel สำหรับนำเข้าอาคารใหม่ — สร้างจากรายชื่อช่องชุดเดียวกับตัวอ่าน */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });

  const file = await buildTemplate();
  return new NextResponse(file as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // ชื่อไฟล์ภาษาไทยต้องเข้ารหัสแบบ RFC 5987 ไม่งั้นบางเบราว์เซอร์ได้ชื่อเป็นตัวอักษรเพี้ยน
      "Content-Disposition": `attachment; filename="new-property-template.xlsx"; filename*=UTF-8''${encodeURIComponent("นำเข้าอาคารใหม่.xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}
