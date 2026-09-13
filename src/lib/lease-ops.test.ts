import { describe, expect, it } from "vitest";
import {
  LeaseOpError, buildLease, leaseTermsPatch, moveOutPatch, nextCode, roomEditPatch, tenantEditPatch,
} from "./lease-ops";
import type { Lease, Rates, Room, Tenant } from "./types";

const RATES: Rates = { elec: 8, water: 20, ac: 500, internet: 0, parking: 0 };

const room = (over: Partial<Room> = {}): Room => ({
  id: "wlp1-102", propertyId: "wlp1", roomNo: "102", floor: 1, type: "รายเดือน",
  baseRent: 3200, condition: "ready", activeLeaseId: null, ...over,
});

const tenant = (over: Partial<Tenant> = {}): Tenant => ({
  id: "T0019", propertyId: "wlp1", name: "คุณทดสอบ", nickname: "", phone: "",
  photoUrl: null, lineUserId: null, idCard: null, emergencyContact: null, ...over,
});

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: "L-T0019", propertyId: "wlp1", roomId: "wlp1-102", tenantId: "T0019", status: "active",
  startDate: "2026-01-01", endDate: null, rent: 3200, deposit: 6400, advance: 0,
  rates: RATES, dueDay: 5, depositRefund: null, ...over,
});

describe("roomEditPatch", () => {
  it("แก้ได้เฉพาะข้อมูลกายภาพของห้อง", () => {
    expect(roomEditPatch({ floor: "2", baseRent: "3500", condition: "repair" })).toEqual({
      floor: 2, baseRent: 3500, condition: "repair",
    });
  });

  it("ไม่เปิดช่องให้เปลี่ยนว่าใครอยู่ห้องนี้", () => {
    const patch = roomEditPatch({ roomNo: "205", ...({ activeLeaseId: "L-T0001" } as object) });
    expect(patch).not.toHaveProperty("activeLeaseId");
  });

  it("ค่าที่ไม่ถูกต้องต้องไม่ผ่าน", () => {
    expect(() => roomEditPatch({ roomNo: "   " })).toThrow(LeaseOpError);
    expect(() => roomEditPatch({ type: "รายวัน" })).toThrow(LeaseOpError);
    expect(() => roomEditPatch({ baseRent: -1 })).toThrow(LeaseOpError);
    expect(() => roomEditPatch({})).toThrow(/ไม่มีอะไรให้แก้/);
  });
});

describe("tenantEditPatch", () => {
  it("ล้างค่าที่ว่างให้เป็น null ไม่ใช่สตริงว่าง", () => {
    expect(tenantEditPatch({ lineUserId: "  ", emergencyContact: "" })).toEqual({
      lineUserId: null, emergencyContact: null,
    });
  });

  it("ชื่อว่างไม่ได้", () => {
    expect(() => tenantEditPatch({ name: " " })).toThrow(LeaseOpError);
  });
});

describe("leaseTermsPatch", () => {
  it("แก้เงื่อนไขเงินได้", () => {
    expect(leaseTermsPatch(lease(), { rent: "3500", rates: { elec: "9" } })).toEqual({
      rent: 3500, rates: { ...RATES, elec: 9 },
    });
  });

  it("ย้ายห้องหรือเปลี่ยนคนด้วยการแก้สัญญาไม่ได้ ต้องปิดของเก่าเปิดใหม่", () => {
    expect(() => leaseTermsPatch(lease(), { roomId: "wlp1-205" })).toThrow(/ย้ายออก/);
    expect(() => leaseTermsPatch(lease(), { tenantId: "T0002" })).toThrow(/สัญญาใหม่/);
  });

  it("ส่ง roomId เดิมมาด้วยไม่ถือว่าย้ายห้อง", () => {
    expect(() => leaseTermsPatch(lease(), { roomId: "wlp1-102", rent: 3300 })).not.toThrow();
  });

  it("วันครบกำหนดเกิน 28 ไม่ได้ เพราะบางเดือนไม่มีวันนั้น", () => {
    expect(() => leaseTermsPatch(lease(), { dueDay: 31 })).toThrow(/1-28/);
  });

  it("วันสิ้นสุดมาก่อนวันเริ่มไม่ได้ แม้จะแก้มาทีละด้าน", () => {
    expect(() => leaseTermsPatch(lease(), { endDate: "2025-06-01" })).toThrow(/ไม่มาก่อน/);
  });
});

describe("nextCode", () => {
  it("ต่อจากเลขที่มากที่สุดที่มีอยู่", () => {
    expect(nextCode(["T0001", "T0018", "T0007"], "T")).toBe("T0019");
  });

  it("ยังไม่มีใครเลยเริ่มที่ 1 และข้ามรหัสที่ไม่เข้ารูปแบบ", () => {
    expect(nextCode([], "T")).toBe("T0001");
    expect(nextCode(["legacy", "T0003"], "T")).toBe("T0004");
  });
});

describe("buildLease", () => {
  const defaults = { rates: RATES, dueDay: 5 };

  it("ไม่กรอกค่าเช่ามา ใช้ราคาป้ายของห้อง", () => {
    const l = buildLease({ leaseId: "L-T0019", room: room(), tenant: tenant(), defaults, input: {} });
    expect(l).toMatchObject({ rent: 3200, status: "active", roomId: "wlp1-102", tenantId: "T0019", dueDay: 5 });
    expect(l.rates).toEqual(RATES);
  });

  it("ไม่มีคีย์ที่เป็น undefined เพราะ Firestore ปฏิเสธทั้งเอกสาร", () => {
    const l = buildLease({ leaseId: "L-T0019", room: room(), tenant: tenant(), defaults, input: {} });
    for (const [key, value] of Object.entries(l)) expect(value, key).not.toBeUndefined();
  });

  it("ช่วงวันที่กลับหัวไม่ได้", () => {
    expect(() =>
      buildLease({
        leaseId: "L-T0019", room: room(), tenant: tenant(), defaults,
        input: { startDate: "2026-05-01", endDate: "2026-01-01" },
      }),
    ).toThrow(LeaseOpError);
  });
});

describe("moveOutPatch", () => {
  it("ปิดสัญญาพร้อมวันย้ายออกและเหตุผล", () => {
    expect(moveOutPatch(lease(), { endDate: "2026-09-30", reason: "ย้ายกลับต่างจังหวัด" })).toMatchObject({
      status: "ended", endDate: "2026-09-30", endedReason: "ย้ายกลับต่างจังหวัด",
    });
  });

  it("บันทึกเงินประกันที่คืน และคืนเกินที่รับไว้ไม่ได้", () => {
    expect(moveOutPatch(lease(), { refundAmount: "6000" }).depositRefund).toMatchObject({ amount: 6000 });
    expect(() => moveOutPatch(lease(), { refundAmount: "9000" })).toThrow(/คืนเกิน/);
  });

  it("ไม่กรอกยอดคืน = ยังไม่ได้คืน ไม่ใช่คืน 0", () => {
    expect(moveOutPatch(lease(), {})).not.toHaveProperty("depositRefund");
  });

  it("สัญญาที่ปิดไปแล้วปิดซ้ำไม่ได้", () => {
    expect(() => moveOutPatch(lease({ status: "ended" }), {})).toThrow(/ปิดไปแล้ว/);
  });
});
