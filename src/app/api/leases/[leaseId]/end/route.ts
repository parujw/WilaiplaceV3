import { ApiError, handle, readJson, requireEditor, requireSameProperty } from "@/lib/api";
import { db } from "@/lib/db";
import { moveOutPatch, type MoveOutInput } from "@/lib/lease-ops";
import { audit, getLease, getRoom, listBills } from "@/lib/repo";
import type { WriteOp } from "@/lib/db/store";

interface MoveOutBody extends MoveOutInput {
  /** ยอมรับว่ายังมีบิลค้างแล้วปิดสัญญาต่อ */
  ignoreOutstanding?: boolean;
}

/**
 * ผู้เช่าย้ายออก — ปิดสัญญาและปล่อยห้องให้ว่าง
 *
 * เขียนสองที่พร้อมกัน (สัญญา + activeLeaseId ของห้อง) ไม่งั้นห้องจะชี้ไปสัญญาที่จบแล้ว
 * ทำให้ห้องไม่ขึ้นเป็นห้องว่าง และออกบิลรอบหน้าให้คนที่ย้ายออกไปแล้ว
 *
 * บิลที่ยังค้างไม่ถูกยกเลิกให้อัตโนมัติ — หนี้ยังเป็นหนี้ แค่เตือนแล้วให้ยืนยัน
 */
export async function POST(request: Request, { params }: { params: Promise<{ leaseId: string }> }) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("ปิดสัญญาเช่า");
    const { leaseId } = await params;

    const lease = requireSameProperty(await getLease(decodeURIComponent(leaseId)), propertyId, "ไม่พบสัญญานี้");
    const body = await readJson<MoveOutBody>(request);

    const bills = await listBills(propertyId, { roomId: lease.roomId });
    const outstanding = bills
      .filter((b) => b.leaseId === lease.id && b.status !== "void")
      .reduce((sum, b) => sum + b.balance, 0);

    if (outstanding > 0 && !body.ignoreOutstanding) {
      throw new ApiError(
        `ห้องนี้ยังค้างชำระ ${outstanding.toLocaleString("th-TH")} บาท ` +
          "ถ้าจะปิดสัญญาทั้งที่ยังค้าง ให้ยืนยันอีกครั้ง หรือไปเก็บเงิน/ยกเลิกบิลก่อน",
        409,
      );
    }

    const patch = moveOutPatch(lease, body);
    const room = await getRoom(lease.roomId);

    const ops: WriteOp[] = [{ type: "update", collection: "leases", id: lease.id, data: patch }];
    // ห้องอาจถูกย้ายไปผูกสัญญาอื่นแล้ว ล้างเฉพาะตอนที่ยังชี้มาที่สัญญานี้จริงๆ
    if (room?.activeLeaseId === lease.id) {
      ops.push({ type: "update", collection: "rooms", id: room.id, data: { activeLeaseId: null } });
    }

    await db().batch(ops);
    await audit(user, {
      propertyId,
      action: "lease.end",
      targetType: "lease",
      targetId: lease.id,
      before: { status: lease.status, endDate: lease.endDate },
      after: { ...patch, outstandingAtMoveOut: outstanding },
    });

    return { ok: true, outstanding };
  });
}
