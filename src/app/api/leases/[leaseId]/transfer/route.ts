import { ApiError, handle, readJson, requireEditor, requireSameProperty } from "@/lib/api";
import { db } from "@/lib/db";
import { transferPlan, type TransferInput } from "@/lib/lease-ops";
import { audit, getLease, getRoom } from "@/lib/repo";
import type { WriteOp } from "@/lib/db/store";
import type { Lease } from "@/lib/types";

interface TransferBody extends TransferInput {
  toRoomId?: string;
}

/** รหัสสัญญาที่ยังไม่มีใครใช้ ของผู้เช่าคนเดิมที่ย้ายห้อง */
async function unusedLeaseId(tenantId: string): Promise<string> {
  const taken = new Set(
    (await db().list<Lease>("leases", { where: [{ field: "tenantId", op: "==", value: tenantId }] }))
      .map((l) => l.id),
  );
  const base = `L-${tenantId}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

/**
 * ย้ายผู้เช่าไปอีกห้อง
 *
 * เขียนสี่ที่ให้จบพร้อมกัน สัญญาเดิม สัญญาใหม่ และ activeLeaseId ของทั้งสองห้อง
 * ถ้าพังกลางทางจะเหลือคนคนเดียวอยู่สองห้อง หรือห้องที่ชี้ไปสัญญาที่จบแล้ว
 *
 * ไม่บล็อกเมื่อยังมีบิลค้าง เพราะหนี้ตามตัวคนไปห้องใหม่อยู่แล้ว
 * (ดู lib/tenancy.ts — ยอดค้างยกมาจะตามไปเข้าบิลห้องใหม่ให้เอง)
 */
export async function POST(request: Request, { params }: { params: Promise<{ leaseId: string }> }) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("ย้ายห้อง");
    const { leaseId } = await params;
    const body = await readJson<TransferBody>(request);

    if (!body.toRoomId) throw new ApiError("ไม่ได้ระบุห้องปลายทาง");

    const lease = requireSameProperty(await getLease(decodeURIComponent(leaseId)), propertyId, "ไม่พบสัญญานี้");
    const [fromRoom, toRoom] = await Promise.all([getRoom(lease.roomId), getRoom(body.toRoomId)]);
    if (!fromRoom) throw new ApiError("ไม่พบห้องเดิม", 404);
    requireSameProperty(toRoom, propertyId, "ไม่พบห้องปลายทาง");

    const plan = transferPlan({
      lease,
      fromRoom,
      toRoom: toRoom!,
      toLeaseId: await unusedLeaseId(lease.tenantId),
      input: body,
    });

    const ops: WriteOp[] = [
      { type: "update", collection: "leases", id: lease.id, data: plan.from },
      { type: "set", collection: "leases", id: plan.to.id, data: plan.to as unknown as Record<string, unknown> },
      { type: "update", collection: "rooms", id: toRoom!.id, data: { activeLeaseId: plan.to.id } },
    ];
    // ห้องเดิมอาจถูกผูกสัญญาอื่นไปแล้ว ล้างเฉพาะตอนที่ยังชี้มาที่สัญญานี้จริงๆ
    if (fromRoom.activeLeaseId === lease.id) {
      ops.push({ type: "update", collection: "rooms", id: fromRoom.id, data: { activeLeaseId: null } });
    }

    await db().batch(ops);
    await audit(user, {
      propertyId,
      action: "lease.transfer",
      targetType: "lease",
      targetId: lease.id,
      before: { roomId: fromRoom.id, roomNo: fromRoom.roomNo, deposit: lease.deposit },
      after: {
        leaseId: plan.to.id,
        roomNo: toRoom!.roomNo,
        rent: plan.to.rent,
        carriedDeposit: plan.carriedDeposit,
        depositShortfall: plan.depositShortfall,
      },
    });

    return {
      ok: true,
      leaseId: plan.to.id,
      roomId: toRoom!.id,
      roomNo: toRoom!.roomNo,
      carriedDeposit: plan.carriedDeposit,
      depositShortfall: plan.depositShortfall,
    };
  });
}
