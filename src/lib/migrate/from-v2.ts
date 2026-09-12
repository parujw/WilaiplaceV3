/**
 * แปลงข้อมูล V2 (Google Sheets) → เอกสาร V3
 *
 * ใช้ร่วมกันระหว่าง scripts/migrate-v2.ts (เขียนลง Firestore)
 * กับ src/lib/db/local.ts (โหมดสาธิต ไม่ต้องต่อ Firebase)
 *
 * ตัวแปลงนี้ไม่ "ซ่อม" ข้อมูลเงียบๆ อะไรที่ V2 ไม่ตรงกันจะถูกบันทึกไว้ใน issues
 */

import type {
  Bill,
  BillLine,
  Lease,
  MeterReading,
  Payment,
  PaymentMethod,
  Property,
  Room,
  RoomType,
  Tenant,
  UtilityCost,
} from "../types";

export interface V2Export {
  property: { code: string; name: string; address: string; phone: string; floors: number };
  settings: Record<string, string | number>;
  rooms: Array<{ roomNo: string; floor: number; type: string; rent: number; deposit: number; note: string }>;
  tenants: Array<{
    code: string; name: string; nickname: string; phone: string; roomNo: string;
    start: string; end: string; rent: number; deposit: number; advance: number;
    elec: number; water: number; internet: number; ac: number; parking: number;
    dueDay: number; status: string; note: string;
  }>;
  bills: Array<{
    billNo: string; cycle: string; issued: string; roomNo: string; tenant: string;
    rent: number; deposit?: number;
    elecPrev: number; elecCur: number; elecRate: number;
    waterPrev: number; waterCur: number; waterRate: number;
    internet: number; ac: number; parking: number; other: number;
    carryOver: number; discount: number;
    total: number; paid: number; due: string; paidAt: string;
    method: string; status: string; by: string; note: string;
  }>;
  payments: Array<{
    receiptNo: string; date: string; roomNo: string; amount: number;
    method: string; bankRef: string; billNo: string; note: string;
  }>;
  expenses: unknown[];
  maintenance: unknown[];
}

export interface MigrationResult {
  property: Property;
  rooms: Room[];
  tenants: Tenant[];
  leases: Lease[];
  bills: Bill[];
  payments: Payment[];
  meterReadings: MeterReading[];
  utilityCosts: UtilityCost[];
  /** ข้อมูล V2 ที่ไม่ตรงกัน — ต้องให้คนดูก่อนใช้งานจริง */
  issues: string[];
}

/** "09/07/2026" → "2026-07-09" ; ค่าว่าง/ผิดรูป → null */
export function parseThaiDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  // ปีใน V2 เก็บเป็น ค.ศ. อยู่แล้ว แต่เผื่อเจอ พ.ศ. หลุดมา
  const year = Number(y) > 2400 ? Number(y) - 543 : Number(y);
  return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseMethod(raw: string): PaymentMethod {
  const s = (raw || "").trim();
  if (s.includes("เงินสด")) return "cash";
  if (s.includes("โอน")) return "transfer";
  if (s.toLowerCase().includes("promptpay") || s.includes("พร้อมเพย์")) return "promptpay";
  return "other";
}

/** cycle ต้องเป็น string 6 หลักเสมอ — บั๊กที่เสียเวลาแก้นานที่สุดใน V2 มาจากตรงนี้ */
export function normalizeCycle(raw: string | number): string {
  const s = String(raw).replace(/\D/g, "");
  if (s.length !== 6) throw new Error(`cycle ไม่ถูกรูปแบบ: ${String(raw)}`);
  return s;
}

export function cycleOf(isoDate: string): string {
  return isoDate.slice(0, 4) + isoDate.slice(5, 7);
}

const roomId = (propertyId: string, roomNo: string) => `${propertyId}-${roomNo}`;

export function migrateV2(v2: V2Export, propertyId = "wlp1"): MigrationResult {
  const issues: string[] = [];
  const s = v2.settings;
  const num = (k: string, fallback: number) => (typeof s[k] === "number" ? (s[k] as number) : fallback);

  const property: Property = {
    id: propertyId,
    name: v2.property.name,
    shortName: v2.property.code,
    address: v2.property.address,
    photoUrl: null,
    phone: String(s.property_phone ?? v2.property.phone),
    floors: v2.property.floors,
    defaultRates: {
      elec: num("electricity_rate", 8),
      water: num("water_rate", 20),
      ac: num("ac_fee", 500),
      internet: num("internet_fee", 0),
      parking: num("parking_fee", 0),
    },
    paymentDueDay: num("payment_due_day", 5),
    active: true,
  };

  const rooms: Room[] = v2.rooms.map((r) => ({
    id: roomId(propertyId, r.roomNo),
    propertyId,
    roomNo: r.roomNo,
    floor: r.floor,
    type: (r.type === "พาณิชย์" ? "พาณิชย์" : "รายเดือน") as RoomType,
    baseRent: r.rent,
    condition: "ready",
    // ตั้งทีหลังตอนสร้างสัญญา — ห้องไม่เก็บชื่อผู้เช่า
    activeLeaseId: null,
    note: r.note || undefined,
  }));
  const roomByNo = new Map(rooms.map((r) => [r.roomNo, r]));

  /* --- ผู้เช่า + สัญญา: V2 ปนกันอยู่ในชีตเดียว V3 แยกเป็นสองก้อน --- */
  const tenants: Tenant[] = [];
  const leases: Lease[] = [];
  const seenCodes = new Set<string>();

  for (const t of v2.tenants) {
    let code = t.code;
    if (code.endsWith("-DUP")) {
      // V2 ใช้รหัสซ้ำ — ออกรหัสใหม่ให้แถวที่มาทีหลัง
      const base = code.replace("-DUP", "");
      code = `T${String(Number(base.slice(1)) + 5).padStart(4, "0")}`;
      issues.push(`รหัสผู้เช่า ${base} ซ้ำกัน 2 คน — ออกรหัสใหม่ ${code} ให้ห้อง ${t.roomNo}`);
    }
    if (seenCodes.has(code)) {
      issues.push(`ข้ามแถวรหัสผู้เช่าซ้ำ ${code}`);
      continue;
    }
    seenCodes.add(code);

    const room = roomByNo.get(t.roomNo);
    if (!room) {
      issues.push(`ผู้เช่า ${code} อ้างห้อง ${t.roomNo} ที่ไม่มีในชีตห้อง — ข้ามแถวนี้`);
      continue;
    }

    const displayName = t.name || t.nickname || `ผู้เช่าห้อง ${t.roomNo}`;
    if (!t.name && !t.nickname) issues.push(`ผู้เช่า ${code} (ห้อง ${t.roomNo}) ไม่มีชื่อใน V2`);

    tenants.push({
      id: code,
      propertyId,
      name: displayName,
      nickname: t.nickname,
      phone: t.phone,
      photoUrl: null,
      lineUserId: null,
      idCard: null,
      emergencyContact: null,
      note: t.note || undefined,
    });

    const start = parseThaiDate(t.start);
    const end = parseThaiDate(t.end);
    if (!start) issues.push(`สัญญาของ ${code} (ห้อง ${t.roomNo}) ไม่มีวันเริ่มสัญญา`);

    const moved = t.status.includes("ย้ายออก");
    const expired = t.status.toLowerCase() === "expired";
    const status: Lease["status"] = moved ? "ended" : "active";
    if (expired) {
      issues.push(`สัญญาของ ${code} (ห้อง ${t.roomNo}) V2 ทำเครื่องหมาย Expired แต่ยังมีบิลเดินอยู่ — ย้ายมาเป็น active ให้ตรวจสอบ`);
    }

    leases.push({
      id: `L-${code}`,
      propertyId,
      roomId: room.id,
      tenantId: code,
      status,
      startDate: start,
      endDate: end,
      rent: t.rent,
      deposit: t.deposit,
      advance: t.advance,
      rates: {
        elec: t.elec || property.defaultRates.elec,
        water: t.water || property.defaultRates.water,
        ac: t.ac,
        internet: t.internet,
        parking: t.parking,
      },
      dueDay: t.dueDay || property.paymentDueDay,
      depositRefund: null,
      endedReason: moved ? "ย้ายออก (ยกมาจาก V2)" : undefined,
      note: t.note || undefined,
    });
  }

  // ผูกสัญญาที่ยัง active เข้ากับห้อง — ห้องละหนึ่งสัญญาเท่านั้น
  for (const lease of leases) {
    if (lease.status !== "active") continue;
    const room = rooms.find((r) => r.id === lease.roomId)!;
    if (room.activeLeaseId) {
      issues.push(`ห้อง ${room.roomNo} มีสัญญา active ซ้อนกัน (${room.activeLeaseId} และ ${lease.id})`);
      continue;
    }
    room.activeLeaseId = lease.id;
  }

  const leaseByRoomId = new Map(leases.filter((l) => l.status === "active").map((l) => [l.roomId, l]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  /* --- บิล: สร้าง lines จากคอลัมน์แนวนอนของ V2 --- */
  const bills: Bill[] = [];
  const meterReadings: MeterReading[] = [];

  for (const b of v2.bills) {
    const room = roomByNo.get(b.roomNo);
    if (!room) {
      issues.push(`บิล ${b.billNo} อ้างห้อง ${b.roomNo} ที่ไม่มีอยู่ — ข้าม`);
      continue;
    }
    const cycle = normalizeCycle(b.cycle);
    const issuedAt = parseThaiDate(b.issued) ?? `${cycle.slice(0, 4)}-${cycle.slice(4)}-01`;
    const lease = leaseByRoomId.get(room.id) ?? null;

    const lines: BillLine[] = [];
    if (b.rent > 0) lines.push({ type: "rent", label: "ค่าเช่าห้อง", qty: 1, rate: b.rent, amount: b.rent });
    if (b.deposit && b.deposit > 0)
      lines.push({ type: "deposit", label: "ค่ามัดจำ", qty: 1, rate: b.deposit, amount: b.deposit });

    const elecUnits = Math.max(0, b.elecCur - b.elecPrev);
    if (elecUnits > 0)
      lines.push({
        type: "electricity",
        label: `ค่าไฟ (${b.elecPrev} → ${b.elecCur})`,
        qty: elecUnits,
        rate: b.elecRate,
        amount: elecUnits * b.elecRate,
      });

    const waterUnits = Math.max(0, b.waterCur - b.waterPrev);
    if (waterUnits > 0)
      lines.push({
        type: "water",
        label: `ค่าน้ำ (${b.waterPrev} → ${b.waterCur})`,
        qty: waterUnits,
        rate: b.waterRate,
        amount: waterUnits * b.waterRate,
      });

    if (b.ac > 0) lines.push({ type: "ac", label: "ค่าเช่าแอร์", qty: 1, rate: b.ac, amount: b.ac });
    if (b.internet > 0)
      lines.push({ type: "internet", label: "ค่าอินเทอร์เน็ต", qty: 1, rate: b.internet, amount: b.internet });
    if (b.parking > 0)
      lines.push({ type: "parking", label: "ค่าที่จอดรถ", qty: 1, rate: b.parking, amount: b.parking });
    if (b.other > 0) lines.push({ type: "other", label: "ค่าอื่นๆ", qty: 1, rate: b.other, amount: b.other });
    if (b.carryOver > 0)
      lines.push({ type: "carryOver", label: "ยอดค้างยกมา", qty: 1, rate: b.carryOver, amount: b.carryOver });
    if (b.discount > 0)
      lines.push({ type: "discount", label: "ส่วนลด", qty: 1, rate: -b.discount, amount: -b.discount });

    const computed = lines.reduce((sum, l) => sum + l.amount, 0);
    if (computed !== b.total) {
      issues.push(`บิล ${b.billNo}: ยอดรวมในชีต ${b.total} ไม่ตรงกับผลรวมรายการ ${computed} — ใช้ยอดในชีตเป็นหลัก`);
    }

    const paid = b.paid;
    const balance = b.total - paid;
    const status: Bill["status"] = balance <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
    const tenantName = b.tenant || (lease ? (tenantById.get(lease.tenantId)?.name ?? "") : "");

    bills.push({
      id: b.billNo,
      propertyId,
      billNo: b.billNo,
      invoiceNo: b.billNo.replace("BILL-", "INV-"),
      cycle,
      roomId: room.id,
      roomNo: room.roomNo,
      leaseId: lease?.id ?? null,
      tenantSnapshot: {
        tenantId: lease?.tenantId ?? null,
        name: tenantName || `ผู้เช่าห้อง ${room.roomNo}`,
        phone: lease ? (tenantById.get(lease.tenantId)?.phone ?? "") : "",
      },
      lines,
      total: b.total,
      paid,
      balance,
      status,
      issuedAt,
      dueDate: parseThaiDate(b.due) ?? issuedAt,
      sentToLineAt: null,
      note: b.note || undefined,
    });

    if (elecUnits > 0 || waterUnits > 0) {
      meterReadings.push({
        id: `MR-${cycle}-${room.roomNo}`,
        propertyId,
        roomId: room.id,
        cycle,
        elecPrevious: b.elecPrev,
        elecCurrent: b.elecCur,
        waterPrevious: b.waterPrev,
        waterCurrent: b.waterCur,
        readAt: issuedAt,
        readBy: b.by || "ยกมาจาก V2",
      });
    }
  }

  /* --- การชำระ --- */
  const billNos = new Set(bills.map((b) => b.billNo));
  const payments: Payment[] = v2.payments.map((p) => {
    const room = roomByNo.get(p.roomNo);
    if (!room) issues.push(`ใบเสร็จ ${p.receiptNo} อ้างห้อง ${p.roomNo} ที่ไม่มีอยู่`);
    if (p.billNo && !billNos.has(p.billNo))
      issues.push(`ใบเสร็จ ${p.receiptNo} อ้างบิล ${p.billNo} ที่ไม่มีอยู่ — บันทึกเป็นชำระลอย`);
    const paidAt = parseThaiDate(p.date);
    if (!paidAt) issues.push(`ใบเสร็จ ${p.receiptNo} ไม่มีวันที่ชำระใน V2`);
    return {
      id: p.receiptNo,
      propertyId,
      receiptNo: p.receiptNo,
      billId: p.billNo && billNos.has(p.billNo) ? p.billNo : null,
      roomId: room?.id ?? roomId(propertyId, p.roomNo),
      roomNo: p.roomNo,
      amount: p.amount,
      method: parseMethod(p.method),
      paidAt: paidAt ?? "",
      slip: null,
      note: p.note || undefined,
    };
  });

  /* --- ต้นทุนจริงที่จ่ายการไฟฟ้า/ประปา --- */
  const cycles = [...new Set(bills.map((b) => b.cycle))].sort();
  const utilityCosts: UtilityCost[] = cycles.map((cycle) => ({
    id: `${propertyId}-${cycle}`,
    propertyId,
    cycle,
    elecCostPerUnit: num("electricity_cost_rate", 4.7),
    waterCostPerUnit: num("water_cost_rate", 15),
    acCostMonthly: num("ac_cost_monthly", 0),
    internetCostMonthly: num("internet_cost_monthly", 0),
  }));

  return { property, rooms, tenants, leases, bills, payments, meterReadings, utilityCosts, issues };
}
