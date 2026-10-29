/**
 * นำเข้าอาคารใหม่จากไฟล์ Excel — ห้อง ผู้เช่าปัจจุบัน สัญญา และเลขมิเตอร์ล่าสุด
 *
 * ไฟล์นี้ไม่รู้จัก Excel เลย รับแถวที่อ่านออกมาแล้วเป็นค่าธรรมดา (ข้อความ ตัวเลข วันที่)
 * เทสต์ได้ตรงๆ โดยไม่ต้องสร้างไฟล์ .xlsx และ template กับตัวอ่านใช้รายชื่อช่องชุดเดียวกันจากที่นี่
 * เพิ่มหรือเปลี่ยนชื่อช่องที่นี่ที่เดียว template ที่ดาวน์โหลดจะเปลี่ยนตาม
 *
 * นำเข้าเฉพาะสถานะปัจจุบัน ไม่นำเข้าบิลเก่าหรือยอดค้าง
 * ยอดค้างจากระบบเดิมเก็บต่อที่ระบบเดิม หรือใส่เป็นรายการอื่นในบิลแรกเอง
 */

import { previousCycle } from "../billing";
import { CONDITION_LABEL } from "../format";
import { meterReadingId } from "../ids";
import { nextCode } from "../lease-ops";
import type { Cycle, IsoDate, Lease, MeterReading, Property, Rates, Room, RoomCondition, RoomType, Tenant } from "../types";

/** ค่าในช่องหนึ่งช่อง หลังแกะสูตร ลิงก์ และตัวอักษรหลายสีออกแล้ว */
export type Cell = string | number | boolean | Date | null;

export const SHEET_PROPERTY = "อาคาร";
export const SHEET_ROOMS = "ห้องและผู้เช่า";

/*
 * ตัวเลือกของช่องที่ต้องเป็นค่าเดียวกันทุกอาคาร — template ทำเป็น dropdown จากรายการนี้
 * และตัวอ่านเทียบกับรายการเดียวกัน พิมพ์ "รายเดือ" หรือ "ห้องพร้อม" มาจึงถูกจับได้ ไม่ใช่เดาให้
 */
export const ROOM_TYPE_OPTIONS: readonly RoomType[] = ["รายเดือน", "พาณิชย์"];

/** สภาพห้องใช้คำเดียวกับที่ขึ้นในแอป คนกรอกจะได้ไม่ต้องจำสองชุด */
export const CONDITION_OPTIONS = Object.values(CONDITION_LABEL);

/** วันครบกำหนดต้องมีในทุกเดือน วันที่ 29-31 ไม่มีในกุมภาพันธ์ */
export const DUE_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => String(i + 1));

/**
 * เดือนที่เลือกเริ่มออกบิลได้ — ย้อนหลังหนึ่งเดือนถึงล่วงหน้าหนึ่งปี แบบ 11/2569
 * สร้างตามวันที่ดาวน์โหลด template ไฟล์ที่โหลดไว้นานแล้วก็ยังพิมพ์เดือนอื่นเองได้
 */
export function billingMonthOptions(today: Date): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1 + i, 1));
    return `${d.getUTCMonth() + 1}/${d.getUTCFullYear() + 543}`;
  });
}

/**
 * การตรวจในช่องของ Excel
 *   list     เลือกจาก dropdown
 *   number   ตัวเลขไม่ติดลบ มีทศนิยมได้ (เงิน ค่าต่อหน่วย มิเตอร์)
 *   integer  จำนวนเต็มไม่ติดลบ (ชั้น)
 */
export type CellRule =
  | { kind: "list"; options: readonly string[] }
  | { kind: "number" }
  | { kind: "integer" };

/* --------------------------------- ชีตอาคาร -------------------------------- */

export interface PropertyField {
  key:
    | "id" | "name" | "shortName" | "address" | "phone"
    | "elec" | "water" | "ac" | "internet" | "parking"
    | "dueDay" | "firstCycle";
  label: string;
  required?: boolean;
  /** ค่าที่ใส่ไว้ให้ใน template */
  example: string | number;
  hint: string;
  /** เดือนเริ่มออกบิลไม่มีในนี้ — ตัวเลือกขึ้นกับวันที่สร้าง template ดู billingMonthOptions */
  rule?: CellRule;
}

export const PROPERTY_FIELDS: PropertyField[] = [
  { key: "id", label: "รหัสอาคาร", required: true, example: "", hint: "เช่น wlp2 — ภาษาอังกฤษตัวเล็ก ตัวเลข หรือ - เท่านั้น เปลี่ยนภายหลังไม่ได้" },
  { key: "name", label: "ชื่ออาคาร", required: true, example: "", hint: "เช่น วิไลเพลส 2 — ชื่อที่ขึ้นในแอปและหัวใบแจ้งหนี้" },
  { key: "shortName", label: "ชื่อย่อ", example: "", hint: "เช่น WLP2 · ไม่ใส่จะใช้รหัสอาคารตัวใหญ่" },
  { key: "address", label: "ที่อยู่", example: "", hint: "" },
  { key: "phone", label: "เบอร์โทรอาคาร", example: "", hint: "พิมพ์ลงใบแจ้งหนี้และใบจดมิเตอร์" },
  { key: "elec", label: "ค่าไฟ (บาท/หน่วย)", required: true, example: 8, hint: "ค่าเริ่มต้นของทุกห้อง", rule: { kind: "number" } },
  { key: "water", label: "ค่าน้ำ (บาท/หน่วย)", required: true, example: 20, hint: "ค่าเริ่มต้นของทุกห้อง", rule: { kind: "number" } },
  { key: "ac", label: "ค่าแอร์ (บาท/เดือน)", example: 0, hint: "ไม่มีใส่ 0 · ห้องที่ต่างจากนี้ใส่ในชีตห้อง", rule: { kind: "number" } },
  { key: "internet", label: "ค่าอินเทอร์เน็ต (บาท/เดือน)", example: 0, hint: "ไม่มีใส่ 0", rule: { kind: "number" } },
  { key: "parking", label: "ค่าที่จอดรถ (บาท/เดือน)", example: 0, hint: "ไม่มีใส่ 0", rule: { kind: "number" } },
  { key: "dueDay", label: "ชำระภายในวันที่", example: 5, hint: "วันที่ 1-28 ของเดือนถัดไป", rule: { kind: "list", options: DUE_DAY_OPTIONS } },
  {
    key: "firstCycle",
    label: "เริ่มออกบิลในระบบนี้ตั้งแต่เดือน",
    required: true,
    example: "",
    hint: "เลือกจากรายการ — เลขมิเตอร์ล่าสุดในชีตห้องจะเป็นเลขครั้งก่อนของบิลเดือนนี้",
  },
];

/* --------------------------------- ชีตห้อง -------------------------------- */

export interface RoomColumn {
  key:
    | "roomNo" | "floor" | "type" | "condition" | "baseRent"
    | "tenantName" | "nickname" | "phone"
    | "startDate" | "endDate" | "rent" | "deposit" | "advance"
    | "ac" | "internet" | "parking"
    | "elec" | "water" | "note";
  label: string;
  required?: boolean;
  /** กลุ่มของช่อง — ใช้ระบายสีหัวตารางให้รู้ว่าช่องไหนเว้นได้ถ้าห้องว่าง */
  group: "room" | "tenant" | "meter";
  width: number;
  /** ช่องที่ต้องเก็บเป็นข้อความ ไม่งั้น Excel ตัดเลข 0 หน้าเบอร์โทรทิ้ง */
  text?: boolean;
  date?: boolean;
  hint: string;
  rule?: CellRule;
}

export const ROOM_COLUMNS: RoomColumn[] = [
  { key: "roomNo", label: "เลขห้อง", required: true, group: "room", width: 10, text: true, hint: "ห้ามซ้ำกัน" },
  { key: "floor", label: "ชั้น", group: "room", width: 7, hint: "ไม่ใส่จะเดาจากเลขห้อง เช่น 305 = ชั้น 3", rule: { kind: "integer" } },
  { key: "type", label: "ประเภท", group: "room", width: 11, hint: "เลือกจากรายการ · ไม่ใส่ = รายเดือน", rule: { kind: "list", options: ROOM_TYPE_OPTIONS } },
  {
    key: "condition",
    label: "สภาพห้อง",
    group: "room",
    width: 17,
    hint: `เลือกจากรายการ · ไม่ใส่ = ${CONDITION_LABEL.ready}`,
    rule: { kind: "list", options: CONDITION_OPTIONS },
  },
  { key: "baseRent", label: "ราคาป้าย", required: true, group: "room", width: 11, hint: "ค่าเช่าตอนห้องว่าง", rule: { kind: "number" } },
  { key: "tenantName", label: "ชื่อผู้เช่า", group: "tenant", width: 22, hint: "ห้องว่างเว้นช่องผู้เช่าทั้งหมด" },
  { key: "nickname", label: "ชื่อเล่น", group: "tenant", width: 10, hint: "" },
  { key: "phone", label: "เบอร์โทร", group: "tenant", width: 13, text: true, hint: "" },
  { key: "startDate", label: "วันเริ่มสัญญา", group: "tenant", width: 13, date: true, hint: "เช่น 1/6/2568" },
  { key: "endDate", label: "วันสิ้นสุดสัญญา", group: "tenant", width: 13, date: true, hint: "ไม่มีกำหนดเว้นว่าง" },
  { key: "rent", label: "ค่าเช่าจริง", group: "tenant", width: 11, hint: "ไม่ใส่ = ราคาป้าย", rule: { kind: "number" } },
  { key: "deposit", label: "เงินประกัน", group: "tenant", width: 11, hint: "", rule: { kind: "number" } },
  { key: "advance", label: "ค่าเช่าล่วงหน้า", group: "tenant", width: 12, hint: "", rule: { kind: "number" } },
  { key: "ac", label: "ค่าแอร์/เดือน", group: "tenant", width: 11, hint: "ไม่ใส่ = ค่าของอาคาร", rule: { kind: "number" } },
  { key: "internet", label: "ค่าเน็ต/เดือน", group: "tenant", width: 11, hint: "ไม่ใส่ = ค่าของอาคาร", rule: { kind: "number" } },
  { key: "parking", label: "ค่าที่จอด/เดือน", group: "tenant", width: 12, hint: "ไม่ใส่ = ค่าของอาคาร", rule: { kind: "number" } },
  { key: "elec", label: "มิเตอร์ไฟล่าสุด", group: "meter", width: 13, hint: "เลขบนหน้าปัดครั้งล่าสุด", rule: { kind: "number" } },
  { key: "water", label: "มิเตอร์น้ำล่าสุด", group: "meter", width: 13, hint: "ใส่คู่กับมิเตอร์ไฟ", rule: { kind: "number" } },
  { key: "note", label: "หมายเหตุ", group: "room", width: 20, hint: "" },
];

/* --------------------------------- ผลลัพธ์ -------------------------------- */

export interface ImportIssue {
  sheet: string;
  /** แถวตามที่เห็นใน Excel (เริ่มที่ 1) — null = ทั้งชีต */
  row: number | null;
  message: string;
}

export interface ImportPlan {
  property: Property;
  rooms: Room[];
  tenants: Tenant[];
  leases: Lease[];
  meterReadings: MeterReading[];
  firstCycle: Cycle;
}

export interface ImportResult {
  plan: ImportPlan | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export interface SheetRow {
  /** เลขแถวใน Excel */
  row: number;
  cells: Partial<Record<RoomColumn["key"], Cell>>;
}

export interface ImportInput {
  /** ค่าของแต่ละช่องในชีตอาคาร ตามป้ายชื่อในคอลัมน์ A */
  property: Partial<Record<PropertyField["key"], Cell>>;
  rooms: SheetRow[];
  /** รหัสผู้เช่าที่มีอยู่แล้วทุกอาคาร — รหัสผู้เช่าใช้ร่วมกันทั้งระบบ ต้องต่อเลขไม่ให้ชน */
  existingTenantIds: string[];
  /** วันนี้ — ส่งเข้ามาเพื่อให้เทสต์ได้ผลเท่าเดิมทุกครั้ง */
  today: IsoDate;
}

/* ------------------------------- แปลงค่าในช่อง ------------------------------ */

function isBlank(value: Cell | undefined): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function cellText(value: Cell | undefined): string {
  if (isBlank(value)) return "";
  if (value instanceof Date) return isoFromDate(value);
  return String(value).trim();
}

/** ตัวเลขจากช่อง — รับ "3,500" และ " 3500 บาท" ด้วย เพราะคนพิมพ์มาแบบนั้นจริง */
export function cellNumber(value: Cell | undefined): number | null {
  if (isBlank(value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const cleaned = String(value).replace(/,/g, "").replace(/บาท/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/**
 * เบอร์โทร — Excel ชอบแปลงเป็นตัวเลขแล้วตัด 0 ข้างหน้าทิ้ง 0812345678 กลายเป็น 812345678
 * เบอร์ไทย 9 หลักที่ไม่มี 0 นำ เติมกลับให้
 */
export function cellPhone(value: Cell | undefined): string {
  const text = typeof value === "number" ? String(Math.trunc(value)) : cellText(value);
  return /^[1-9]\d{8}$/.test(text) ? `0${text}` : text;
}

/** วันที่จาก Excel มาเป็นเวลาเที่ยงคืน UTC อ่านด้วย UTC เสมอ ไม่งั้นเลื่อนไปหนึ่งวันตามเขตเวลา */
function isoFromDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/**
 * ช่องวันที่ของ Excel ที่พิมพ์ปี พ.ศ. ลงไป — Excel ไม่รู้จัก พ.ศ. เก็บเป็นปี 2568 ตรงๆ
 * ปีเกิน 2400 คือ พ.ศ. แน่นอน ไม่มีสัญญาเช่าในปี ค.ศ. 2400
 */
function isoFromExcelDate(date: Date): IsoDate | null {
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  return validDate(y, date.getUTCMonth() + 1, date.getUTCDate());
}

function validDate(y: number, m: number, d: number): IsoDate | null {
  // ปีพุทธศักราชแปลงเป็นคริสต์ศักราช — คนไทยพิมพ์ 2568 มากกว่า 2025
  const year = y > 2400 ? y - 543 : y;
  const date = new Date(Date.UTC(year, m - 1, d));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return isoFromDate(date);
}

/**
 * วันที่ — รับทั้งช่องวันที่ของ Excel, 2025-06-01, และ 1/6/2568 (วัน/เดือน/ปี แบบไทย)
 * คืน undefined = ว่าง, null = อ่านไม่ออก
 */
export function cellDate(value: Cell | undefined): IsoDate | null | undefined {
  if (isBlank(value)) return undefined;
  if (value instanceof Date) return isoFromExcelDate(value);

  const text = String(value).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** เดือน — รับ 11/2569, 11/2026, 2026-11 และช่องวันที่ของ Excel คืน "202611" */
export function cellCycle(value: Cell | undefined): Cycle | null | undefined {
  if (isBlank(value)) return undefined;
  if (value instanceof Date) return isoFromExcelDate(value)?.slice(0, 7).replace("-", "") ?? null;

  const text = String(value).trim();
  let year: number;
  let month: number;
  let m = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
  } else if ((m = /^(\d{1,2})[/.-](\d{4})$/.exec(text))) {
    year = Number(m[2]);
    month = Number(m[1]);
  } else {
    const date = cellDate(value);
    return date ? date.slice(0, 7).replace("-", "") : null;
  }
  if (year > 2400) year -= 543;
  if (month < 1 || month > 12) return null;
  return `${year}${String(month).padStart(2, "0")}`;
}

/** ชั้นจากเลขห้อง — 305 = ชั้น 3, 1201 = ชั้น 12 เลขห้องแบบอื่นเดาไม่ได้ */
export function floorFromRoomNo(roomNo: string): number | null {
  const m = /^(\d+)(\d{2})$/.exec(roomNo);
  return m ? Number(m[1]) : null;
}

/* --------------------------------- ตัวแปลง -------------------------------- */

export const PROPERTY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;

export function planImport(input: ImportInput): ImportResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const propErr = (message: string) => errors.push({ sheet: SHEET_PROPERTY, row: null, message });

  /* --- อาคาร --- */
  const p = input.property;
  const id = cellText(p.id).toLowerCase();
  if (!id) propErr("ต้องใส่รหัสอาคาร");
  else if (!PROPERTY_ID_PATTERN.test(id)) propErr(`รหัสอาคาร "${id}" ใช้ได้เฉพาะ a-z, 0-9 และ - (2-31 ตัว)`);

  const name = cellText(p.name);
  if (!name) propErr("ต้องใส่ชื่ออาคาร");

  const rate = (key: PropertyField["key"], label: string, required: boolean): number => {
    const n = cellNumber(p[key]);
    if (n === null) {
      if (required) propErr(`ต้องใส่${label}`);
      return 0;
    }
    if (Number.isNaN(n) || n < 0) {
      propErr(`${label} ต้องเป็นตัวเลขไม่ติดลบ (ได้ "${cellText(p[key])}")`);
      return 0;
    }
    return n;
  };
  const defaultRates: Rates = {
    elec: rate("elec", "ค่าไฟ", true),
    water: rate("water", "ค่าน้ำ", true),
    ac: rate("ac", "ค่าแอร์", false),
    internet: rate("internet", "ค่าอินเทอร์เน็ต", false),
    parking: rate("parking", "ค่าที่จอดรถ", false),
  };

  let dueDay = 5;
  const dueRaw = cellNumber(p.dueDay);
  if (dueRaw !== null) {
    if (!Number.isInteger(dueRaw) || dueRaw < 1 || dueRaw > 28) propErr("ชำระภายในวันที่ ต้องเป็น 1-28 เพื่อให้ใช้ได้ทุกเดือน");
    else dueDay = dueRaw;
  }

  const firstCycle = cellCycle(p.firstCycle);
  if (firstCycle === undefined) propErr("ต้องใส่เดือนที่เริ่มออกบิลในระบบนี้ เช่น 11/2569");
  else if (firstCycle === null) propErr(`อ่านเดือนที่เริ่มออกบิลไม่ออก "${cellText(p.firstCycle)}" — ใช้รูปแบบ 11/2569`);

  /* --- ห้อง --- */
  const rows = input.rooms.filter((r) => ROOM_COLUMNS.some((c) => !isBlank(r.cells[c.key])));
  if (rows.length === 0) errors.push({ sheet: SHEET_ROOMS, row: null, message: "ยังไม่มีห้องเลย" });

  const rooms: Room[] = [];
  const tenants: Tenant[] = [];
  const leases: Lease[] = [];
  const meterReadings: MeterReading[] = [];
  const seenRoomNo = new Map<string, number>();
  const tenantIds = [...input.existingTenantIds];
  const readingCycle = firstCycle ? previousCycle(firstCycle) : "";

  for (const { row, cells } of rows) {
    const rowErrors: string[] = [];
    const err = (message: string) => rowErrors.push(message);

    const num = (key: RoomColumn["key"], label: string): number | null => {
      const n = cellNumber(cells[key]);
      if (n !== null && (Number.isNaN(n) || n < 0)) {
        err(`${label} ต้องเป็นตัวเลขไม่ติดลบ (ได้ "${cellText(cells[key])}")`);
        return null;
      }
      return n;
    };

    const roomNo = cellText(cells.roomNo);
    if (!roomNo) err("ไม่มีเลขห้อง");
    else if (seenRoomNo.has(roomNo)) err(`เลขห้อง ${roomNo} ซ้ำกับแถว ${seenRoomNo.get(roomNo)}`);
    else seenRoomNo.set(roomNo, row);

    let floor = num("floor", "ชั้น");
    if (floor !== null && !Number.isInteger(floor)) {
      err(`ชั้นต้องเป็นจำนวนเต็ม (ได้ "${cellText(cells.floor)}")`);
      floor = null;
    }
    if (floor === null && roomNo && !rowErrors.length) {
      floor = floorFromRoomNo(roomNo);
      if (floor === null) err(`เดาชั้นจากเลขห้อง ${roomNo} ไม่ได้ ใส่ช่องชั้นด้วย`);
    }

    const typeText = cellText(cells.type);
    if (typeText && !ROOM_TYPE_OPTIONS.includes(typeText as RoomType)) {
      err(`ประเภทห้องต้องเลือกจากรายการ: ${ROOM_TYPE_OPTIONS.join(", ")} (ได้ "${typeText}")`);
    }
    const type: RoomType = typeText === "พาณิชย์" ? "พาณิชย์" : "รายเดือน";

    const conditionText = cellText(cells.condition);
    const condition = (Object.keys(CONDITION_LABEL) as RoomCondition[]).find(
      (key) => CONDITION_LABEL[key] === conditionText,
    );
    if (conditionText && !condition) {
      err(`สภาพห้องต้องเลือกจากรายการ: ${CONDITION_OPTIONS.join(", ")} (ได้ "${conditionText}")`);
    }

    const rent = num("rent", "ค่าเช่าจริง");
    let baseRent = num("baseRent", "ราคาป้าย");
    if (baseRent === null) {
      // ห้องที่มีคนอยู่ ใส่แค่ค่าเช่าจริงก็พอ ใช้เป็นราคาป้ายไปด้วย
      if (rent !== null) baseRent = rent;
      else if (isBlank(cells.baseRent)) err("ไม่มีราคาป้าย");
    }

    /* ผู้เช่า — มีชื่อ = มีคนอยู่ ไม่มีชื่อแต่มีข้อมูลสัญญา = กรอกตกหล่น ไม่ใช่ห้องว่าง */
    const tenantName = cellText(cells.tenantName);
    const tenantOnly: RoomColumn["key"][] = ["nickname", "phone", "startDate", "endDate", "deposit", "advance"];
    if (!tenantName && tenantOnly.some((k) => !isBlank(cells[k]))) {
      err("มีข้อมูลผู้เช่าแต่ไม่มีชื่อผู้เช่า — ห้องว่างให้เว้นช่องผู้เช่าทั้งหมด");
    }

    const startDate = cellDate(cells.startDate);
    if (startDate === null) err(`อ่านวันเริ่มสัญญาไม่ออก "${cellText(cells.startDate)}" — ใช้รูปแบบ 1/6/2568`);
    const endDate = cellDate(cells.endDate);
    if (endDate === null) err(`อ่านวันสิ้นสุดสัญญาไม่ออก "${cellText(cells.endDate)}" — ใช้รูปแบบ 1/6/2569`);
    if (startDate && endDate && endDate < startDate) err("วันสิ้นสุดสัญญามาก่อนวันเริ่มสัญญา");

    const deposit = num("deposit", "เงินประกัน");
    const advance = num("advance", "ค่าเช่าล่วงหน้า");
    const ac = num("ac", "ค่าแอร์");
    const internet = num("internet", "ค่าเน็ต");
    const parking = num("parking", "ค่าที่จอด");

    /* มิเตอร์ — ต้องมาคู่ ใส่ไฟอย่างเดียวแล้วน้ำจะเริ่มจาก 0 กลายเป็นบิลน้ำหลายพันหน่วย */
    const elec = num("elec", "มิเตอร์ไฟ");
    const water = num("water", "มิเตอร์น้ำ");
    if ((elec === null) !== (water === null) && !rowErrors.some((e) => e.startsWith("มิเตอร์"))) {
      err("ใส่มิเตอร์ไฟกับมิเตอร์น้ำให้ครบทั้งคู่ หรือเว้นทั้งคู่");
    }

    if (rowErrors.length > 0) {
      for (const message of rowErrors) errors.push({ sheet: SHEET_ROOMS, row, message });
      continue;
    }
    if (!id) continue;

    const room: Room = {
      id: `${id}-${roomNo}`,
      propertyId: id,
      roomNo,
      floor: floor ?? 0,
      type,
      baseRent: baseRent ?? 0,
      condition: condition ?? "ready",
      activeLeaseId: null,
      ...(cellText(cells.note) ? { note: cellText(cells.note) } : {}),
    };

    if (tenantName) {
      const tenantId = nextCode(tenantIds, "T");
      tenantIds.push(tenantId);
      tenants.push({
        id: tenantId,
        propertyId: id,
        name: tenantName,
        nickname: cellText(cells.nickname),
        phone: cellPhone(cells.phone),
        photoUrl: null,
        lineUserId: null,
        idCard: null,
        emergencyContact: null,
      });

      const lease: Lease = {
        id: `L-${tenantId}`,
        propertyId: id,
        roomId: room.id,
        tenantId,
        status: "active",
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        rent: rent ?? room.baseRent,
        deposit: deposit ?? 0,
        advance: advance ?? 0,
        rates: {
          elec: defaultRates.elec,
          water: defaultRates.water,
          ac: ac ?? defaultRates.ac,
          internet: internet ?? defaultRates.internet,
          parking: parking ?? defaultRates.parking,
        },
        dueDay,
        depositRefund: null,
      };
      leases.push(lease);
      room.activeLeaseId = lease.id;

      if (!startDate) warnings.push({ sheet: SHEET_ROOMS, row, message: `ห้อง ${roomNo} ไม่มีวันเริ่มสัญญา` });
    }

    if (elec !== null && water !== null && readingCycle) {
      // เลขที่ยกมาไม่ได้มาจากการใช้จริงในระบบนี้ ครั้งก่อนกับครั้งนี้จึงเท่ากัน ไม่มีหน่วยที่ใช้
      meterReadings.push({
        id: meterReadingId(id, readingCycle, roomNo),
        propertyId: id,
        roomId: room.id,
        cycle: readingCycle,
        elecPrevious: elec,
        elecCurrent: elec,
        waterPrevious: water,
        waterCurrent: water,
        readAt: input.today,
        readBy: "นำเข้าจาก Excel",
      });
    } else if (tenantName) {
      warnings.push({
        sheet: SHEET_ROOMS,
        row,
        message: `ห้อง ${roomNo} ไม่มีเลขมิเตอร์ล่าสุด — บิลแรกต้องกรอกเลขครั้งก่อนเอง`,
      });
    }

    rooms.push(room);
  }

  if (errors.length > 0 || !firstCycle) return { plan: null, errors, warnings };

  const property: Property = {
    id,
    name,
    shortName: (cellText(p.shortName) || id).toUpperCase(),
    address: cellText(p.address),
    photoUrl: null,
    phone: cellPhone(p.phone),
    floors: Math.max(1, ...rooms.map((r) => r.floor)),
    defaultRates,
    paymentDueDay: dueDay,
    active: true,
  };

  return { plan: { property, rooms, tenants, leases, meterReadings, firstCycle }, errors, warnings };
}
