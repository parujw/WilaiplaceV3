import { NextResponse } from "next/server";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { adminAuth } from "@/lib/firebase-admin";
import { allowlistFor, createSessionCookie, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  if (!isFirebaseConfigured()) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase บนเซิร์ฟเวอร์" }, { status: 503 });
  }

  const { idToken } = (await request.json()) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "ไม่มี idToken" }, { status: 400 });

  let email: string;
  try {
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    email = decoded.email ?? "";
  } catch {
    return NextResponse.json({ error: "โทเคนไม่ถูกต้อง" }, { status: 401 });
  }

  // ค่าเริ่มต้นเปิดให้ทุกคนที่ล็อกอินผ่าน จะกลับมาจำกัดเมื่อไหร่ให้ตั้ง LOGIN_ALLOWLIST_ONLY=1
  const entry = await allowlistFor(email);
  if (!entry) {
    return NextResponse.json(
      { error: `อีเมล ${email} ยังไม่ได้รับสิทธิ์เข้าใช้งาน — ให้เจ้าของเพิ่มใน allowlist หรือใน OWNER_EMAILS ก่อน` },
      { status: 403 },
    );
  }

  const { value, maxAge } = await createSessionCookie(idToken);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}
