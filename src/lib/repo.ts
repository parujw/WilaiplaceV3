import "server-only";
import { currentCycle, daysOverdue, dueDateFor, previousCycle } from "./billing";
import { db } from "./db";
import type {
  AuditLog, Bill, Cycle, Expense, Lease, MaintenanceRequest, MeterReading,
  Payment, Property, PropertySummary, Room, RoomView, SessionUser, Tenant,
} from "./types";

const byProperty = (propertyId: string) => ({ where: [{ field: "propertyId", op: "==" as const, value: propertyId }] });

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
    db().list<Room>("rooms", byProperty(propertyId)),
    db().list<Lease>("leases", byProperty(propertyId)),
    db().list<Tenant>("tenants", byProperty(propertyId)),
    db().list<MeterReading>("meterReadings", byProperty(propertyId)),
    db().list<Bill>("bills", byProperty(propertyId)),
  ]);

  const leaseById = new Map(leases.map((l) => [l.id, l]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const latestReading = new Map<string, MeterReading>();
  for (const r of readings) {
    const known = latestReading.get(r.roomId);
    if (!known || r.cycle > known.cycle) latestReading.set(r.roomId, r);
  }

  const outstanding = new Map<string, number>();
  for (const b of bills) {
    if (b.status === "void" || b.status === "paid") continue;
    outstanding.set(b.roomId, (outstanding.get(b.roomId) ?? 0) + b.balance);
  }

  return rooms
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo))
    .map((room) => {
      const lease = room.activeLeaseId ? (leaseById.get(room.activeLeaseId) ?? null) : null;
      return {
        room,
        lease,
        tenant: lease ? (tenantById.get(lease.tenantId) ?? null) : null,
        lastReading: latestReading.get(room.id) ?? null,
        outstanding: outstanding.get(room.id) ?? 0,
      };
    });
}

export async function getRoomView(propertyId: string, roomId: string): Promise<RoomView | null> {
  const views = await getRoomViews(propertyId);
  return views.find((v) => v.room.id === roomId) ?? null;
}

export const listTenants = (propertyId: string) => db().list<Tenant>("tenants", byProperty(propertyId));
export const getTenant = (id: string) => db().get<Tenant>("tenants", id);
export const listLeases = (propertyId: string) => db().list<Lease>("leases", byProperty(propertyId));
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
  let bills = await db().list<Bill>("bills", byProperty(propertyId));
  if (filter?.cycle) bills = bills.filter((b) => b.cycle === filter.cycle);
  if (filter?.status) bills = bills.filter((b) => b.status === filter.status);
  if (filter?.roomId) bills = bills.filter((b) => b.roomId === filter.roomId);
  return bills.sort(
    (a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.billNo.localeCompare(a.billNo),
  );
}

export const getBill = (id: string) => db().get<Bill>("bills", id);

export async function listPayments(propertyId: string, limit?: number): Promise<Payment[]> {
  const payments = await db().list<Payment>("payments", byProperty(propertyId));
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
  const items = await db().list<MaintenanceRequest>("maintenance", byProperty(propertyId));
  return items.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
}

export const listMeterReadings = (propertyId: string) =>
  db().list<MeterReading>("meterReadings", byProperty(propertyId));

/* --------------------------------- สรุปผล --------------------------------- */

export async function getSummary(propertyId: string, cycle = currentCycle()): Promise<PropertySummary> {
  const [rooms, bills, maintenance] = await Promise.all([
    db().list<Room>("rooms", byProperty(propertyId)),
    db().list<Bill>("bills", byProperty(propertyId)),
    db().list<MaintenanceRequest>("maintenance", byProperty(propertyId)),
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
  const bills = await db().list<Bill>("bills", byProperty(propertyId));
  const cycles = new Set(bills.map((b) => b.cycle));
  cycles.add(currentCycle());
  return [...cycles].sort().reverse();
}

/** อัตราการเก็บเงินได้ย้อนหลัง N รอบ — ใช้วาดกราฟแท่งในหน้าหลัก */
export async function collectionByCycle(
  propertyId: string,
  months = 6,
): Promise<Array<{ cycle: Cycle; billed: number; collected: number; rate: number }>> {
  const bills = (await db().list<Bill>("bills", byProperty(propertyId))).filter((b) => b.status !== "void");

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
  const bills = (await db().list<Bill>("bills", byProperty(propertyId))).filter(
    (b) => b.status !== "void" && b.balance > 0,
  );
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

/** ปัญหาข้อมูลที่ตัวแปลง V2 บันทึกไว้ตอนย้าย — โชว์ในหน้าตั้งค่าเพื่อให้ตามแก้ */
export async function migrationIssues(): Promise<string[]> {
  const doc = await db().get<{ issues?: string[] }>("counters", "migrationIssues");
  return doc?.issues ?? [];
}
