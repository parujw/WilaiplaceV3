import { NextResponse } from "next/server";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { DEMO_COOKIE, MAX_AGE, packDemoCookie } from "@/lib/session";
import type { SessionUser } from "@/lib/types";

/**
 * โหมดสาธิต — เปิดได้เฉพาะตอนที่ยังไม่ได้ตั้งค่า Firebase
 * ตั้งค่า Firebase เมื่อไหร่ ประตูนี้ปิดทันที
 */
export async function POST() {
  if (isFirebaseConfigured()) {
    return NextResponse.json({ error: "ระบบตั้งค่า Firebase แล้ว ให้ล็อกอินด้วย Google" }, { status: 403 });
  }

  const user: SessionUser = {
    uid: "demo",
    email: "demo@wilai.local",
    name: "ผู้จัดการ (สาธิต)",
    photoUrl: null,
    role: "owner",
    propertyIds: [],
    demo: true,
  };

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_COOKIE, packDemoCookie(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return response;
}
