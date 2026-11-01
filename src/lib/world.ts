/**
 * W World — ออฟฟิศพนักงานอัตโนมัติของอาคาร คำนวณล้วน ไม่แตะฐานข้อมูล
 *
 * พนักงานแต่ละคนคือ "งานประจำ" หนึ่งเรื่องของการบริหารอาคาร
 * (จดมิเตอร์ ออกบิล ส่ง LINE ทวงเงิน ซ่อม สัญญา ห้องว่าง)
 * แต่ละคนมีคิวงานที่คำนวณจากข้อมูลจริง และมีสเปก automation ว่าจะทำงานเมื่อไหร่ ทำอะไร
 *
 * หน้า /world วาดออกมาเป็นออฟฟิศพิกเซล ส่วน /api/world คืนชุดเดียวกันเป็น JSON
 * ให้ตัวตั้งเวลา (Vercel Cron, n8n, Make ฯลฯ) มาอ่านคิวไปทำต่อได้
 *
 * หลักสำคัญ: พนักงานทุกคนแค่ "เตรียมงาน" อะไรที่แตะเงินหรือส่งถึงผู้เช่า
 * ต้องให้คนกดยืนยันก่อน (mode: "approve") — ระบบห้ามออกบิลหรือทวงเงินเองเงียบๆ
 */

import { inBillingWindow } from "./alerts";
import { currentCycle, daysOverdue } from "./billing";
import { thaiDate } from "./format";
import type { Bill, Cycle, Lease, MaintenanceRequest, MeterReading, RoomView } from "./types";

export type AgentId = "head" | "meter" | "billing" | "line" | "collect" | "repair" | "lease" | "rooms";
export type AgentStatus = "idle" | "waiting" | "busy" | "alert";

export interface WorldTask {
  id: string;
  label: string;
  detail?: string;
  href: string;
}

export interface Automation {
  /** ทำงานเมื่อไหร่ — ภาษาคน */
  trigger: string;
  /** cron มาตรฐาน 5 ช่อง เวลาไทย สำหรับเอาไปตั้งในตัวตั้งเวลา */
  cron: string;
  /** ทำอะไรเมื่อถึงเวลา */
  action: string;
  /** auto = ทำเองได้เลย (อ่านอย่างเดียว/แจ้งเตือน), approve = เตรียมไว้ให้คนกดยืนยัน */
  mode: "auto" | "approve";
}

export interface WorldAgent {
  id: AgentId;
  /** ชื่อเล่นบนป้ายโต๊ะ ตัวอักษรอังกฤษเพื่อให้อ่านได้ในฟอนต์พิกเซล */
  name: string;
  role: string;
  status: AgentStatus;
  summary: string;
  tasks: WorldTask[];
  href: string;
  automation: Automation;
}

export interface WorldInput {
  views: RoomView[];
  bills: Bill[];
  readings: MeterReading[];
  leases: Lease[];
  maintenance: MaintenanceRequest[];
  cycle?: Cycle;
  today?: Date;
}

export interface World {
  cycle: Cycle;
  agents: WorldAgent[];
  totalTasks: number;
  /** จำนวนพนักงานที่ไม่มีงานค้าง */
  clear: number;
}

const EXPIRY_DAYS = 60;

function statusOf(count: number, urgent: boolean): AgentStatus {
  if (count === 0) return "idle";
  return urgent ? "alert" : "busy";
}

const RANK: Record<AgentStatus, number> = { idle: 0, waiting: 1, busy: 2, alert: 3 };

export function buildWorld(input: WorldInput): World {
  const today = input.today ?? new Date();
  const cycle = input.cycle ?? currentCycle(today);
  const window = inBillingWindow(cycle, today);
  const occupied = input.views.filter((v) => v.lease);
  const liveBills = input.bills.filter((b) => b.status !== "void");

  /* --- MITER: ห้องที่มีคนอยู่แต่ยังไม่จดมิเตอร์รอบนี้ --- */
  const readRooms = new Set(input.readings.filter((r) => r.cycle === cycle).map((r) => r.roomId));
  const unread = occupied.filter((v) => !readRooms.has(v.room.id));
  const meter: WorldAgent = {
    id: "meter",
    name: "MITER",
    role: "จดมิเตอร์น้ำไฟ",
    status: unread.length === 0 ? "idle" : window ? "busy" : "waiting",
    summary:
      unread.length === 0
        ? "จดครบทุกห้องแล้ว"
        : window
          ? `ยังไม่จด ${unread.length} ห้อง`
          : `รอช่วงสิ้นเดือน (${unread.length} ห้อง)`,
    tasks: unread.map((v) => ({
      id: `meter-${v.room.id}`,
      label: `จดมิเตอร์ห้อง ${v.room.roomNo}`,
      detail: v.tenant?.name,
      href: "/meter",
    })),
    href: "/meter",
    automation: {
      trigger: "7 วันสุดท้ายของเดือน 09:00",
      cron: "0 9 24-31 * *",
      action: "พิมพ์ใบจดมิเตอร์ + ส่ง LINE ให้ผู้เช่าส่งเลขมิเตอร์",
      mode: "auto",
    },
  };

  /* --- BILLY: จดแล้วแต่ยังไม่ออกบิลค่าเช่ารอบนี้ --- */
  const billedRooms = new Set(
    liveBills.filter((b) => b.cycle === cycle && b.lines.some((l) => l.type === "rent")).map((b) => b.roomId),
  );
  const unbilled = occupied.filter((v) => !billedRooms.has(v.room.id));
  const ready = unbilled.filter((v) => readRooms.has(v.room.id));
  const billing: WorldAgent = {
    id: "billing",
    name: "BILLY",
    role: "ออกบิลค่าเช่า",
    status: unbilled.length === 0 ? "idle" : window ? (ready.length > 0 ? "busy" : "waiting") : "waiting",
    summary:
      unbilled.length === 0
        ? "ออกบิลครบแล้ว"
        : ready.length > 0
          ? `พร้อมออกบิล ${ready.length} ห้อง`
          : `รอมิเตอร์ก่อน (${unbilled.length} ห้อง)`,
    tasks: ready.map((v) => ({
      id: `bill-${v.room.id}`,
      label: `ออกบิลห้อง ${v.room.roomNo}`,
      detail: v.lease ? `ค่าเช่า ${v.lease.rent.toLocaleString("th-TH")} บาท` : undefined,
      href: "/meter",
    })),
    href: "/meter",
    automation: {
      trigger: "หลังจดมิเตอร์ครบ ทุกวัน 18:00",
      cron: "0 18 * * *",
      action: "ร่างบิลทั้งตึกจากเลขมิเตอร์ รอเจ้าของกดออกบิลชุดเดียว",
      mode: "approve",
    },
  };

  /* --- LINEY: บิลรอบนี้ที่ยังไม่ได้ส่ง LINE --- */
  const unsent = liveBills.filter((b) => b.cycle === cycle && b.balance > 0 && !b.sentToLineAt);
  const line: WorldAgent = {
    id: "line",
    name: "LINEY",
    role: "ส่งบิลทาง LINE",
    status: statusOf(unsent.length, false),
    summary: unsent.length === 0 ? "ส่งครบแล้ว" : `รอส่ง ${unsent.length} บิล`,
    tasks: unsent.map((b) => ({
      id: `line-${b.id}`,
      label: `ส่งบิลห้อง ${b.roomNo}`,
      detail: `${b.tenantSnapshot.name} · ${b.total.toLocaleString("th-TH")} บาท`,
      href: `/bills/${encodeURIComponent(b.id)}`,
    })),
    href: "/bills",
    automation: {
      trigger: "ทันทีที่ออกบิล",
      cron: "*/30 * * * *",
      action: "ส่งใบแจ้งหนี้เข้า LINE ผู้เช่าที่ผูกบัญชีแล้ว",
      mode: "approve",
    },
  };

  /* --- CASHY: บิลเกินกำหนด --- */
  const overdue = liveBills
    .filter((b) => b.balance > 0 && daysOverdue(b.dueDate, today) > 0)
    .sort((a, b) => daysOverdue(b.dueDate, today) - daysOverdue(a.dueDate, today));
  const overdueSum = overdue.reduce((s, b) => s + b.balance, 0);
  const collect: WorldAgent = {
    id: "collect",
    name: "CASHY",
    role: "ติดตามค้างชำระ",
    status: statusOf(overdue.length, overdue.some((b) => daysOverdue(b.dueDate, today) > 30)),
    summary:
      overdue.length === 0 ? "ไม่มีค้างชำระ" : `ค้าง ${overdue.length} บิล · ${overdueSum.toLocaleString("th-TH")} บาท`,
    tasks: overdue.map((b) => ({
      id: `collect-${b.id}`,
      label: `ทวงห้อง ${b.roomNo} · ${b.balance.toLocaleString("th-TH")} บาท`,
      detail: `เกินกำหนด ${daysOverdue(b.dueDate, today)} วัน · ${b.tenantSnapshot.name}`,
      href: `/bills/${encodeURIComponent(b.id)}`,
    })),
    href: "/bills?status=unpaid",
    automation: {
      trigger: "ทุกวัน 10:00 หลังเลยกำหนดชำระ",
      cron: "0 10 * * *",
      action: "ร่างข้อความเตือนชำระแบบสุภาพ ไล่ตามจำนวนวันที่ค้าง",
      mode: "approve",
    },
  };

  /* --- FIXY: งานซ่อมที่ยังไม่ปิด --- */
  const openTickets = input.maintenance
    .filter((m) => m.status === "open" || m.status === "in_progress")
    .sort((a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent"));
  const repair: WorldAgent = {
    id: "repair",
    name: "FIXY",
    role: "ช่างซ่อมบำรุง",
    status: statusOf(openTickets.length, openTickets.some((m) => m.urgency === "urgent")),
    summary: openTickets.length === 0 ? "ไม่มีงานซ่อมค้าง" : `งานซ่อมเปิดอยู่ ${openTickets.length} งาน`,
    tasks: openTickets.map((m) => ({
      id: `repair-${m.id}`,
      label: `ห้อง ${m.roomNo}: ${m.problem}${m.urgency === "urgent" ? " (ด่วน)" : ""}`,
      detail: `${m.ticketNo} · แจ้ง ${thaiDate(m.reportedAt)}`,
      href: "/maintenance",
    })),
    href: "/maintenance",
    automation: {
      trigger: "เมื่อผู้เช่าแจ้งซ่อมผ่าน LINE",
      cron: "0 8 * * *",
      action: "เปิดใบงาน แจ้งช่าง และสรุปงานค้างทุกเช้า",
      mode: "auto",
    },
  };

  /* --- CONTRA: สัญญาใกล้หมด / หมดแล้ว --- */
  const limit = new Date(today);
  limit.setDate(limit.getDate() + EXPIRY_DAYS);
  const limitIso = limit.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  const roomByLease = new Map(occupied.map((v) => [v.lease!.id, v.room]));
  const expiring = input.leases
    .filter((l) => l.status === "active" && l.endDate && l.endDate <= limitIso)
    .sort((a, b) => a.endDate!.localeCompare(b.endDate!));
  const lease: WorldAgent = {
    id: "lease",
    name: "CONTRA",
    role: "ดูแลสัญญาเช่า",
    status: statusOf(expiring.length, expiring.some((l) => l.endDate! < todayIso)),
    summary: expiring.length === 0 ? `ไม่มีสัญญาหมดใน ${EXPIRY_DAYS} วัน` : `สัญญาใกล้หมด ${expiring.length} ฉบับ`,
    tasks: expiring.map((l) => {
      const room = roomByLease.get(l.id);
      return {
        id: `lease-${l.id}`,
        label: `ต่อสัญญาห้อง ${room?.roomNo ?? "—"}`,
        detail: `${l.endDate! < todayIso ? "หมดแล้ว" : "สิ้นสุด"} ${thaiDate(l.endDate!)}`,
        href: room ? `/rooms/${room.id}` : "/tenants",
      };
    }),
    href: "/tenants",
    automation: {
      trigger: "ทุกวันจันทร์ 09:00",
      cron: "0 9 * * 1",
      action: `เตือนสัญญาที่จะหมดใน ${EXPIRY_DAYS} วัน + ร่างข้อความถามเรื่องต่อสัญญา`,
      mode: "approve",
    },
  };

  /* --- ROOMY: ห้องว่าง + ห้องที่กำลังทำความสะอาด/ซ่อม --- */
  const vacant = input.views.filter((v) => !v.lease);
  const notReady = input.views.filter((v) => v.room.condition !== "ready");
  const roomTasks: WorldTask[] = [
    ...notReady.map((v) => ({
      id: `room-cond-${v.room.id}`,
      label: `ห้อง ${v.room.roomNo} ${v.room.condition === "cleaning" ? "รอทำความสะอาด" : "รอซ่อม"}`,
      href: `/rooms/${v.room.id}`,
    })),
    ...vacant
      .filter((v) => v.room.condition === "ready")
      .map((v) => ({
        id: `room-vacant-${v.room.id}`,
        label: `ห้อง ${v.room.roomNo} ว่าง พร้อมปล่อยเช่า`,
        detail: `ราคาป้าย ${v.room.baseRent.toLocaleString("th-TH")} บาท`,
        href: `/rooms/${v.room.id}`,
      })),
  ];
  const rooms: WorldAgent = {
    id: "rooms",
    name: "ROOMY",
    role: "ดูแลห้องว่าง",
    status: statusOf(roomTasks.length, false),
    summary:
      roomTasks.length === 0 ? "ห้องเต็มทุกห้อง" : `ว่าง ${vacant.length} · ไม่พร้อม ${notReady.length} ห้อง`,
    tasks: roomTasks,
    href: "/property",
    automation: {
      trigger: "ทุกวันศุกร์ 15:00",
      cron: "0 15 * * 5",
      action: "สรุปห้องว่าง + ร่างประกาศหาผู้เช่า",
      mode: "approve",
    },
  };

  const staff = [meter, billing, line, collect, repair, lease, rooms];
  // งานของคนที่ "รอคิว" (เช่น มิเตอร์กลางเดือน) ยังทำไม่ได้ ไม่นับเป็นงานค้าง
  const active = staff.filter((a) => a.status === "busy" || a.status === "alert");
  const totalTasks = active.reduce((s, a) => s + a.tasks.length, 0);
  const worst = staff.reduce<AgentStatus>((w, a) => (RANK[a.status] > RANK[w] ? a.status : w), "idle");
  const busiest = [...active].sort((a, b) => b.tasks.length - a.tasks.length)[0];

  const head: WorldAgent = {
    id: "head",
    name: "WILAI",
    role: "หัวหน้าออฟฟิศ",
    status: worst,
    summary: totalTasks === 0 ? "ทุกคนว่าง ไม่มีงานค้าง" : `งานค้างรวม ${totalTasks} งาน`,
    tasks: active
      .sort((a, b) => RANK[b.status] - RANK[a.status] || b.tasks.length - a.tasks.length)
      .map((a) => ({ id: `head-${a.id}`, label: `${a.name} · ${a.role}`, detail: a.summary, href: a.href })),
    href: "/alerts",
    automation: {
      trigger: "ทุกเช้า 08:00",
      cron: "0 8 * * *",
      action:
        totalTasks === 0
          ? "สรุปงานประจำวันส่ง LINE เจ้าของ"
          : `สรุปงานประจำวันส่ง LINE เจ้าของ (วันนี้ ${busiest?.name} งานเยอะสุด)`,
      mode: "auto",
    },
  };

  return {
    cycle,
    agents: [head, ...staff],
    totalTasks,
    clear: staff.length - active.length,
  };
}

/* ------------------------------ สรุปประจำวัน ------------------------------ */

const STATUS_ICON: Record<AgentStatus, string> = { idle: "✅", waiting: "💤", busy: "🟡", alert: "🔴" };

/**
 * ข้อความสรุปเช้าที่ WILAI ส่งเข้า LINE เจ้าของ — หลายอาคารรวมเป็นข้อความเดียว
 * บอกแค่ว่าใครมีงานกี่งาน กับงานแรกๆ ที่ควรทำ ไม่ใส่ชื่อ/เบอร์ผู้เช่าทั้งหมดลงแชต
 */
export function dailyBrief(
  buildings: Array<{ name: string; world: World }>,
  options: { today?: Date; appUrl?: string; perAgent?: number } = {},
): string {
  const today = options.today ?? new Date();
  const perAgent = options.perAgent ?? 3;
  const date = today.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" });
  const total = buildings.reduce((s, b) => s + b.world.totalTasks, 0);

  const lines: string[] = [`☀️ W World สรุปเช้า ${date}`, total === 0 ? "ไม่มีงานค้าง ทุกคนว่าง 🎉" : `งานค้างรวม ${total} งาน`];

  for (const { name, world } of buildings) {
    lines.push("", `🏢 ${name}`);
    const staff = world.agents.filter((a) => a.id !== "head");
    const active = staff.filter((a) => a.status === "busy" || a.status === "alert");
    if (active.length === 0) {
      lines.push("✅ ไม่มีงานค้าง");
      continue;
    }
    active.sort((a, b) => RANK[b.status] - RANK[a.status] || b.tasks.length - a.tasks.length);
    for (const a of active) {
      lines.push(`${STATUS_ICON[a.status]} ${a.name} (${a.role}) — ${a.summary}`);
      for (const t of a.tasks.slice(0, perAgent)) lines.push(`   • ${t.label}`);
      if (a.tasks.length > perAgent) lines.push(`   • และอีก ${a.tasks.length - perAgent} งาน`);
    }
    const waiting = staff.filter((a) => a.status === "waiting");
    if (waiting.length > 0) lines.push(`💤 รอคิว: ${waiting.map((a) => a.name).join(", ")}`);
  }

  if (options.appUrl) lines.push("", `เปิดดู: ${options.appUrl.replace(/\/$/, "")}/world`);
  // LINE จำกัดข้อความละ 5,000 ตัวอักษร
  const body = lines.join("\n");
  return body.length > 4900 ? `${body.slice(0, 4890)}\n…` : body;
}
