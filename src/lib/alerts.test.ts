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
  lines: [{ type: "rent", label: "ค่าเช่าห้อง", qty: 1, rate: 3200, amount: 3200 }],
  total: 3200, paid: 0, balance: 3200, status: "unpaid",
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
  // รอบการทำงานจริงคือจดมิเตอร์สัปดาห์สุดท้ายแล้วค่อยออกบิล เทสต์จึงยืนที่ปลายเดือน
  const LATE = new Date("2026-09-26T00:00:00Z");
  const late = (over: Partial<AlertInput> = {}) => input({ today: LATE, ...over });

  it("ปลายเดือนแล้วยังไม่ออกบิล ต้องเตือน", () => {
    expect(ids(late())).toContain("unbilled-202609");
  });

  it("ต้นเดือนยังไม่ต้องเตือน — ยังไม่ถึงรอบจดมิเตอร์ เตือนไปก็ทำอะไรไม่ได้", () => {
    expect(ids(input({ today: new Date("2026-09-03T00:00:00Z") }))).not.toContain("unbilled-202609");
    expect(ids(input({ today: new Date("2026-09-13T00:00:00Z") }))).not.toContain("unbilled-202609");
  });

  it("รอบที่ผ่านไปแล้วเตือนทันที ไม่ต้องรอปลายเดือน", () => {
    expect(ids(input({ cycle: "202608", today: new Date("2026-09-13T00:00:00Z") }))).toContain("unbilled-202608");
  });

  it("ออกบิลครบแล้วไม่ขึ้น", () => {
    expect(ids(late({ bills: [bill()] }))).not.toContain("unbilled-202609");
  });

  it("บิลที่ยกเลิกไม่นับว่าออกแล้ว", () => {
    expect(ids(late({ bills: [bill({ status: "void" })] }))).toContain("unbilled-202609");
  });

  it("บิลมัดจำไม่นับว่าออกบิลค่าเช่าแล้ว", () => {
    const deposit = bill({ lines: [{ type: "deposit", label: "ค่ามัดจำ", qty: 1, rate: 5000, amount: 5000 }] });
    expect(ids(late({ bills: [deposit] }))).toContain("unbilled-202609");
  });

  it("ห้องว่างไม่นับว่ายังไม่ได้ออกบิล", () => {
    const vacant = view({ room: room({ activeLeaseId: null }), lease: null, tenant: null });
    expect(ids(late({ views: [vacant], leases: [] }))).not.toContain("unbilled-202609");
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
      today: new Date("2026-09-26T00:00:00Z"),
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


describe("บิลงวดสุดท้ายของคนที่ย้ายออกกลางรอบ", () => {
  const ended = lease({ id: "L-เก่า", status: "ended", endDate: "2026-09-16" });
  const vacant = view({ room: room({ activeLeaseId: null }), lease: null, tenant: null });
  const base = (over: Partial<AlertInput> = {}) =>
    input({ views: [vacant], leases: [ended], ...over });

  it("ย้ายออกกลางรอบแล้วยังไม่มีบิลของสัญญานั้น ต้องเตือน", () => {
    expect(ids(base())).toContain("final-bill-L-เก่า");
  });

  it("ออกบิลงวดสุดท้ายแล้วหายไป", () => {
    const finalBill = bill({ id: "F", leaseId: "L-เก่า", cycle: "202609" });
    expect(ids(base({ bills: [finalBill] }))).not.toContain("final-bill-L-เก่า");
  });

  it("บิลที่ยกเลิกไม่นับว่าออกแล้ว", () => {
    const voided = bill({ id: "F", leaseId: "L-เก่า", cycle: "202609", status: "void" });
    expect(ids(base({ bills: [voided] }))).toContain("final-bill-L-เก่า");
  });

  it("จบรอบก่อนไม่ต้องเตือนค้างไว้ตลอด", () => {
    expect(ids(base({ leases: [lease({ id: "L-เก่า", status: "ended", endDate: "2026-08-20" })] })))
      .not.toContain("final-bill-L-เก่า");
  });

  it("สัญญาที่ยังเดินอยู่ไม่เตือน", () => {
    expect(ids(base({ leases: [lease({ id: "L-เก่า", endDate: "2026-09-16" })] })))
      .not.toContain("final-bill-L-เก่า");
  });

  it("แยกคำว่าย้ายห้องกับย้ายออกให้ถูก", () => {
    const moved = lease({ id: "L-ย้าย", status: "ended", endDate: "2026-09-16", transferredTo: "L-ใหม่" });
    const found = buildAlerts(base({ leases: [moved] })).find((a) => a.id === "final-bill-L-ย้าย");
    expect(found?.detail).toContain("ย้ายห้อง");
  });

  it("เป็นแค่เครื่องเตือน ไม่ขึ้นตัวเลขบนกระดิ่ง", () => {
    const only = buildAlerts(base()).filter((a) => a.id === "final-bill-L-เก่า");
    expect(only[0].level).toBe("info");
  });
});
