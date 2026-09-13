import { ApiError, handle, readJson, requireEditor, requireOwner, requireSameProperty } from "@/lib/api";
import { billEditPatch, type LineInput } from "@/lib/bill-edit";
import { db } from "@/lib/db";
import { audit, getBill, paymentsOfBill } from "@/lib/repo";

/**
 * แก้บิลที่ออกไปแล้ว — สำหรับกรณีตัวเลขผิด เช่น จดมิเตอร์ผิดหรือลืมใส่ส่วนลด
 *
 * เลขที่บิลกับเลขที่ใบแจ้งหนี้คงเดิม เพราะใบเดิมอาจส่งให้ผู้เช่าไปแล้ว
 * ออกใบใหม่เลขใหม่จะยิ่งงงว่าต้องจ่ายใบไหน
 * สิ่งที่เปลี่ยนคือรายการกับยอด แล้วให้พิมพ์ใบแจ้งหนี้ใหม่ทับใบเดิม
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("แก้บิล");
    const { billId } = await params;

    const bill = requireSameProperty(await getBill(decodeURIComponent(billId)), propertyId, "ไม่พบบิลนี้");
    const body = await readJson<{ lines: LineInput[]; dueDate?: string; note?: string }>(request);
    const patch = billEditPatch(bill, body);

    await db().update("bills", bill.id, patch);
    await audit(user, {
      propertyId,
      action: "bill.update",
      targetType: "bill",
      targetId: bill.id,
      before: { lines: bill.lines, total: bill.total, balance: bill.balance, status: bill.status },
      after: patch,
    });

    return { ok: true, total: patch.total, balance: patch.balance, status: patch.status };
  });
}

/**
 * ลบบิลที่ไม่ควรมีอยู่ตั้งแต่แรก — ออกซ้ำ ออกให้ห้องว่าง ออกผิดคน
 *
 * ปกติบิลผิดควร "ยกเลิก" (ดู void/route.ts) เพราะประวัติต้องเล่าได้ว่าเคยออกอะไรไป
 * แต่บิลที่ไม่ควรมีตั้งแต่แรกไม่ใช่ประวัติ เป็นขยะที่ค้างอยู่ในรายการให้สับสน
 * จึงให้ลบได้จริง แต่จำกัดไว้:
 *   - เจ้าของเท่านั้น
 *   - ต้องไม่มีใบเสร็จผูกอยู่ (ลบใบเสร็จก่อน ถ้ารับเงินผิดใบ)
 *   - บันทึกสำเนาบิลทั้งใบลง auditLogs ก่อนลบ ตามคืนได้ถ้าลบพลาด
 *
 * เลขรันจะขาดช่วง ยอมรับได้เพราะ auditLogs บอกว่าเลขนั้นหายไปไหน
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  return handle(async () => {
    const { propertyId, user } = await requireOwner("ลบบิล");
    const { billId } = await params;

    const bill = requireSameProperty(await getBill(decodeURIComponent(billId)), propertyId, "ไม่พบบิลนี้");
    const payments = await paymentsOfBill(bill.id);
    if (payments.length > 0) {
      throw new ApiError(
        `บิลนี้มีใบเสร็จผูกอยู่ ${payments.length} ใบ (${payments.map((p) => p.receiptNo).join(", ")}) ` +
          "ต้องลบใบเสร็จก่อนจึงจะลบบิลได้",
        409,
      );
    }

    const { reason } = await readJson<{ reason?: string }>(request).catch(() => ({ reason: undefined }));

    // เก็บสำเนาไว้ก่อนลบเสมอ ลบพลาดแล้วยังตามคืนได้จาก auditLogs
    await audit(user, {
      propertyId,
      action: "bill.delete",
      targetType: "bill",
      targetId: bill.id,
      before: bill,
      after: { deleted: true, reason: reason?.trim() ?? "" },
    });
    await db().remove("bills", bill.id);

    return { ok: true };
  });
}
