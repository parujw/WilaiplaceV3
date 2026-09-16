import { describe, expect, it } from "vitest";
import { carryOverFor, outstandingOfTenancy, tenancyLeaseIds } from "./tenancy";
import type { Bill, Lease, Rates } from "./types";

const RATES: Rates = { elec: 8, water: 20, ac: 0, internet: 0, parking: 0 };

const lease = (id: string, over: Partial<Lease> = {}): Lease => ({
  id, propertyId: "wlp1", roomId: "wlp1-502", tenantId: "T0001", status: "ended",
  startDate: "2026-01-01", endDate: null, rent: 4000, deposit: 8000, advance: 0,
  rates: RATES, dueDay: 5, depositRefund: null, ...over,
});

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: "B1", propertyId: "wlp1", billNo: "BILL-202608-0001", invoiceNo: "INV-202608-0001",
  cycle: "202608", roomId: "wlp1-502", roomNo: "502", leaseId: "L-A",
  tenantSnapshot: { tenantId: "T0001", name: "ผู้เช่าเดิม", phone: "" },
  lines: [], total: 4000, paid: 0, balance: 4000, status: "unpaid",
  issuedAt: "2026-08-31", dueDate: "2026-09-05", sentToLineAt: null, ...over,
});

describe("tenancyLeaseIds", () => {
  it("สัญญาเดี่ยวได้ตัวเอง", () => {
    expect([...tenancyLeaseIds([lease("L-A")], "L-A")]).toEqual(["L-A"]);
  });

  it("ย้ายห้องสองทอด ไล่ย้อนได้ครบสาย", () => {
    const leases = [
      lease("L-A"),
      lease("L-B", { transferredFrom: "L-A" }),
      lease("L-C", { transferredFrom: "L-B", status: "active" }),
    ];
    expect([...tenancyLeaseIds(leases, "L-C")].sort()).toEqual(["L-A", "L-B", "L-C"]);
  });

  it("สัญญาของผู้เช่าใหม่ที่ไม่ได้ย้ายมา ได้แค่ตัวเอง ไม่ลากของคนเก่ามาด้วย", () => {
    const leases = [lease("L-เก่า"), lease("L-ใหม่", { tenantId: "T0002", status: "active" })];
    expect([...tenancyLeaseIds(leases, "L-ใหม่")]).toEqual(["L-ใหม่"]);
  });

  it("ไม่มีสัญญาที่ใช้งานอยู่ = ว่างเปล่า", () => {
    expect(tenancyLeaseIds([lease("L-A")], null).size).toBe(0);
  });

  it("ข้อมูลวนกลับมาหาตัวเองต้องไม่ค้าง", () => {
    const loop = [lease("L-A", { transferredFrom: "L-B" }), lease("L-B", { transferredFrom: "L-A" })];
    expect([...tenancyLeaseIds(loop, "L-A")].sort()).toEqual(["L-A", "L-B"]);
  });
});

describe("outstandingOfTenancy", () => {
  it("นับหนี้ของสัญญาในสายเดียวกัน รวมห้องเก่าที่ย้ายมา", () => {
    const bills = [bill({ id: "1", leaseId: "L-A" }), bill({ id: "2", leaseId: "L-B", balance: 1000 })];
    expect(outstandingOfTenancy(bills, new Set(["L-A", "L-B"]), "T0001")).toBe(5000);
  });

  it("หนี้ของผู้เช่าคนก่อนไม่ตกใส่คนใหม่ — เคสที่เคยเรียกเก็บเงินผิดคน", () => {
    const bills = [
      bill({ id: "เก่า", leaseId: "L-เก่า", balance: 4000 }),
      bill({ id: "ใหม่", leaseId: "L-ใหม่", balance: 1200, tenantSnapshot: { tenantId: "T0002", name: "คนใหม่", phone: "" } }),
    ];
    expect(outstandingOfTenancy(bills, new Set(["L-ใหม่"]), "T0002")).toBe(1200);
  });

  it("บิลที่ไม่ผูกสัญญาแต่ออกในชื่อคนเดียวกันนับด้วย เช่น มัดจำตอนจอง", () => {
    const deposit = bill({ id: "มัดจำ", leaseId: null, balance: 8000 });
    expect(outstandingOfTenancy([deposit], new Set(["L-A"]), "T0001")).toBe(8000);
  });

  it("บิลไม่ผูกสัญญาของคนอื่นไม่นับ", () => {
    const other = bill({ id: "x", leaseId: null, tenantSnapshot: { tenantId: "T0099", name: "คนอื่น", phone: "" } });
    expect(outstandingOfTenancy([other], new Set(["L-A"]), "T0001")).toBe(0);
  });

  it("บิลที่จ่ายครบหรือยกเลิกแล้วไม่นับ", () => {
    const bills = [bill({ id: "1", balance: 0, status: "paid" }), bill({ id: "2", status: "void" })];
    expect(outstandingOfTenancy(bills, new Set(["L-A"]), "T0001")).toBe(0);
  });
});

describe("carryOverFor", () => {
  it("ยกเฉพาะรอบก่อนหน้า ไม่รวมรอบที่กำลังจะออก", () => {
    const bills = [bill({ id: "1", cycle: "202608" }), bill({ id: "2", cycle: "202609", balance: 999 })];
    expect(carryOverFor(bills, new Set(["L-A"]), "T0001", "202609")).toBe(4000);
  });

  it("ย้ายห้องแล้วหนี้ห้องเก่ายังตามมาที่บิลห้องใหม่", () => {
    const bills = [bill({ id: "เก่า", cycle: "202608", roomId: "wlp1-502", leaseId: "L-A" })];
    expect(carryOverFor(bills, new Set(["L-A", "L-B"]), "T0001", "202609")).toBe(4000);
  });
});
