import { before, handle, readJson, requireEditor, requireSameProperty } from "@/lib/api";
import { db } from "@/lib/db";
import { leaseTermsPatch, type LeaseTermsInput } from "@/lib/lease-ops";
import { audit, getLease } from "@/lib/repo";

/**
 * แก้เงื่อนไขของสัญญา — ค่าเช่า ค่าน้ำค่าไฟต่อหน่วย วันครบกำหนด ช่วงสัญญา
 *
 * มีผลกับบิลรอบถัดไปเท่านั้น บิลที่ออกไปแล้วเก็บตัวเลข ณ วันออกไว้ในตัวมันเอง
 * ออกบิลผิดเพราะค่าเช่าผิดต้องไปแก้ที่บิลใบนั้นด้วย (ดู /api/bills/[billId])
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ leaseId: string }> }) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("แก้สัญญาเช่า");
    const { leaseId } = await params;

    const lease = requireSameProperty(await getLease(decodeURIComponent(leaseId)), propertyId, "ไม่พบสัญญานี้");
    const patch = leaseTermsPatch(lease, await readJson<LeaseTermsInput>(request));

    await db().update("leases", lease.id, patch);
    await audit(user, {
      propertyId,
      action: "lease.update",
      targetType: "lease",
      targetId: lease.id,
      before: before(lease, patch),
      after: patch,
    });

    return { ok: true };
  });
}
