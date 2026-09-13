/**
 * แก้ข้อมูลห้อง / ผู้เช่า / สัญญา — คำนวณล้วน ไม่แตะฐานข้อมูล
 *
 * แนวทางมาจากโครงข้อมูลใน types.ts ที่แยกสามอย่างออกจากกันแล้ว
 *   ห้อง   = ของกายภาพ ไม่รู้จักผู้เช่า
 *   ผู้เช่า = ตัวบุคคล ไม่ผูกกับห้อง
 *   สัญญา  = ความสัมพันธ์ระหว่างสองอันบน พร้อมเงื่อนไขเงิน
 *
 * สิ่งที่ "แก้" ได้ กับสิ่งที่ต้อง "ปิดของเก่าเปิดของใหม่" จึงต่างกันชัดเจน
 *
 *   แก้ได้ทันที
 *     - รายละเอียดห้อง (ชั้น ประเภท ราคาป้าย สภาพห้อง)
 *     - ข้อมูลส่วนตัวผู้เช่า (ชื่อ เบอร์ LINE ผู้ติดต่อฉุกเฉิน)
 *       บิลเก่าไม่เปลี่ยนตาม เพราะเก็บ tenantSnapshot ไว้ตั้งแต่วันออกบิล
 *     - เงื่อนไขเงินของสัญญาที่ยังเดินอยู่ (ค่าเช่า ค่าไฟ/น้ำต่อหน่วย วันครบกำหนด)
 *       มีผลกับบิลรอบถัดไป บิลที่ออกไปแล้วเก็บตัวเลข ณ วันออกไว้ในตัวมันเอง
 *
 *   แก้ตรงๆ ไม่ได้ ต้องปิดสัญญาเดิมแล้วเปิดใหม่
 *     - เปลี่ยนห้องของสัญญา (ย้ายห้อง)
 *     - เปลี่ยนผู้เช่าของสัญญา (คนใหม่เข้าแทน)
 *     เพราะบิลที่ออกไปแล้วชี้มาที่ leaseId และ roomId ถ้าย้ายปลายทางของ pointer
 *     ประวัติจะเล่าเรื่องผิด: บิลเดือนก่อนของห้อง 102 จะกลายเป็นของห้อง 205
 *
 * ห้องรู้ว่าใครอยู่ผ่าน activeLeaseId ช่องเดียว เข้า-ออกจึงต้องเขียนสองที่พร้อมกัน
 * (สัญญา + ห้อง) ทุกครั้ง ใช้ batch เสมอ ไม่งั้นห้องจะชี้ไปสัญญาที่จบแล้ว
 */

import type { IsoDate, Lease, Rates, Room, RoomCondition, RoomType, Tenant } from "./types";

export class LeaseOpError extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function num(value: unknown, field: string, { min = 0 }: { min?: number } = {}): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new LeaseOpError(`${field} ต้องเป็นตัวเลข`);
  if (n < min) throw new LeaseOpError(`${field} ต้องไม่น้อยกว่า ${min}`);
  return n;
}

function optionalDate(value: unknown, field: string): IsoDate | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value);
  if (!ISO_DATE.test(s)) throw new LeaseOpError(`${field} ต้องเป็นรูปแบบ YYYY-MM-DD`);
  return s;
}

/** ตัดคีย์ที่ไม่มีค่าออก — Firestore ปฏิเสธเอกสารที่มีค่าเป็น undefined */
function defined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/* ---------------------------------- ห้อง ---------------------------------- */

const ROOM_TYPES: RoomType[] = ["รายเดือน", "พาณิชย์"];
const CONDITIONS: RoomCondition[] = ["ready", "cleaning", "repair"];

export interface RoomEditInput {
  roomNo?: string;
  floor?: number | string;
  type?: string;
  baseRent?: number | string;
  condition?: string;
  note?: string;
}

/**
 * แก้รายละเอียดห้อง
 * activeLeaseId ไม่อยู่ในนี้โดยตั้งใจ — ใครอยู่ห้องไหนเปลี่ยนได้ทางเข้า/ย้ายออกเท่านั้น
 */
export function roomEditPatch(input: RoomEditInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (input.roomNo !== undefined) {
    const roomNo = input.roomNo.trim();
    if (!roomNo) throw new LeaseOpError("ต้องระบุเลขห้อง");
    patch.roomNo = roomNo;
  }
  if (input.floor !== undefined) patch.floor = num(input.floor, "ชั้น", { min: 0 });
  if (input.type !== undefined) {
    if (!ROOM_TYPES.includes(input.type as RoomType)) throw new LeaseOpError("ประเภทห้องไม่ถูกต้อง");
    patch.type = input.type;
  }
  if (input.baseRent !== undefined) patch.baseRent = num(input.baseRent, "ราคาป้าย");
  if (input.condition !== undefined) {
    if (!CONDITIONS.includes(input.condition as RoomCondition)) throw new LeaseOpError("สภาพห้องไม่ถูกต้อง");
    patch.condition = input.condition;
  }
  if (input.note !== undefined) patch.note = input.note.trim();

  if (Object.keys(patch).length === 0) throw new LeaseOpError("ไม่มีอะไรให้แก้");
  return patch;
}

/* --------------------------------- ผู้เช่า --------------------------------- */

export interface TenantEditInput {
  name?: string;
  nickname?: string;
  phone?: string;
  lineUserId?: string | null;
  emergencyContact?: string | null;
  note?: string;
}

/**
 * แก้ข้อมูลส่วนตัวผู้เช่า
 * ไม่แตะบิลเก่าเลย — บิลเก็บชื่อ ณ วันออกไว้แล้วใน tenantSnapshot
 * idCard ไม่ให้แก้จากหน้าจอ เพราะต้องเข้ารหัสก่อนเก็บ ยังไม่ได้ทำส่วนนั้น
 */
export function tenantEditPatch(input: TenantEditInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new LeaseOpError("ต้องระบุชื่อผู้เช่า");
    patch.name = name;
  }
  if (input.nickname !== undefined) patch.nickname = input.nickname.trim();
  if (input.phone !== undefined) patch.phone = input.phone.trim();
  if (input.lineUserId !== undefined) patch.lineUserId = input.lineUserId?.trim() || null;
  if (input.emergencyContact !== undefined) patch.emergencyContact = input.emergencyContact?.trim() || null;
  if (input.note !== undefined) patch.note = input.note.trim();

  if (Object.keys(patch).length === 0) throw new LeaseOpError("ไม่มีอะไรให้แก้");
  return patch;
}

/* --------------------------------- สัญญา ---------------------------------- */

export interface RatesInput {
  elec?: number | string;
  water?: number | string;
  ac?: number | string;
  internet?: number | string;
  parking?: number | string;
}

export function ratesFrom(input: RatesInput | undefined, fallback: Rates): Rates {
  if (!input) return fallback;
  return {
    elec: input.elec === undefined ? fallback.elec : num(input.elec, "ค่าไฟต่อหน่วย"),
    water: input.water === undefined ? fallback.water : num(input.water, "ค่าน้ำต่อหน่วย"),
    ac: input.ac === undefined ? fallback.ac : num(input.ac, "ค่าแอร์"),
    internet: input.internet === undefined ? fallback.internet : num(input.internet, "ค่าอินเทอร์เน็ต"),
    parking: input.parking === undefined ? fallback.parking : num(input.parking, "ค่าที่จอดรถ"),
  };
}

export interface LeaseTermsInput {
  rent?: number | string;
  deposit?: number | string;
  advance?: number | string;
  dueDay?: number | string;
  startDate?: string | null;
  endDate?: string | null;
  rates?: RatesInput;
  note?: string;
  /** ถ้าส่งมาแปลว่าพยายามย้ายห้อง/เปลี่ยนคน — ไม่รับ ต้องใช้ทางย้ายออก+เข้าใหม่ */
  roomId?: string;
  tenantId?: string;
}

/**
 * แก้เงื่อนไขของสัญญาที่มีอยู่
 * มีผลกับบิลรอบถัดไป ไม่ย้อนไปแก้บิลที่ออกไปแล้ว
 */
export function leaseTermsPatch(lease: Lease, input: LeaseTermsInput): Record<string, unknown> {
  if (input.roomId !== undefined && input.roomId !== lease.roomId) {
    throw new LeaseOpError("ย้ายห้องด้วยการแก้สัญญาไม่ได้ ให้ทำรายการย้ายออกแล้วทำสัญญาใหม่ในห้องใหม่");
  }
  if (input.tenantId !== undefined && input.tenantId !== lease.tenantId) {
    throw new LeaseOpError("เปลี่ยนผู้เช่าในสัญญาเดิมไม่ได้ ให้ปิดสัญญานี้แล้วทำสัญญาใหม่");
  }

  const patch: Record<string, unknown> = {};
  if (input.rent !== undefined) patch.rent = num(input.rent, "ค่าเช่า");
  if (input.deposit !== undefined) patch.deposit = num(input.deposit, "เงินประกัน");
  if (input.advance !== undefined) patch.advance = num(input.advance, "ค่าล่วงหน้า");
  if (input.dueDay !== undefined) {
    const day = num(input.dueDay, "วันครบกำหนด", { min: 1 });
    if (day > 28) throw new LeaseOpError("วันครบกำหนดต้องอยู่ระหว่าง 1-28 เพื่อให้ใช้ได้ทุกเดือน");
    patch.dueDay = day;
  }
  if (input.startDate !== undefined) patch.startDate = optionalDate(input.startDate, "วันเริ่มสัญญา");
  if (input.endDate !== undefined) patch.endDate = optionalDate(input.endDate, "วันสิ้นสุดสัญญา");
  if (input.rates !== undefined) patch.rates = ratesFrom(input.rates, lease.rates);
  if (input.note !== undefined) patch.note = input.note.trim();

  const start = (patch.startDate as string | null | undefined) ?? lease.startDate;
  const end = (patch.endDate as string | null | undefined) ?? lease.endDate;
  if (start && end && end < start) throw new LeaseOpError("วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา");

  if (Object.keys(patch).length === 0) throw new LeaseOpError("ไม่มีอะไรให้แก้");
  return patch;
}

/* ------------------------------ เข้าอยู่ / ย้ายออก ----------------------------- */

/** รหัสถัดไปจากชุดที่มีอยู่ เช่น T0001..T0018 → T0019 */
export function nextCode(existing: string[], prefix: string, width = 4): string {
  const max = existing.reduce((acc, id) => {
    if (!id.startsWith(prefix)) return acc;
    const n = Number(id.slice(prefix.length));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

export interface MoveInInput {
  startDate?: string | null;
  endDate?: string | null;
  rent?: number | string;
  deposit?: number | string;
  advance?: number | string;
  dueDay?: number | string;
  rates?: RatesInput;
  note?: string;
}

/**
 * สร้างสัญญาใหม่ให้ห้องว่าง
 * ผู้เรียกต้องตรวจก่อนว่าห้องว่างจริง แล้วเขียนสัญญากับ activeLeaseId ของห้องไปพร้อมกัน
 */
export function buildLease(args: {
  leaseId: string;
  room: Room;
  tenant: Tenant;
  defaults: { rates: Rates; dueDay: number };
  input: MoveInInput;
}): Lease {
  const { leaseId, room, tenant, defaults, input } = args;

  const startDate = optionalDate(input.startDate ?? new Date().toISOString().slice(0, 10), "วันเริ่มสัญญา");
  const endDate = optionalDate(input.endDate, "วันสิ้นสุดสัญญา");
  if (startDate && endDate && endDate < startDate) {
    throw new LeaseOpError("วันสิ้นสุดสัญญาต้องไม่มาก่อนวันเริ่มสัญญา");
  }

  const dueDay = input.dueDay === undefined ? defaults.dueDay : num(input.dueDay, "วันครบกำหนด", { min: 1 });
  if (dueDay > 28) throw new LeaseOpError("วันครบกำหนดต้องอยู่ระหว่าง 1-28 เพื่อให้ใช้ได้ทุกเดือน");

  return {
    id: leaseId,
    propertyId: room.propertyId,
    roomId: room.id,
    tenantId: tenant.id,
    status: "active",
    startDate,
    endDate,
    // ไม่กรอกค่าเช่ามา ใช้ราคาป้ายของห้อง
    rent: input.rent === undefined ? room.baseRent : num(input.rent, "ค่าเช่า"),
    deposit: input.deposit === undefined ? 0 : num(input.deposit, "เงินประกัน"),
    advance: input.advance === undefined ? 0 : num(input.advance, "ค่าล่วงหน้า"),
    rates: ratesFrom(input.rates, defaults.rates),
    dueDay,
    depositRefund: null,
    ...defined({ note: input.note?.trim() || undefined }),
  };
}

export interface MoveOutInput {
  endDate?: string | null;
  reason?: string;
  refundAmount?: number | string;
  refundDate?: string | null;
  refundNote?: string;
}

/**
 * ปิดสัญญา — คืนค่าที่ต้องเขียนลงสัญญา ส่วน activeLeaseId ของห้องผู้เรียกต้องล้างเอง
 * เงินประกันคืนเท่าไหร่บันทึกไว้ในสัญญา ไม่ใช่บิล เพราะไม่ใช่รายรับของรอบไหน
 */
export function moveOutPatch(lease: Lease, input: MoveOutInput): Record<string, unknown> {
  if (lease.status === "ended") throw new LeaseOpError("สัญญานี้ปิดไปแล้ว");

  const endDate = optionalDate(input.endDate ?? new Date().toISOString().slice(0, 10), "วันย้ายออก");
  if (endDate && lease.startDate && endDate < lease.startDate) {
    throw new LeaseOpError("วันย้ายออกต้องไม่มาก่อนวันเริ่มสัญญา");
  }

  const patch: Record<string, unknown> = { status: "ended", endDate };
  if (input.reason?.trim()) patch.endedReason = input.reason.trim();

  const amount = input.refundAmount === undefined || input.refundAmount === "" ? null : num(input.refundAmount, "เงินประกันที่คืน");
  if (amount !== null) {
    if (amount > lease.deposit) {
      throw new LeaseOpError(`คืนเกินเงินประกันที่รับไว้ (${lease.deposit.toLocaleString("th-TH")} บาท)`);
    }
    patch.depositRefund = {
      amount,
      date: optionalDate(input.refundDate ?? endDate, "วันคืนเงินประกัน") ?? "",
      note: input.refundNote?.trim() ?? "",
    };
  }

  return patch;
}
