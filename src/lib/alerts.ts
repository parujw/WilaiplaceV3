/**
 * เรื่องที่เจ้าของต้องรู้ — รวมไว้ที่กระดิ่งมุมขวาบน คำนวณล้วน ไม่แตะฐานข้อมูล
 *
 * เดิมข้อมูลพวกนี้กระจายอยู่คนละหน้า ต้องเดินดูเองทีละหน้าถึงจะรู้ว่ามีอะไรค้าง
 * บิลเกินกำหนดอยู่หน้าบิล ห้องว่างอยู่หน้าอาคาร งานซ่อมอยู่อีกหน้า
 * ถ้าไม่ได้เปิดหน้านั้นก็ไม่รู้ ที่นี่จึงรวมทุกเรื่องที่ต้อง "ทำอะไรสักอย่าง" ไว้ที่เดียว
 *
 * เกณฑ์คัดเข้า: ต้องมีสิ่งที่ทำได้ตอนนี้ ไม่ใช่แค่ข้อมูลน่าสนใจ
 * "ห้อง 301 ค้าง 4,700 บาทมา 35 วัน" เข้า — ไปทวงได้
 * "อัตราเข้าอยู่ 82%" ไม่เข้า — เป็นตัวเลขให้ดู อยู่หน้าวิเคราะห์
 */

import { currentCycle, daysOverdue } from "./billing";
import { thaiDate } from "./format";
import type { Bill, Cycle, Lease, MaintenanceRequest, RoomView, Tenant } from "./types";

export type AlertLevel = "danger" | "warn" | "info";

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  href: string;
  /** ตัวเลขประกอบ เช่น จำนวนเงินหรือจำนวนรายการ */
  amount?: number;
}

/** เรียงตามความเร่งด่วน เรื่องที่ต้องทำก่อนอยู่บนสุด */
const LEVEL_ORDER: Record<AlertLevel, number> = { danger: 0, warn: 1, info: 2 };

export interface AlertInput {
  bills: Bill[];
  views: RoomView[];
  leases: Lease[];
  tenants: Tenant[];
  maintenance: MaintenanceRequest[];
  cycle?: Cycle;
  today?: Date;
  /** ปัญหาข้อมูลที่ตัวแปลง V2 บันทึกไว้ตอนย้าย */
  migrationIssues?: string[];
}

/** สัญญาที่จะหมดอายุภายในกี่วันถึงถือว่าต้องเริ่มคุยเรื่องต่อสัญญา */
const EXPIRY_WARNING_DAYS = 60;

/**
 * เริ่มเตือนเรื่องออกบิลก่อนสิ้นเดือนกี่วัน
 *
 * รอบการทำงานจริงคือเดินจดมิเตอร์ช่วงสัปดาห์สุดท้ายของเดือน แล้วค่อยออกบิล
 * ถ้าเตือนตั้งแต่วันที่ 1 ว่า "ยังไม่ได้ออกบิล 13 ห้อง" มันจะค้างอยู่ทั้งเดือน
 * คนใช้จะเลิกอ่านการแจ้งเตือนไปเลย เพราะมีของที่ยังทำไม่ได้ค้างอยู่ตลอด
 */
const BILLING_WINDOW_DAYS = 7;

/** วันนี้อยู่ในช่วงที่ควรออกบิลของรอบนั้นแล้วหรือยัง */
function inBillingWindow(cycle: Cycle, today: Date): boolean {
  const year = Number(cycle.slice(0, 4));
  const month = Number(cycle.slice(4, 6));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return true;

  // รอบที่ผ่านไปแล้วคือเลยกำหนดมาแล้ว ต้องเตือนทันทีไม่ต้องรอ
  const lastDay = new Date(year, month, 0).getDate();
  const endOfCycle = new Date(year, month - 1, lastDay);
  if (today > endOfCycle) return true;

  const startWarning = new Date(year, month - 1, Math.max(1, lastDay - BILLING_WINDOW_DAYS + 1));
  return today >= startWarning;
}

export function buildAlerts(input: AlertInput): Alert[] {
  const today = input.today ?? new Date();
  const cycle = input.cycle ?? currentCycle(today);
  const alerts: Alert[] = [];

  /* --- บิลเกินกำหนด: เรียงจากค้างนานสุด --- */
  const overdue = input.bills
    .filter((b) => b.status !== "void" && b.balance > 0 && daysOverdue(b.dueDate, today) > 0)
    .sort((a, b) => daysOverdue(b.dueDate, today) - daysOverdue(a.dueDate, today));

  for (const bill of overdue) {
    const days = daysOverdue(bill.dueDate, today);
    alerts.push({
      id: `overdue-${bill.id}`,
      level: days > 30 ? "danger" : "warn",
      title: `ห้อง ${bill.roomNo} ค้างชำระ ${bill.balance.toLocaleString("th-TH")} บาท`,
      detail: `เกินกำหนดมา ${days} วัน · ${bill.tenantSnapshot.name}`,
      href: `/bills/${encodeURIComponent(bill.id)}`,
      amount: bill.balance,
    });
  }

  /* --- ห้องที่มีคนอยู่แต่ยังไม่ได้ออกบิลรอบนี้ --- */
  // นับเฉพาะบิลที่มีค่าเช่า บิลมัดจำหรือค่าซ่อมไม่ได้แปลว่าออกบิลของเดือนนั้นแล้ว
  const billedRooms = new Set(
    input.bills
      .filter((b) => b.cycle === cycle && b.status !== "void" && b.lines.some((l) => l.type === "rent"))
      .map((b) => b.roomId),
  );
  const unbilled = input.views.filter((v) => v.lease && !billedRooms.has(v.room.id));
  if (unbilled.length > 0 && inBillingWindow(cycle, today)) {
    alerts.push({
      id: `unbilled-${cycle}`,
      level: "warn",
      title: `ยังไม่ได้ออกบิล ${unbilled.length} ห้อง`,
      detail: `ห้อง ${unbilled.map((v) => v.room.roomNo).join(", ")}`,
      href: "/meter",
      amount: unbilled.length,
    });
  }

  /* --- คนที่ย้ายออกหรือย้ายห้องกลางรอบ ยังไม่ได้เก็บค่าน้ำไฟงวดสุดท้าย --- */
  //
  // ห้องที่ว่างแล้วจะหายไปจากหน้าจดมิเตอร์ เพราะหน้านั้นแสดงเฉพาะห้องที่มีสัญญาเดินอยู่
  // พอถึงสิ้นเดือนจึงมองไม่เห็นว่ายังมีค่าน้ำไฟของคนที่อยู่มาครึ่งเดือนค้างอยู่
  // เป็นรายได้ที่หายไปเงียบๆ โดยไม่มีอะไรบอก
  //
  // ไม่นับเป็นเรื่องเร่งด่วน เพราะบางทีเจ้าของก็ไม่เก็บงวดสุดท้าย เป็นแค่เครื่องเตือน
  const roomByLeaseId = new Map(input.views.map((v) => [v.lease?.id, v.room]));
  const billedLeases = new Set(
    input.bills.filter((b) => b.cycle === cycle && b.status !== "void").map((b) => b.leaseId),
  );

  for (const lease of input.leases) {
    if (lease.status !== "ended" || !lease.endDate) continue;
    // จบในรอบนี้เท่านั้น รอบเก่าที่ผ่านไปแล้วไม่ต้องเตือนค้างไว้ตลอด
    if (lease.endDate.slice(0, 4) + lease.endDate.slice(5, 7) !== cycle) continue;
    if (billedLeases.has(lease.id)) continue;

    const tenant = input.tenants.find((t) => t.id === lease.tenantId);
    const moved = Boolean(lease.transferredTo);
    alerts.push({
      id: `final-bill-${lease.id}`,
      level: "info",
      title: `ยังไม่ได้ออกบิลงวดสุดท้ายให้${tenant?.name ?? "ผู้เช่าที่ย้ายออก"}`,
      detail:
        `${moved ? "ย้ายห้อง" : "ย้ายออก"}เมื่อ ${thaiDate(lease.endDate)}` +
        ` · ห้องเดิมหายจากหน้าจดมิเตอร์แล้ว ถ้าจะเก็บค่าน้ำไฟถึงวันย้าย ให้กดออกบิลเอง`,
      href: "/bills/new",
    });
  }

  /* --- งานซ่อมที่ยังไม่ปิด --- */
  for (const ticket of input.maintenance.filter((m) => m.status === "open" || m.status === "in_progress")) {
    alerts.push({
      id: `maintenance-${ticket.id}`,
      level: ticket.urgency === "urgent" ? "danger" : "info",
      title: `แจ้งซ่อมห้อง ${ticket.roomNo}${ticket.urgency === "urgent" ? " (ด่วน)" : ""}`,
      detail: `${ticket.problem} · แจ้งเมื่อ ${thaiDate(ticket.reportedAt)}`,
      href: "/maintenance",
    });
  }

  /* --- สัญญาที่กำลังจะหมดอายุ --- */
  const roomByLease = new Map(input.views.filter((v) => v.lease).map((v) => [v.lease!.id, v.room]));
  const limit = new Date(today);
  limit.setDate(limit.getDate() + EXPIRY_WARNING_DAYS);
  const limitIso = limit.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  for (const lease of input.leases) {
    if (lease.status !== "active" || !lease.endDate) continue;
    if (lease.endDate > limitIso) continue;
    const room = roomByLease.get(lease.id);
    alerts.push({
      id: `expiry-${lease.id}`,
      level: lease.endDate < todayIso ? "warn" : "info",
      title: `สัญญาห้อง ${room?.roomNo ?? "—"} ${lease.endDate < todayIso ? "หมดอายุแล้ว" : "ใกล้หมดอายุ"}`,
      detail: `สิ้นสุด ${thaiDate(lease.endDate)} · ค่าเช่า ${lease.rent.toLocaleString("th-TH")} บาท/เดือน`,
      href: room ? `/rooms/${room.id}` : "/property",
    });
  }

  /* --- ห้องว่าง: รวมเป็นรายการเดียว ไม่แยกทีละห้องให้รก --- */
  const vacant = input.views.filter((v) => !v.lease);
  if (vacant.length > 0) {
    const monthly = vacant.reduce((sum, v) => sum + v.room.baseRent, 0);
    alerts.push({
      id: "vacant",
      level: "info",
      title: `ห้องว่าง ${vacant.length} ห้อง`,
      detail: `เสียโอกาสรายได้ ${monthly.toLocaleString("th-TH")} บาท/เดือน · ห้อง ${vacant.map((v) => v.room.roomNo).join(", ")}`,
      href: "/property",
      amount: monthly,
    });
  }

  /* --- ผู้เช่าที่ติดต่อไม่ได้: ทวงเงินหรือแจ้งเรื่องด่วนไม่ได้เลย --- */
  const housed = new Set(input.leases.filter((l) => l.status === "active").map((l) => l.tenantId));
  const noPhone = input.tenants.filter((t) => housed.has(t.id) && !t.phone.trim());
  if (noPhone.length > 0) {
    alerts.push({
      id: "no-phone",
      level: "info",
      title: `ผู้เช่า ${noPhone.length} รายไม่มีเบอร์โทรในระบบ`,
      detail: noPhone.map((t) => t.name).join(", "),
      href: "/tenants",
    });
  }

  /* --- ปัญหาที่พบตอนย้ายข้อมูลจาก V2 --- */
  if (input.migrationIssues?.length) {
    alerts.push({
      id: "migration",
      level: "info",
      title: `ข้อมูลที่ย้ายมาจาก V2 มีจุดต้องตรวจ ${input.migrationIssues.length} เรื่อง`,
      detail: input.migrationIssues[0],
      href: "/settings",
    });
  }

  return alerts.sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || (b.amount ?? 0) - (a.amount ?? 0),
  );
}

/** จำนวนที่ขึ้นบนกระดิ่ง — นับเฉพาะเรื่องที่ต้องรีบ ไม่งั้นตัวเลขจะบวมจนไม่มีความหมาย */
export function badgeCount(alerts: Alert[]): number {
  return alerts.filter((a) => a.level !== "info").length;
}
