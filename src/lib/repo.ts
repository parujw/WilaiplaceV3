import "server-only";
import { cache } from "react";
import { buildAlerts, type Alert } from "./alerts";
import { outstandingOfTenancy, tenancyLeaseIds } from "./tenancy";
import { currentCycle, daysOverdue, dueDateFor, previousCycle } from "./billing";
import {
  actualsByCycle, collectionRate, expirySchedule, recurringMonthly, rentBand, vacancyLoss,
} from "./forecast";
import { db } from "./db";
import type { CollectionName } from "./db/store";
import type {
  AuditLog, Bill, Cycle, Expense, Lease, MaintenanceRequest, MeterReading,
  Payment, Property, PropertySummary, Room, RoomView, SessionUser, Tenant,
} from "./types";

const byProperty = (propertyId: string) => ({ where: [{ field: "propertyId", op: "==" as const, value: propertyId }] });

/**
 * อ่าน collection ของอาคารหนึ่ง โดยจำผลไว้ตลอดคำขอนั้น
 *
 * หน้าหลักหน้าเดียวเรียกดูบิลถึง 4 รอบ (สรุปยอด กราฟ ความเคลื่อนไหว ยอดค้าง)
 * ถ้าไม่จำไว้ก็ยิงไป Firestore 4 ครั้งจริงๆ หน้าเลยช้าโดยไม่จำเป็น
 * cache() ของ React จำเฉพาะภายในคำขอเดียว คำขอถัดไปได้ข้อมูลใหม่เสมอ
 */
const listOf = cache(
  async (collection: CollectionName, propertyId: string): Promise<unknown[]> =>
    db().list(collection, byProperty(propertyId)),
);

const roomsOf = (propertyId: string) => listOf("rooms", propertyId) as Promise<Room[]>;
const tenantsOf = (propertyId: string) => listOf("tenants", propertyId) as Promise<Tenant[]>;
const leasesOf = (propertyId: string) => listOf("leases", propertyId) as Promise<Lease[]>;
const billsOf = (propertyId: string) => listOf("bills", propertyId) as Promise<Bill[]>;
const paymentsOf = (propertyId: string) => listOf("payments", propertyId) as Promise<Payment[]>;
const readingsOf = (propertyId: string) => listOf("meterReadings", propertyId) as Promise<MeterReading[]>;
const maintenanceOf = (propertyId: string) =>
  listOf("maintenance", propertyId) as Promise<MaintenanceRequest[]>;

/* ---------------------------------- อาคาร --------------------------------- */

export async function listProperties(user?: SessionUser | null): Promise<Property[]> {
  const all = await db().list<Property>("properties");
  const visible = user && user.propertyIds.length > 0
    ? all.filter((p) => user.propertyIds.includes(p.id))
    : all;
  return visible.sort((a, b) => a.name.localeCompare(b.name, "th"));
}

export const getProperty = (id: string) => db().get<Property>("properties", id);

/* ------------------------------ ห้อง / ผู้เช่า ------------------------------ */

export async function getRoomViews(propertyId: string): Promise<RoomView[]> {
  const [rooms, leases, tenants, readings, bills] = await Promise.all([
    roomsOf(propertyId),
    leasesOf(propertyId),
    tenantsOf(propertyId),
    readingsOf(propertyId),
    billsOf(propertyId),
  ]);

  const leaseById = new Map(leases.map((l) => [l.id, l]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const latestReading = new Map<string, MeterReading>();
  for (const r of readings) {
    const known = latestReading.get(r.roomId);
    if (!known || r.cycle > known.cycle) latestReading.set(r.roomId, r);
  }

  return rooms
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo))
    .map((room) => {
      const lease = room.activeLeaseId ? (leaseById.get(room.activeLeaseId) ?? null) : null;
      const tenant = lease ? (tenantById.get(lease.tenantId) ?? null) : null;

      return {
        room,
        lease,
        tenant,
        lastReading: latestReading.get(room.id) ?? null,
        // ยอดค้างของคนที่อยู่ห้องนี้ตอนนี้เท่านั้น ไม่ใช่ของทุกคนที่เคยอยู่ห้องนี้
        // ห้องว่างจึงเป็น 0 เสมอ ส่วนหนี้ของคนเก่ายังตามตัวได้จากหน้าผู้เช่าและหน้าบิล
        outstanding: outstandingOfTenancy(
          bills,
          tenancyLeaseIds(leases, room.activeLeaseId),
          tenant?.id ?? null,
        ),
      };
    });
}

export async function getRoomView(propertyId: string, roomId: string): Promise<RoomView | null> {
  const views = await getRoomViews(propertyId);
  return views.find((v) => v.room.id === roomId) ?? null;
}

export const listTenants = (propertyId: string) => tenantsOf(propertyId);
export const getTenant = (id: string) => db().get<Tenant>("tenants", id);
export const listLeases = (propertyId: string) => leasesOf(propertyId);
export const getLease = (id: string) => db().get<Lease>("leases", id);
export const getRoom = (id: string) => db().get<Room>("rooms", id);

export async function leasesOfTenant(tenantId: string): Promise<Lease[]> {
  const leases = await db().list<Lease>("leases", {
    where: [{ field: "tenantId", op: "==", value: tenantId }],
  });
  return leases.sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
}

/* ---------------------------------- บิล ----------------------------------- */

export async function listBills(
  propertyId: string,
  filter?: { cycle?: Cycle; status?: Bill["status"]; roomId?: string },
): Promise<Bill[]> {
  let bills = await billsOf(propertyId);
  if (filter?.cycle) bills = bills.filter((b) => b.cycle === filter.cycle);
  if (filter?.status) bills = bills.filter((b) => b.status === filter.status);
  if (filter?.roomId) bills = bills.filter((b) => b.roomId === filter.roomId);
  return bills.sort(
    (a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.billNo.localeCompare(a.billNo),
  );
}

export const getBill = (id: string) => db().get<Bill>("bills", id);

export async function listPayments(propertyId: string, limit?: number): Promise<Payment[]> {
  const payments = await paymentsOf(propertyId);
  const sorted = payments.sort(
    (a, b) => b.paidAt.localeCompare(a.paidAt) || b.receiptNo.localeCompare(a.receiptNo),
  );
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function paymentsOfBill(billId: string): Promise<Payment[]> {
  return db().list<Payment>("payments", { where: [{ field: "billId", op: "==", value: billId }] });
}

export const listExpenses = (propertyId: string) => db().list<Expense>("expenses", byProperty(propertyId));

export async function listMaintenance(propertyId: string): Promise<MaintenanceRequest[]> {
  const items = await maintenanceOf(propertyId);
  return items.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
}

export const listMeterReadings = (propertyId: string) => readingsOf(propertyId);

/* --------------------------------- สรุปผล --------------------------------- */

export async function getSummary(propertyId: string, cycle = currentCycle()): Promise<PropertySummary> {
  const [rooms, bills, maintenance] = await Promise.all([
    roomsOf(propertyId),
    billsOf(propertyId),
    maintenanceOf(propertyId),
  ]);

  const live = bills.filter((b) => b.status !== "void");
  const ofCycle = live.filter((b) => b.cycle === cycle);

  return {
    propertyId,
    cycle,
    rooms: rooms.length,
    occupied: rooms.filter((r) => r.activeLeaseId).length,
    billed: ofCycle.reduce((s, b) => s + b.total, 0),
    collected: ofCycle.reduce((s, b) => s + b.paid, 0),
    // ยอดค้างนับทุกรอบ ไม่ใช่แค่รอบนี้ — หนี้เก่าคือหนี้
    outstanding: live.reduce((s, b) => s + b.balance, 0),
    billsIssued: ofCycle.length,
    billsPaid: ofCycle.filter((b) => b.status === "paid").length,
    openMaintenance: maintenance.filter((m) => m.status === "open" || m.status === "in_progress").length,
  };
}

/** รอบบิลที่มีข้อมูลจริง เรียงใหม่→เก่า ใช้เป็นตัวเลือกในหน้าจอ */
export async function availableCycles(propertyId: string): Promise<Cycle[]> {
  const bills = await billsOf(propertyId);
  const cycles = new Set(bills.map((b) => b.cycle));
  cycles.add(currentCycle());
  return [...cycles].sort().reverse();
}

/** อัตราการเก็บเงินได้ย้อนหลัง N รอบ — ใช้วาดกราฟแท่งในหน้าหลัก */
export async function collectionByCycle(
  propertyId: string,
  months = 6,
): Promise<Array<{ cycle: Cycle; billed: number; collected: number; rate: number }>> {
  const bills = (await billsOf(propertyId)).filter((b) => b.status !== "void");

  const cycles: Cycle[] = [];
  let c = currentCycle();
  for (let i = 0; i < months; i++) {
    cycles.unshift(c);
    c = previousCycle(c);
  }

  return cycles.map((cycle) => {
    const ofCycle = bills.filter((b) => b.cycle === cycle);
    const billed = ofCycle.reduce((s, b) => s + b.total, 0);
    const collected = ofCycle.reduce((s, b) => s + b.paid, 0);
    return { cycle, billed, collected, rate: billed === 0 ? 0 : collected / billed };
  });
}

export interface ActivityItem {
  id: string;
  kind: "payment" | "bill" | "maintenance" | "lease";
  title: string;
  detail: string;
  at: string;
  amount: number | null;
  href: string;
}

export async function recentActivity(propertyId: string, limit = 12): Promise<ActivityItem[]> {
  const [payments, bills, maintenance] = await Promise.all([
    listPayments(propertyId),
    listBills(propertyId),
    listMaintenance(propertyId),
  ]);

  const items: ActivityItem[] = [
    ...payments.map((p) => ({
      id: p.id,
      kind: "payment" as const,
      title: `รับชำระห้อง ${p.roomNo}`,
      detail: p.receiptNo,
      at: p.paidAt,
      amount: p.amount,
      href: `/rooms/${p.roomId}`,
    })),
    ...bills.map((b) => ({
      id: b.id,
      kind: "bill" as const,
      title: `ออกบิลห้อง ${b.roomNo}`,
      detail: b.billNo,
      at: b.issuedAt,
      amount: b.total,
      href: `/bills/${b.id}`,
    })),
    ...maintenance.map((m) => ({
      id: m.id,
      kind: "maintenance" as const,
      title: `แจ้งซ่อมห้อง ${m.roomNo}`,
      detail: m.problem,
      at: m.reportedAt,
      amount: m.cost || null,
      href: `/maintenance`,
    })),
  ];

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** ยอดค้างแยกตามอายุหนี้ */
export async function agingReport(propertyId: string) {
  const bills = (await billsOf(propertyId)).filter((b) => b.status !== "void" && b.balance > 0);
  const buckets = { current: 0, "1-30": 0, "31-60": 0, "60+": 0 };
  for (const b of bills) {
    const days = daysOverdue(b.dueDate);
    const key = days <= 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : "60+";
    buckets[key] += b.balance;
  }
  return { buckets, bills: bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)) };
}

/* -------------------------------- การเขียน -------------------------------- */

export async function audit(
  user: SessionUser,
  entry: Omit<AuditLog, "id" | "actorUid" | "actorEmail" | "at">,
): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db().set("auditLogs", id, {
    ...entry,
    id,
    actorUid: user.uid,
    actorEmail: user.email,
    at: new Date().toISOString(),
  });
}

export async function nextBillNo(cycle: Cycle): Promise<{ billNo: string; invoiceNo: string }> {
  const seq = await db().nextSequence("bill");
  const suffix = String(seq).padStart(4, "0");
  return { billNo: `BILL-${cycle}-${suffix}`, invoiceNo: `INV-${cycle}-${suffix}` };
}

export async function nextReceiptNo(cycle: Cycle): Promise<string> {
  const seq = await db().nextSequence("receipt");
  return `WLP-${cycle}-${String(seq).padStart(4, "0")}`;
}

export { currentCycle, dueDateFor };

/* ------------------------------ แจ้งเตือน / วิเคราะห์ ----------------------------- */

/**
 * เรื่องที่ต้องรู้ทั้งหมดในที่เดียว
 * อ่านทุก collection ที่เกี่ยวข้องพร้อมกัน และทุกตัวผ่าน cache() อยู่แล้ว
 * หน้าหลักเรียกอันนี้เพื่อเอาจำนวนขึ้นกระดิ่ง หน้าแจ้งเตือนเรียกเพื่อเอารายการเต็ม
 * เรียกสองที่ในคำขอเดียวกันก็ยิงฐานข้อมูลชุดเดียว
 */
export async function getAlerts(propertyId: string): Promise<Alert[]> {
  const [bills, views, leases, tenants, maintenance, issues] = await Promise.all([
    billsOf(propertyId),
    getRoomViews(propertyId),
    leasesOf(propertyId),
    tenantsOf(propertyId),
    maintenanceOf(propertyId),
    migrationIssues(),
  ]);
  return buildAlerts({ bills, views, leases, tenants, maintenance, migrationIssues: issues });
}

/** ตัวเลขบริหารทั้งชุดสำหรับหน้าวิเคราะห์ */
export async function getInsights(propertyId: string) {
  const [rooms, leases, bills] = await Promise.all([
    roomsOf(propertyId),
    leasesOf(propertyId),
    billsOf(propertyId),
  ]);

  return {
    rooms: rooms.length,
    occupied: rooms.filter((r) => r.activeLeaseId).length,
    recurring: recurringMonthly(leases),
    vacancy: vacancyLoss(rooms),
    collection: collectionRate(bills),
    band: rentBand(leases, rooms.length),
    expiry: expirySchedule(leases),
    actuals: actualsByCycle(bills),
  };
}

export type Insights = Awaited<ReturnType<typeof getInsights>>;

/** ปัญหาข้อมูลที่ตัวแปลง V2 บันทึกไว้ตอนย้าย — โชว์ในหน้าตั้งค่าเพื่อให้ตามแก้ */
export async function migrationIssues(): Promise<string[]> {
  const doc = await db().get<{ issues?: string[] }>("counters", "migrationIssues");
  return doc?.issues ?? [];
}
