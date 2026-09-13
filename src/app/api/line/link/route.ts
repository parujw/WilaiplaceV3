import { ApiError, before, handle, readJson, requireEditor, requireSameProperty } from "@/lib/api";
import { db } from "@/lib/db";
import { expiryFrom, newCode, type LineLink } from "@/lib/line-link";
import { audit, getTenant } from "@/lib/repo";

/**
 * ออกรหัสผูกบัญชีไลน์ให้ผู้เช่ารายหนึ่ง
 * ผู้จัดการส่งรหัสนี้ให้เขาทางที่คุยกันอยู่แล้ว แล้วเขาเอาไปทักบอท
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("ออกรหัสผูกไลน์");
    const { tenantId } = await readJson<{ tenantId?: string }>(request);
    if (!tenantId) throw new ApiError("ไม่ได้ระบุผู้เช่า");

    const tenant = requireSameProperty(await getTenant(tenantId), propertyId, "ไม่พบผู้เช่ารายนี้");

    // ออกรหัสใหม่ทับของเดิมที่ยังไม่ได้ใช้ ผู้เช่าจะได้ไม่งงว่ามีสองรหัสใช้อันไหน
    const stale = await db().list<LineLink>("lineLinks", {
      where: [{ field: "tenantId", op: "==", value: tenant.id }],
    });
    const now = new Date();
    const code = newCode();

    const link: LineLink = {
      code,
      propertyId,
      tenantId: tenant.id,
      createdAt: now.toISOString(),
      expiresAt: expiryFrom(now),
    };

    await db().batch([
      ...stale
        .filter((l) => !l.usedAt)
        .map((l) => ({ type: "delete" as const, collection: "lineLinks" as const, id: l.code })),
      { type: "set", collection: "lineLinks", id: code, data: link as unknown as Record<string, unknown> },
    ]);

    await audit(user, {
      propertyId,
      action: "line.link-code",
      targetType: "tenant",
      targetId: tenant.id,
      before: { replacedCodes: stale.filter((l) => !l.usedAt).length },
      after: { expiresAt: link.expiresAt },
    });

    return { ok: true, code, expiresAt: link.expiresAt };
  });
}

/** ยกเลิกการผูก — ผู้เช่าเปลี่ยนเบอร์ เปลี่ยนบัญชีไลน์ หรือย้ายออก */
export async function DELETE(request: Request) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("ยกเลิกการผูกไลน์");
    const { tenantId } = await readJson<{ tenantId?: string }>(request);
    if (!tenantId) throw new ApiError("ไม่ได้ระบุผู้เช่า");

    const tenant = requireSameProperty(await getTenant(tenantId), propertyId, "ไม่พบผู้เช่ารายนี้");
    const patch = { lineUserId: null };

    await db().update("tenants", tenant.id, patch);
    await audit(user, {
      propertyId,
      action: "line.unlink",
      targetType: "tenant",
      targetId: tenant.id,
      before: before(tenant, patch),
      after: patch,
    });

    return { ok: true };
  });
}
