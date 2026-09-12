import { NextResponse } from "next/server";
import { listProperties } from "@/lib/repo";
import { getSessionUser, MAX_AGE, PROPERTY_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });

  const { propertyId } = (await request.json()) as { propertyId?: string };
  const allowed = await listProperties(user);
  if (!propertyId || !allowed.some((p) => p.id === propertyId)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงอาคารนี้" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PROPERTY_COOKIE, propertyId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return response;
}
