import { ApiError, handle, readJson, requireEditor, requireSameProperty } from "@/lib/api";
import { recalcTotals } from "@/lib/bill-edit";
import { db } from "@/lib/db";
import { audit, getBill } from "@/lib/repo";
import type { WriteOp } from "@/lib/db/store";
import type { Payment } from "@/lib/types";

/**
 * ลบใบเสร็จที่บันทึกผิด — กรอกยอดเกิน ลงผิดใบ หรือกดซ้ำสองครั้ง
 *
 * ยอดในบิลต้องถอยกลับไปพร้อมกัน ไม่งั้นบิลจะขึ้นว่าชำระแล้วทั้งที่ไม่มีใบเสร็จ
 * คิดยอดใหม่จากรายการในบิลเสมอ ไม่ใช่เอา paid เดิมมาลบ
 * เพราะถ้ามีอะไรเพี้ยนอยู่ก่อนแล้ว การลบตรงๆ จะพาความเพี้ยนไปต่อ
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("ลบใบเสร็จ");
    const { paymentId } = await params;

    const payment = requireSameProperty(
      await db().get<Payment>("payments", decodeURIComponent(paymentId)),
      propertyId,
      "ไม่พบใบเสร็จนี้",
    );

    const { reason } = await readJson<{ reason?: string }>(request).catch(() => ({ reason: undefined }));
    const ops: WriteOp[] = [{ type: "delete", collection: "payments", id: payment.id }];

    let billAfter: Record<string, unknown> | null = null;
    if (payment.billId) {
      const bill = await getBill(payment.billId);
      if (!bill) throw new ApiError("ใบเสร็จนี้ผูกกับบิลที่ไม่มีอยู่แล้ว ลบไม่ได้ ให้ตรวจข้อมูลก่อน", 409);

      const remaining = Math.max(0, bill.paid - payment.amount);
      // บิลที่ยกเลิกไปแล้วยอดค้างต้องเป็น 0 ตลอด ไม่ให้เด้งกลับมาค้างเพราะลบใบเสร็จ
      billAfter =
        bill.status === "void"
          ? { paid: remaining }
          : { paid: remaining, ...recalcTotals(bill.lines, remaining) };
      ops.push({ type: "update", collection: "bills", id: bill.id, data: billAfter });
    }

    await db().batch(ops);
    await audit(user, {
      propertyId,
      action: "payment.delete",
      targetType: "payment",
      targetId: payment.id,
      before: payment,
      after: { deleted: true, reason: reason?.trim() ?? "", bill: billAfter },
    });

    return { ok: true };
  });
}
