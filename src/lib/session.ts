import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { adminAuth, isFirebaseConfigured } from "./firebase-admin";
import { db } from "./db";
import type { AllowlistEntry, SessionUser } from "./types";

export const SESSION_COOKIE = "wlp_session";
export const DEMO_COOKIE = "wlp_demo";
export const PROPERTY_COOKIE = "wlp_property";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 วัน

function secret(): string {
  return process.env.AUTH_SECRET ?? "wilai-communities-dev-secret";
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

/** ใครที่อนุญาตให้เข้าระบบ — ไม่มีในรายชื่อ = เข้าไม่ได้ ไม่ว่าจะล็อกอิน Google สำเร็จหรือไม่ */
async function allowlistFor(email: string): Promise<AllowlistEntry | null> {
  const entry = await db().get<AllowlistEntry>("allowlist", email.toLowerCase());
  if (entry) return entry;
  // เจ้าของคนแรก: ตั้งอีเมลไว้ใน env เพื่อให้เข้าได้ก่อนที่จะมี collection allowlist
  const bootstrap = (process.env.OWNER_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (bootstrap.includes(email.toLowerCase())) {
    return { email, role: "owner", name: email, photoUrl: null, propertyIds: [] };
  }
  return null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();

  // คุกกี้สาธิตใช้ได้เฉพาะตอนที่ยังไม่ได้ตั้งค่า Firebase
  // ตั้งค่าเมื่อไหร่ คุกกี้เก่า (หรือที่ปลอมขึ้นมา) หมดความหมายทันที
  if (!isFirebaseConfigured()) {
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
