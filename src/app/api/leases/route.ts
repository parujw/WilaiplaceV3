import { ApiError, handle, readJson, requireEditor, requireSameProperty } from "@/lib/api";
import { db } from "@/lib/db";
import { buildLease, nextCode, type MoveInInput } from "@/lib/lease-ops";
import { audit, getProperty, getRoom, getTenant, listTenants } from "@/lib/repo";
import type { WriteOp } from "@/lib/db/store";
import type { Tenant } from "@/lib/types";

interface MoveInBody extends MoveInInput {
  roomId?: string;
  /** ผู้เช่าเดิมที่กลับมาเช่าอีกครั้ง */
  tenantId?: string;
  /** หรือผู้เช่าใหม่ที่ยังไม่มีในระบบ */
  tenant?: { name?: string; nickname?: string; phone?: string; note?: string };
}


/**
 * รหัสสัญญาที่ยังไม่มีใครใช้ — L-T0019 ถ้าว่าง ไม่ว่างก็ L-T0019-2, -3 ไปเรื่อยๆ
 * เกิดได้จริงเมื่อคนเดิมย้ายออกแล้วกลับมาเช่าใหม่ ทับของเก่าไม่ได้เพราะบิลเก่าชี้มาที่รหัสนั้น
 */
async function unusedLeaseId(tenantId: string): Promise<string> {
  const taken = new Set(
    (await db().list<{ id: string }>("leases", { where: [{ field: "tenantId", op: "==", value: tenantId }] }))
      .map((l) => l.id),
  );
  const base = `L-${tenantId}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

/**
 * ผู้เช่าเข้าอยู่ห้องว่าง
 *
 * เขียนสามที่ให้จบพร้อมกันเสมอ: ผู้เช่า (ถ้าเป็นคนใหม่) + สัญญา + activeLeaseId ของห้อง
 * ถ้าเขียนแยกแล้วพังกลางทาง จะเหลือสัญญาที่ไม่มีห้องชี้มา หรือห้องที่ชี้ไปสัญญาที่ไม่มีจริง
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("ทำสัญญาเช่า");
    const body = await readJson<MoveInBody>(request);

    if (!body.roomId) throw new ApiError("ไม่ได้ระบุห้อง");
    const room = requireSameProperty(await getRoom(body.roomId), propertyId, "ไม่พบห้องนี้");
    if (room.activeLeaseId) {
      throw new ApiError("ห้องนี้มีผู้เช่าอยู่แล้ว ต้องทำรายการย้ายออกก่อน", 409);
    }

    const property = await getProperty(propertyId);
    if (!property) throw new ApiError("ไม่พบอาคาร", 404);

    const ops: WriteOp[] = [];

    /* --- ผู้เช่า: คนเดิมที่กลับมา หรือคนใหม่ที่ต้องออกรหัสให้ --- */
    let tenant: Tenant;
    if (body.tenantId) {
      tenant = requireSameProperty(await getTenant(body.tenantId), propertyId, "ไม่พบผู้เช่ารายนี้");
    } else {
      const name = body.tenant?.name?.trim();
      if (!name) throw new ApiError("ต้องระบุชื่อผู้เช่า");

      const existing = await listTenants(propertyId);
      tenant = {
        id: nextCode(existing.map((t) => t.id), "T"),
        propertyId,
        name,
        nickname: body.tenant?.nickname?.trim() ?? "",
        phone: body.tenant?.phone?.trim() ?? "",
        photoUrl: null,
        lineUserId: null,
        idCard: null,
        emergencyContact: null,
        ...(body.tenant?.note?.trim() ? { note: body.tenant.note.trim() } : {}),
      };
      ops.push({ type: "set", collection: "tenants", id: tenant.id, data: tenant as unknown as Record<string, unknown> });
    }

    /* --- สัญญา: รหัสต่อท้ายรหัสผู้เช่า คนเดิมกลับมาเช่าใหม่ก็ต้องไม่ทับของเก่า --- */
    const leaseId = await unusedLeaseId(tenant.id);

    const lease = buildLease({
      leaseId,
      room,
      tenant,
      defaults: { rates: property.defaultRates, dueDay: property.paymentDueDay },
      input: body,
    });

    ops.push(
      { type: "set", collection: "leases", id: lease.id, data: lease as unknown as Record<string, unknown> },
      { type: "update", collection: "rooms", id: room.id, data: { activeLeaseId: lease.id } },
    );

    await db().batch(ops);
    await audit(user, {
      propertyId,
      action: "lease.create",
      targetType: "lease",
      targetId: lease.id,
      before: { roomActiveLeaseId: null },
      after: { roomId: room.id, tenantId: tenant.id, rent: lease.rent, startDate: lease.startDate },
    });

    return { ok: true, leaseId: lease.id, tenantId: tenant.id };
  });
}
