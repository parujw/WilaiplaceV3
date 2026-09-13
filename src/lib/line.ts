import "server-only";
import { env } from "./env";
import { signatureMatches } from "./line-signature";

/**
 * คุยกับ LINE Messaging API
 *
 * ตัวตนของบอทอยู่ในสองค่านี้ ทั้งคู่เป็นความลับ ต้องอยู่ใน environment variables เท่านั้น
 *   LINE_CHANNEL_ACCESS_TOKEN  ใช้ยิง API ส่งข้อความ
 *   LINE_CHANNEL_SECRET        ใช้ตรวจว่า webhook ที่เข้ามาจาก LINE จริง
 *
 * ยังไม่ได้ตั้งค่าก็ไม่พัง แค่ส่งไม่ได้ และหน้าจอจะบอกว่าต้องไปตั้งอะไร
 */

const API = "https://api.line.me/v2/bot";

export function isLineConfigured(): boolean {
  return Boolean(env("LINE_CHANNEL_ACCESS_TOKEN") && env("LINE_CHANNEL_SECRET"));
}

/** ยังขาดตัวไหน — เอาไปขึ้นบนหน้าจอให้รู้ว่าต้องไปเติมอะไร */
export function missingLineEnv(): string[] {
  const missing: string[] = [];
  if (!env("LINE_CHANNEL_ACCESS_TOKEN")) missing.push("LINE_CHANNEL_ACCESS_TOKEN");
  if (!env("LINE_CHANNEL_SECRET")) missing.push("LINE_CHANNEL_SECRET");
  return missing;
}

/** ตรวจลายเซ็นใช้แค่ secret ตัวเดียว ไม่เกี่ยวกับ access token */
export function hasLineSecret(): boolean {
  return Boolean(env("LINE_CHANNEL_SECRET"));
}

export class LineError extends Error {}

function token(): string {
  const value = env("LINE_CHANNEL_ACCESS_TOKEN");
  if (!value) throw new LineError("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
  return value;
}

/** ตรวจลายเซ็น webhook — ตัวคิดจริงอยู่ใน line-signature.ts ที่นี่แค่หยิบ secret มาให้ */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  return signatureMatches(rawBody, signature, env("LINE_CHANNEL_SECRET"));
}

/* --------------------------------- ข้อความ -------------------------------- */

export interface TextMessage {
  type: "text";
  text: string;
}

export interface ImageMessage {
  type: "image";
  originalContentUrl: string;
  previewImageUrl: string;
}

export type LineMessage = TextMessage | ImageMessage | Record<string, unknown>;

export const text = (body: string): TextMessage => ({ type: "text", text: body });

async function call(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 401/403 แปลว่าโทเคนผิดหรือหมดอายุ ซึ่งแก้คนละทางกับข้อความผิดรูปแบบ จึงบอกให้ชัด
    const hint =
      res.status === 401 || res.status === 403
        ? " (ตรวจ LINE_CHANNEL_ACCESS_TOKEN ว่ายังใช้ได้อยู่ไหม)"
        : "";
    throw new LineError(`LINE ตอบกลับ ${res.status}${hint}: ${detail.slice(0, 300)}`);
  }
}

/** ส่งหาคนที่ผูกบัญชีไว้แล้ว ใช้ตอนส่งบิล */
export async function push(to: string, messages: LineMessage[]): Promise<void> {
  await call("/message/push", { to, messages });
}

/**
 * ตอบกลับในบทสนทนาเดิม ใช้ตอนผู้เช่าทักมา
 * replyToken ใช้ได้ครั้งเดียวและหมดอายุเร็ว จึงต้องตอบทันทีในรอบเดียวกัน
 * และถูกกว่า push เพราะไม่นับโควตาข้อความ
 */
export async function reply(replyToken: string, messages: LineMessage[]): Promise<void> {
  await call("/message/reply", { replyToken, messages });
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

/** ชื่อที่ผู้เช่าตั้งไว้ในไลน์ — เอาไว้ให้ผู้จัดการตรวจว่าผูกถูกคนไหม */
export async function getProfile(userId: string): Promise<LineProfile | null> {
  try {
    const res = await fetch(`${API}/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as LineProfile;
  } catch {
    // ชื่อไลน์เป็นของประกอบ ดึงไม่ได้ก็ผูกบัญชีต่อได้ ไม่ควรทำให้ทั้งกระบวนการล้ม
    return null;
  }
}
