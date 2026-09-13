import { describe, expect, it } from "vitest";
import { badgeCount, buildAlerts, type AlertInput } from "./alerts";
import type { Bill, Lease, MaintenanceRequest, Rates, Room, RoomView, Tenant } from "./types";

const TODAY = new Date("2026-09-13T00:00:00Z");
const RATES: Rates = { elec: 8, water: 20, ac: 0, internet: 0, parking: 0 };

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: "L-T0001", propertyId: "wlp1", roomId: "wlp1-101", tenantId: "T0001", status: "active",
  startDate: "2026-01-01", endDate: null, rent: 3200, deposit: 0, advance: 0,
  rates: RATES, dueDay: 5, depositRefund: null, ...over,
});

const room = (over: Partial<Room> = {}): Room => ({
  id: "wlp1-101", propertyId: "wlp1", roomNo: "101", floor: 1, type: "รายเดือน",
  baseRent: 3200, condition: "ready", activeLeaseId: "L-T0001", ...over,
});

const tenant = (over: Partial<Tenant> = {}): Tenant => ({
  id: "T0001", propertyId: "wlp1", name: "คุณสมชาย", nickname: "", phone: "0812345678",
  photoUrl: null, lineUserId: null, idCard: null, emergencyContact: null, ...over,
});

const view = (over: Partial<RoomView> = {}): RoomView => ({
  room: room(), lease: lease(), tenant: tenant(), lastReading: null, outstanding: 0, ...over,
});

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: "B1", propertyId: "wlp1", billNo: "BILL-202608-0001", invoiceNo: "INV-202608-0001",
  cycle: "202609", roomId: "wlp1-101", roomNo: "101", leaseId: "L-T0001",
  tenantSnapshot: { tenantId: "T0001", name: "คุณสมชาย", phone: "" },
  lines: [], total: 3200, paid: 0, balance: 3200, status: "unpaid",
  issuedAt: "2026-08-31", dueDate: "2026-09-05", sentToLineAt: null, ...over,
});

const ticket = (over: Partial<MaintenanceRequest> = {}): MaintenanceRequest => ({
  id: "M1", propertyId: "wlp1", ticketNo: "MT-0001", roomId: "wlp1-101", roomNo: "101",
  category: "ประปา", problem: "ก๊อกรั่ว", urgency: "normal", status: "open",
  reportedAt: "2026-09-10", reportedBy: "ผู้เช่า", assignedTo: null, cost: 0, ...over,
});

const input = (over: Partial<AlertInput> = {}): AlertInput => ({
  bills: [], views: [view()], leases: [lease()], tenants: [tenant()], maintenance: [],
  cycle: "202609", today: TODAY, ...over,
});

const ids = (i: AlertInput) => buildAlerts(i).map((a) => a.id);

describe("บิลเกินกำหนด", () => {
  it("ค้างเกิน 30 วันเป็นเรื่องด่วน ไม่เกินเป็นเรื่องเตือน", () => {
    const [a] = buildAlerts(input({ bills: [bill({ dueDate: "2026-08-01" })] }));
    expect(a.level).toBe("danger");
    const [b] = buildAlerts(input({ bills: [bill({ dueDate: "2026-09-05" })] }));
    expect(b.level).toBe("warn");
  });

  it("ยังไม่ถึงกำหนดไม่ขึ้นเตือน", () => {
    expect(ids(input({ bills: [bill({ dueDate: "2026-10-05" })] }))).not.toContain("overdue-B1");
  });

  it("จ่ายครบแล้วหรือยกเลิกแล้วไม่ขึ้นเตือน", () => {
    expect(ids(input({ bills: [bill({ balance: 0, status: "paid", dueDate: "2026-08-01" })] }))).not.toContain("overdue-B1");
    expect(ids(input({ bills: [bill({ status: "void", dueDate: "2026-08-01" })] }))).not.toContain("overdue-B1");
  });

  it("ค้างนานกว่าขึ้นก่อน", () => {
    const list = buildAlerts(input({
      bills: [bill({ id: "ใหม่", dueDate: "2026-09-10" }), bill({ id: "เก่า", dueDate: "2026-06-01" })],
    }));
    expect(list[0].id).toBe("overdue-เก่า");
  });
});

describe("บิลที่ยังไม่ได้ออก", () => {
  it("ห้องมีคนอยู่แต่ไม่มีบิลรอบนี้", () => {
    expect(ids(input())).toContain("unbilled-202609");
  });

  it("ออกบิลครบแล้วไม่ขึ้น", () => {
    expect(ids(input({ bills: [bill()] }))).not.toContain("unbilled-202609");
  });

  it("บิลที่ยกเลิกไม่นับว่าออกแล้ว", () => {
    expect(ids(input({ bills: [bill({ status: "void" })] }))).toContain("unbilled-202609");
  });

  it("ห้องว่างไม่นับว่ายังไม่ได้ออกบิล", () => {
    const vacant = view({ room: room({ activeLeaseId: null }), lease: null, tenant: null });
    expect(ids(input({ views: [vacant], leases: [] }))).not.toContain("unbilled-202609");
  });
});

describe("สัญญาใกล้หมดอายุ", () => {
  it("หมดภายใน 60 วันขึ้นเตือน", () => {
    expect(ids(input({ leases: [lease({ endDate: "2026-10-31" })] }))).toContain("expiry-L-T0001");
  });

  it("อีกนานยังไม่ต้องเตือน", () => {
    expect(ids(input({ leases: [lease({ endDate: "2027-06-30" })] }))).not.toContain("expiry-L-T0001");
  });

  it("เลยวันหมดอายุแล้วแรงกว่าใกล้หมด", () => {
    const past = buildAlerts(input({ leases: [lease({ endDate: "2026-08-01" })] })).find((a) => a.id === "expiry-L-T0001");
    const soon = buildAlerts(input({ leases: [lease({ endDate: "2026-10-01" })] })).find((a) => a.id === "expiry-L-T0001");
    expect(past?.level).toBe("warn");
    expect(soon?.level).toBe("info");
  });
});

describe("เรื่องอื่น", () => {
  it("งานซ่อมด่วนเป็นเรื่องด่วน งานที่ปิดแล้วไม่ขึ้น", () => {
    const urgent = buildAlerts(input({ maintenance: [ticket({ urgency: "urgent" })] }))[0];
    expect(urgent.level).toBe("danger");
    expect(ids(input({ maintenance: [ticket({ status: "done" })] }))).not.toContain("maintenance-M1");
  });

  it("ห้องว่างรวมเป็นรายการเดียวพร้อมรายได้ที่เสียไป", () => {
    const vacant = view({ room: room({ id: "r2", roomNo: "102", activeLeaseId: null, baseRent: 2600 }), lease: null, tenant: null });
    const alert = buildAlerts(input({ views: [view(), vacant] })).find((a) => a.id === "vacant");
    expect(alert?.amount).toBe(2600);
    expect(alert?.detail).toContain("102");
  });

  it("ผู้เช่าที่อยู่ปัจจุบันและไม่มีเบอร์โทรขึ้นเตือน คนที่ย้ายออกแล้วไม่ขึ้น", () => {
    expect(ids(input({ tenants: [tenant({ phone: "  " })] }))).toContain("no-phone");
    expect(ids(input({ leases: [], tenants: [tenant({ phone: "" })] }))).not.toContain("no-phone");
  });
});

describe("badgeCount", () => {
  it("นับเฉพาะเรื่องที่ต้องรีบ ห้องว่างกับข้อมูลไม่ครบไม่นับ", () => {
    const alerts = buildAlerts(input({
      // บิลค้างเป็นของรอบก่อน รอบนี้จึงยังไม่ได้ออกบิลด้วย
      bills: [bill({ cycle: "202608", dueDate: "2026-08-01" })],
      views: [view(), view({ room: room({ id: "r2", activeLeaseId: null }), lease: null, tenant: null })],
      tenants: [tenant({ phone: "" })],
    }));
    // ค้างชำระ 1 + ยังไม่ออกบิล 1 = 2 ส่วนห้องว่างกับไม่มีเบอร์เป็นข้อมูลประกอบ
    expect(badgeCount(alerts)).toBe(2);
    expect(alerts.length).toBeGreaterThan(2);
  });

  it("ไม่มีอะไรค้าง = 0", () => {
    const clean = input({ bills: [bill({ paid: 3200, balance: 0, status: "paid" })] });
    expect(buildAlerts(clean).every((a) => a.level === "info")).toBe(true);
    expect(badgeCount(buildAlerts(clean))).toBe(0);
  });
});
