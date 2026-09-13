import "server-only";
import { NextResponse } from "next/server";
import { BillEditError } from "./bill-edit";
import { LeaseOpError } from "./lease-ops";
import { getSelectedPropertyId, getSessionUser } from "./session";
import type { SessionUser } from "./types";

/**
 * ท่ามาตรฐานของ API ที่แก้ข้อมูล — ตรวจสิทธิ์และอาคารที่เลือกอยู่ในที่เดียว
 * ทุกเส้นเคยเขียนซ้ำกันหมด พอมีหลายเส้นขึ้นก็เริ่มหลุดไม่เท่ากัน
 */

export class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface EditorContext {
  user: SessionUser;
  propertyId: string;
}

/** ต้องล็อกอิน แก้ข้อมูลได้ และเลือกอาคารไว้แล้ว */
export async function requireEditor(action: string): Promise<EditorContext> {
  const user = await getSessionUser();
  if (!user) throw new ApiError("ยังไม่ได้ล็อกอิน", 401);
  if (user.role === "viewer") throw new ApiError(`ไม่มีสิทธิ์${action}`, 403);

  const propertyId = await getSelectedPropertyId();
  if (!propertyId) throw new ApiError("ยังไม่ได้เลือกอาคาร", 400);
  if (user.propertyIds.length > 0 && !user.propertyIds.includes(propertyId)) {
    throw new ApiError("ไม่มีสิทธิ์ในอาคารนี้", 403);
  }

  return { user, propertyId };
}

/** เจ้าของเท่านั้น — ใช้กับของที่ทำแล้วย้อนไม่ได้ เช่น ลบบิลทิ้ง */
export async function requireOwner(action: string): Promise<EditorContext> {
  const ctx = await requireEditor(action);
  if (ctx.user.role !== "owner") throw new ApiError(`เฉพาะเจ้าของเท่านั้นที่${action}ได้`, 403);
  return ctx;
}

/** เอกสารต้องมีจริงและอยู่ในอาคารที่เลือกอยู่ ไม่งั้นข้ามอาคารกันได้ */
export function requireSameProperty<T extends { propertyId: string }>(
  doc: T | null,
  propertyId: string,
  notFoundMessage: string,
): T {
  if (!doc || doc.propertyId !== propertyId) throw new ApiError(notFoundMessage, 404);
  return doc;
}

/**
 * ค่าเดิมเฉพาะฟิลด์ที่กำลังจะเปลี่ยน — ใช้เป็นฝั่ง before ของ auditLogs
 * เก็บทั้งเอกสารก็ได้ แต่พออ่านย้อนหลังจะหาไม่เจอว่าอะไรเปลี่ยนบ้าง
 */
export function before(doc: object, patch: Record<string, unknown>): Record<string, unknown> {
  const source = doc as Record<string, unknown>;
  return Object.fromEntries(Object.keys(patch).map((key) => [key, source[key]]));
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("ข้อมูลที่ส่งมาไม่ใช่ JSON ที่อ่านได้");
  }
}

/**
 * ห่อทั้งเส้นให้ตอบเป็น JSON เสมอ
 * ถ้าปล่อยให้ throw ทะลุออกไป Next จะตอบเป็นหน้า HTML แล้วฝั่งหน้าจอ
 * parse ไม่ได้ ขึ้นเป็น "Unexpected token <" ซึ่งไม่ช่วยอะไรเลย
 */
export async function handle(run: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json((await run()) ?? { ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof LeaseOpError || err instanceof BillEditError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("api error", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `เกิดข้อผิดพลาดที่เซิร์ฟเวอร์: ${detail}` }, { status: 500 });
  }
}
