import { before, handle, readJson, requireEditor, requireSameProperty } from "@/lib/api";
import { db } from "@/lib/db";
import { tenantEditPatch, type TenantEditInput } from "@/lib/lease-ops";
import { audit, getTenant } from "@/lib/repo";

/**
 * แก้ข้อมูลส่วนตัวผู้เช่า
 * บิลเก่าไม่เปลี่ยนตาม เพราะเก็บชื่อ ณ วันออกไว้ใน tenantSnapshot แล้ว
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("แก้ข้อมูลผู้เช่า");
    const { tenantId } = await params;

    const tenant = requireSameProperty(await getTenant(decodeURIComponent(tenantId)), propertyId, "ไม่พบผู้เช่ารายนี้");
    const patch = tenantEditPatch(await readJson<TenantEditInput>(request));

    await db().update("tenants", tenant.id, patch);
    await audit(user, {
      propertyId,
      action: "tenant.update",
      targetType: "tenant",
      targetId: tenant.id,
      before: before(tenant, patch),
      after: patch,
    });

    return { ok: true };
  });
}
