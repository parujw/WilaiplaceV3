/**
 * ผูกบัญชีไลน์ของผู้เช่าเข้ากับข้อมูลในระบบ — คำนวณล้วน ไม่แตะฐานข้อมูล
 *
 * ปัญหาคือจะรู้ได้ยังไงว่าไลน์ไอดีที่ทักมา เป็นของผู้เช่าห้องไหนจริง
 *
 * วิธีที่ห้ามใช้: ให้พิมพ์เลขห้องมาลงทะเบียน ใครก็พิมพ์ "301" ได้
 * แล้วบิลห้อง 301 ที่มีทั้งชื่อ เบอร์ และยอดหนี้ จะวิ่งไปหาคนแปลกหน้า
 *
 * วิธีที่ใช้: ผู้จัดการสร้างรหัสให้ผู้เช่ารายนั้นโดยเฉพาะ แล้วส่งให้เขาทางที่คุยกันอยู่แล้ว
 * ผู้เช่าเอารหัสไปทักบอท ความถูกต้องจึงมาจาก "เขาถือรหัสที่เราส่งให้เฉพาะเขา"
 * ไม่ใช่จากสิ่งที่เขาพิมพ์อ้างเอง
 *
 * รหัสใช้ได้ครั้งเดียวและมีวันหมดอายุ หลุดไปก็ใช้ได้ไม่นานและใช้ซ้ำไม่ได้
 */

/** ตัดตัวที่อ่านสับสนออก 0/O 1/I/L — ผู้เช่าต้องพิมพ์เองจากที่เห็นในแชต */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/** อายุรหัส 7 วัน นานพอให้ผู้เช่าที่ไม่ได้เปิดไลน์ทุกวันมาทำทัน */
export const CODE_TTL_DAYS = 7;

export interface LineLink {
  /** ตัวรหัสเอง ใช้เป็น id ของเอกสารด้วย */
  code: string;
  propertyId: string;
  tenantId: string;
  createdAt: string;
  expiresAt: string;
  /** ใช้ไปแล้วเมื่อไหร่ — ว่าง = ยังไม่ถูกใช้ */
  usedAt?: string;
  usedByLineUserId?: string;
}

export function newCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}

export function expiryFrom(now: Date): string {
  const end = new Date(now);
  end.setDate(end.getDate() + CODE_TTL_DAYS);
  return end.toISOString();
}

/**
 * ดึงรหัสออกจากข้อความที่ผู้เช่าพิมพ์มา
 *
 * คนพิมพ์ไม่เหมือนกัน: "ABC123", "abc 123", "ลงทะเบียน ABC-123", "รหัส abc123 ครับ"
 * จึงกวาดเอาเฉพาะตัวอักษรกับตัวเลข แล้วมองหากลุ่มที่ยาวเท่ารหัสพอดี
 * คืน null เมื่อไม่เจอ จะได้แยกออกว่า "ทักมาเฉยๆ" กับ "พิมพ์รหัสผิด"
 */
export function extractCode(text: string): string | null {
  const upper = text.toUpperCase();
  const candidates = upper.match(/[A-Z0-9]+/g) ?? [];

  for (const word of candidates) {
    if (word.length === CODE_LENGTH && [...word].every((c) => ALPHABET.includes(c))) return word;
  }

  // เผื่อคนพิมพ์คั่นกลาง เช่น ABC-123 หรือ ABC 123 — รวมร่างแล้วลองอีกที
  const joined = upper.replace(/[^A-Z0-9]/g, "");
  if (joined.length === CODE_LENGTH && [...joined].every((c) => ALPHABET.includes(c))) return joined;

  return null;
}

export type RedeemProblem = "not-found" | "used" | "expired" | "bound-elsewhere";

export const REDEEM_MESSAGE: Record<RedeemProblem, string> = {
  "not-found": "ไม่พบรหัสนี้ในระบบ กรุณาตรวจตัวอักษรอีกครั้ง หรือขอรหัสใหม่จากผู้จัดการ",
  used: "รหัสนี้ถูกใช้ไปแล้ว ถ้ายังไม่ได้ผูกบัญชี กรุณาขอรหัสใหม่จากผู้จัดการ",
  expired: "รหัสนี้หมดอายุแล้ว กรุณาขอรหัสใหม่จากผู้จัดการ",
  "bound-elsewhere": "บัญชีไลน์นี้ผูกกับผู้เช่ารายอื่นอยู่แล้ว กรุณาติดต่อผู้จัดการ",
};

/**
 * รหัสนี้ใช้ได้ไหม
 * แยก "ไม่เจอ" กับ "หมดอายุ" กับ "ใช้แล้ว" ออกจากกัน เพื่อบอกผู้เช่าได้ตรงจุด
 * ว่าต้องพิมพ์ใหม่ หรือต้องขอรหัสใหม่
 */
export function checkRedeemable(
  link: LineLink | null,
  now: Date,
  alreadyBoundTenantId?: string | null,
): RedeemProblem | null {
  if (!link) return "not-found";
  if (link.usedAt) return "used";
  if (new Date(link.expiresAt).getTime() <= now.getTime()) return "expired";
  // ไลน์ไอดีหนึ่งผูกได้ผู้เช่าเดียว ไม่งั้นบิลสองห้องจะไปโผล่ที่คนเดียวกัน
  if (alreadyBoundTenantId && alreadyBoundTenantId !== link.tenantId) return "bound-elsewhere";
  return null;
}
