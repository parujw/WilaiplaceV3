import { describe, expect, it } from "vitest";
import { buildWorld, dailyBrief, type WorldInput } from "./world";
import type { Bill, Lease, MaintenanceRequest, MeterReading, Rates, Room, RoomView, Tenant } from "./types";

const RATES: Rates = { elec: 8, water: 20, ac: 0, internet: 0, parking: 0 };
const MID = new Date("2026-09-13T00:00:00Z"); // กลางเดือน ยังไม่ถึงช่วงจดมิเตอร์
const END = new Date("2026-09-28T00:00:00Z"); // ช่วงจดมิเตอร์/ออกบิล

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: "L1", propertyId: "wlp1", roomId: "r101", tenantId: "T1", status: "active",
  startDate: "2026-01-01", endDate: null, rent: 3200, deposit: 0, advance: 0,
  rates: RATES, dueDay: 5, depositRefund: null, ...over,
});
const room = (over: Partial<Room> = {}): Room => ({
  id: "r101", propertyId: "wlp1", roomNo: "101", floor: 1, type: "รายเดือน",
  baseRent: 3200, condition: "ready", activeLeaseId: "L1", ...over,
});
const tenant: Tenant = {
  id: "T1", propertyId: "wlp1", name: "คุณสมชาย", nickname: "", phone: "081",
  photoUrl: null, lineUserId: null, idCard: null, emergencyContact: null,
};
const view = (over: Partial<RoomView> = {}): RoomView => ({
  room: room(), lease: lease(), tenant, lastReading: null, outstanding: 0, ...over,
});
const reading = (over: Partial<MeterReading> = {}): MeterReading => ({
  id: "M1", propertyId: "wlp1", roomId: "r101", cycle: "202609",
  elecPrevious: 0, elecCurrent: 10, waterPrevious: 0, waterCurrent: 2, readAt: "2026-09-27", readBy: "x", ...over,
});
const bill = (over: Partial<Bill> = {}): Bill => ({
  id: "B1", propertyId: "wlp1", billNo: "B", invoiceNo: "I", cycle: "202609",
  roomId: "r101", roomNo: "101", leaseId: "L1",
  tenantSnapshot: { tenantId: "T1", name: "คุณสมชาย", phone: "" },
  lines: [{ type: "rent", label: "ค่าเช่า", qty: 1, rate: 3200, amount: 3200 }],
  total: 3200, paid: 0, balance: 3200, status: "unpaid",
  issuedAt: "2026-09-28", dueDate: "2026-10-05", sentToLineAt: null, ...over,
});
const ticket = (over: Partial<MaintenanceRequest> = {}): MaintenanceRequest => ({
  id: "T1", propertyId: "wlp1", ticketNo: "MT-0001", roomId: "r101", roomNo: "101",
  category: "ประปา", problem: "ก๊อกรั่ว", urgency: "normal", status: "open",
  reportedAt: "2026-09-10", reportedBy: "ผู้เช่า", assignedTo: null, cost: 0, ...over,
});

const input = (over: Partial<WorldInput> = {}): WorldInput => ({
  views: [view()], bills: [], readings: [], leases: [lease()], maintenance: [],
  cycle: "202609", today: MID, ...over,
});
const agent = (w: ReturnType<typeof buildWorld>, id: string) => w.agents.find((a) => a.id === id)!;

describe("buildWorld", () => {
  it("กลางเดือน มิเตอร์ยังไม่จดถือว่ารอคิว ไม่ใช่งานค้าง", () => {
    const w = buildWorld(input());
    expect(agent(w, "meter").status).toBe("waiting");
    expect(agent(w, "billing").status).toBe("waiting");
  });

  it("ช่วงสิ้นเดือน จดมิเตอร์แล้วยังไม่ออกบิล → BILLY มีงาน", () => {
    const w = buildWorld(input({ today: END, readings: [reading()] }));
    expect(agent(w, "meter").status).toBe("idle");
    expect(agent(w, "billing").status).toBe("busy");
    expect(agent(w, "billing").tasks).toHaveLength(1);
  });

  it("บิลที่ยังไม่ส่ง LINE ไปอยู่ในคิว LINEY ส่งแล้วหายไป", () => {
    expect(agent(buildWorld(input({ bills: [bill()] })), "line").tasks).toHaveLength(1);
    expect(agent(buildWorld(input({ bills: [bill({ sentToLineAt: "2026-09-28" })] })), "line").tasks).toHaveLength(0);
  });

  it("ค้างเกิน 30 วัน CASHY เป็นด่วน", () => {
    const w = buildWorld(input({ bills: [bill({ cycle: "202607", dueDate: "2026-08-01" })] }));
    expect(agent(w, "collect").status).toBe("alert");
    expect(agent(w, "head").status).toBe("alert");
  });

  it("บิลที่ void ไม่นับ", () => {
    const w = buildWorld(input({ bills: [bill({ status: "void", dueDate: "2026-08-01" })] }));
    expect(agent(w, "collect").tasks).toHaveLength(0);
    expect(agent(w, "line").tasks).toHaveLength(0);
  });

  it("งานซ่อมด่วนทำให้ FIXY เป็นด่วน งานปิดแล้วไม่นับ", () => {
    expect(agent(buildWorld(input({ maintenance: [ticket({ urgency: "urgent" })] })), "repair").status).toBe("alert");
    expect(agent(buildWorld(input({ maintenance: [ticket({ status: "done" })] })), "repair").tasks).toHaveLength(0);
  });

  it("สัญญาหมดใน 60 วันอยู่ในคิว CONTRA", () => {
    const l = lease({ endDate: "2026-10-31" });
    const w = buildWorld(input({ leases: [l], views: [view({ lease: l })] }));
    expect(agent(w, "lease").tasks[0].label).toContain("101");
  });

  it("ห้องว่างและห้องรอทำความสะอาดอยู่ในคิว ROOMY", () => {
    const vacant = view({ room: room({ id: "r102", roomNo: "102", activeLeaseId: null }), lease: null, tenant: null });
    const cleaning = view({ room: room({ id: "r103", roomNo: "103", condition: "cleaning" }) });
    expect(agent(buildWorld(input({ views: [view(), vacant, cleaning] })), "rooms").tasks).toHaveLength(2);
  });

  it("หัวหน้ารวมงานทุกคน และนับคนที่ว่าง", () => {
    const w = buildWorld(input({ today: END, readings: [reading()], bills: [bill({ sentToLineAt: "x" })] }));
    expect(w.totalTasks).toBe(0);
    expect(w.clear).toBe(7);
    expect(agent(w, "head").status).toBe("idle");
  });
});

describe("dailyBrief", () => {
  it("บอกงานด่วนก่อน และไม่นับงานที่รอคิว", () => {
    const w = buildWorld(input({ bills: [bill({ cycle: "202607", dueDate: "2026-08-01", sentToLineAt: "x" })] }));
    const text = dailyBrief([{ name: "วิไลเพลส 1", world: w }], { today: MID, appUrl: "https://x.app/" });
    expect(text).toContain("🏢 วิไลเพลส 1");
    expect(text).toContain("🔴 CASHY");
    expect(text).toContain("💤 รอคิว: MITER, BILLY");
    expect(text).toContain("https://x.app/world");
  });

  it("ไม่มีงานค้างก็บอกสั้นๆ", () => {
    const w = buildWorld(input({ today: END, readings: [reading()], bills: [bill({ sentToLineAt: "x" })] }));
    expect(dailyBrief([{ name: "A", world: w }], { today: END })).toContain("ไม่มีงานค้าง ทุกคนว่าง");
  });

  it("ตัดงานยาวๆ เหลือไม่กี่ข้อต่อคน", () => {
    const views = Array.from({ length: 6 }, (_, i) =>
      view({ room: room({ id: `v${i}`, roomNo: `${200 + i}`, activeLeaseId: null }), lease: null, tenant: null }),
    );
    const text = dailyBrief([{ name: "A", world: buildWorld(input({ views })) }], { today: MID });
    expect(text).toContain("และอีก 3 งาน");
  });
});
