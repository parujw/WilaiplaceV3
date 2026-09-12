import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, getRoom } from "@/lib/repo";
import { getSelectedPropertyId, getSessionUser } from "@/lib/session";
import type { MaintenanceRequest, MaintenanceStatus, MaintenanceUrgency } from "@/lib/types";

const URGENCIES: MaintenanceUrgency[] = ["low", "normal", "urgent"];
const STATUSES: MaintenanceStatus[] = ["open", "in_progress", "done", "cancelled"];

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "ไม่มีสิทธิ์แจ้งซ่อม" }, { status: 403 });

  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return NextResponse.json({ error: "ยังไม่ได้เลือกอาคาร" }, { status: 400 });

  const body = (await request.json()) as {
    roomId?: string; category?: string; problem?: string; urgency?: MaintenanceUrgency;
  };

  if (!body.roomId) return NextResponse.json({ error: "ต้องเลือกห้อง" }, { status: 400 });
  if (!body.problem?.trim()) return NextResponse.json({ error: "ต้องระบุปัญหา" }, { status: 400 });

  const room = await getRoom(body.roomId);
  if (!room || room.propertyId !== propertyId) return NextResponse.json({ error: "ไม่พบห้อง" }, { status: 404 });

  const seq = await db().nextSequence("maintenance");
  const ticketNo = `MT-${String(seq).padStart(4, "0")}`;

  const ticket: MaintenanceRequest = {
    id: ticketNo,
    propertyId,
    ticketNo,
    roomId: room.id,
    roomNo: room.roomNo,
    category: body.category?.trim() || "ทั่วไป",
    problem: body.problem.trim(),
    urgency: URGENCIES.includes(body.urgency as MaintenanceUrgency) ? body.urgency! : "normal",
    status: "open",
    reportedAt: new Date().toISOString().slice(0, 10),
    reportedBy: user.name,
    assignedTo: null,
    cost: 0,
  };

  await db().set("maintenance", ticket.id, ticket as unknown as Record<string, unknown>);
  await audit(user, {
    propertyId,
    action: "maintenance.create",
    targetType: "maintenance",
    targetId: ticket.id,
    before: null,
    after: ticket,
  });

  return NextResponse.json({ ok: true, ticketNo });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไข" }, { status: 403 });

  const body = (await request.json()) as { id?: string; status?: MaintenanceStatus; cost?: number };
  if (!body.id || !STATUSES.includes(body.status as MaintenanceStatus)) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }

  const ticket = await db().get<MaintenanceRequest>("maintenance", body.id);
  if (!ticket) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

  const patch: Record<string, unknown> = { status: body.status };
  if (Number.isFinite(Number(body.cost))) patch.cost = Number(body.cost);

  await db().update("maintenance", body.id, patch);
  await audit(user, {
    propertyId: ticket.propertyId,
    action: "maintenance.update",
    targetType: "maintenance",
    targetId: body.id,
    before: { status: ticket.status, cost: ticket.cost },
    after: patch,
  });

  return NextResponse.json({ ok: true });
}
