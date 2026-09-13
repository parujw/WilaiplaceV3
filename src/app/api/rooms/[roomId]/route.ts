import { before, handle, readJson, requireEditor, requireSameProperty } from "@/lib/api";
import { db } from "@/lib/db";
import { roomEditPatch, type RoomEditInput } from "@/lib/lease-ops";
import { audit, getRoom } from "@/lib/repo";

/** แก้รายละเอียดห้อง — ไม่แตะว่าใครอยู่ห้องนี้ (ดู /api/leases) */
export async function PATCH(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("แก้ข้อมูลห้อง");
    const { roomId } = await params;

    const room = requireSameProperty(await getRoom(decodeURIComponent(roomId)), propertyId, "ไม่พบห้องนี้");
    const patch = roomEditPatch(await readJson<RoomEditInput>(request));

    await db().update("rooms", room.id, patch);
    await audit(user, {
      propertyId,
      action: "room.update",
      targetType: "room",
      targetId: room.id,
      before: before(room, patch),
      after: patch,
    });

    return { ok: true };
  });
}
