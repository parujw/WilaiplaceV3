import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { adminAuth, isFirebaseConfigured } from "./firebase-admin";
import { db } from "./db";
import type { AllowlistEntry, SessionUser } from "./types";

export const SESSION_COOKIE = "wlp_session";
export const DEMO_COOKIE = "wlp_demo";
export const PROPERTY_COOKIE = "wlp_property";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 วัน

/**
 * โหมดสาธิตเปิดได้เมื่อไหร่
 *
 * ข้อมูลในนี้เป็นชื่อจริง เบอร์จริง ค่าเช่าจริงของผู้เช่า ถ้าเปิดบน URL สาธารณะ
 * ใครกดปุ่มก็เข้าดูได้หมด จึงปิดไว้เป็นค่าเริ่มต้นเมื่อรันแบบ production
 * อยากเปิดจริงๆ ต้องตั้ง ALLOW_DEMO_LOGIN=1 เอง
 */
export function isDemoLoginAllowed(): boolean {
  if (isFirebaseConfigured()) return false; // ตั้งค่าจริงแล้ว ให้ล็อกอิน Google เท่านั้น
  if (env("ALLOW_DEMO_LOGIN") === "1") return true;
  return process.env.NODE_ENV !== "production";
}

function secret(): string {
  return env("AUTH_SECRET") ?? "wilai-communities-dev-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function packDemoCookie(user: SessionUser): string {
  const body = Buffer.from(JSON.stringify(user)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function unpackDemoCookie(raw: string): SessionUser | null {
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

/**
 * ใครเข้าระบบได้บ้าง
 *
 * ค่าเริ่มต้น: ใครล็อกอิน Google สำเร็จก็เข้าได้ในฐานะเจ้าของ ไม่ต้องตั้ง allowlist
 * แลกกับการที่ใครรู้ลิงก์และมีบัญชี Google ก็เข้าดูข้อมูลผู้เช่าได้
 *
 * อยากจำกัดเมื่อไหร่ ตั้ง LOGIN_ALLOWLIST_ONLY=1 แล้วระบบจะยอมเฉพาะอีเมลที่อยู่ใน
 * collection allowlist หรือใน OWNER_EMAILS เท่านั้น ไม่ต้องแก้โค้ด
 *
 * เอกสารใน allowlist ยังใช้กำหนด role และอาคารที่เข้าถึงได้เหมือนเดิม
 * ต่างกันแค่ว่า "ไม่มีเอกสาร" ไม่ได้แปลว่า "ห้ามเข้า" อีกต่อไป
 */
export function isAllowlistRequired(): boolean {
  return env("LOGIN_ALLOWLIST_ONLY") === "1";
}

async function allowlistFor(email: string): Promise<AllowlistEntry | null> {
  const normalized = email.toLowerCase();

  const entry = await db().get<AllowlistEntry>("allowlist", normalized);
  if (entry) return entry;

  const owners = (env("OWNER_EMAILS") ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (owners.includes(normalized)) {
    return { email: normalized, role: "owner", name: "", photoUrl: null, propertyIds: [] };
  }

  if (isAllowlistRequired()) return null;

  // เปิดให้ทุกคนที่ล็อกอินผ่าน — propertyIds ว่าง = เข้าถึงได้ทุกอาคาร
  return { email: normalized, role: "owner", name: "", photoUrl: null, propertyIds: [] };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();

  // คุกกี้สาธิตใช้ได้เฉพาะตอนที่เปิดโหมดสาธิตอยู่
  // ปิดโหมดเมื่อไหร่ คุกกี้เก่า (หรือที่ปลอมขึ้นมา) หมดความหมายทันที
  if (isDemoLoginAllowed()) {
    const demo = jar.get(DEMO_COOKIE)?.value;
    if (demo) return unpackDemoCookie(demo);
  }

  const session = jar.get(SESSION_COOKIE)?.value;
  if (!session) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(session, true);
    const email = decoded.email ?? "";
    const entry = await allowlistFor(email);
    if (!entry) return null;
    return {
      uid: decoded.uid,
      email,
      name: entry.name || decoded.name || email,
      photoUrl: entry.photoUrl ?? decoded.picture ?? null,
      role: entry.role,
      propertyIds: entry.propertyIds ?? [],
      demo: false,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function createSessionCookie(idToken: string): Promise<{ value: string; maxAge: number }> {
  const value = await adminAuth().createSessionCookie(idToken, { expiresIn: MAX_AGE * 1000 });
  return { value, maxAge: MAX_AGE };
}

export { allowlistFor, MAX_AGE };

/* ------------------------------ อาคารที่เลือก ------------------------------ */

export async function getSelectedPropertyId(): Promise<string | null> {
  return (await cookies()).get(PROPERTY_COOKIE)?.value ?? null;
}
