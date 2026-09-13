import { ApiError, handle, requireEditor, requireSameProperty } from "@/lib/api";
import { db } from "@/lib/db";
import { baht, cycleLabel, thaiDate } from "@/lib/format";
import { isLineConfigured, missingLineEnv, push, text } from "@/lib/line";
import { renderInvoice } from "@/lib/render-invoice";
import { audit, getBill, getProperty, getTenant } from "@/lib/repo";
import { uploadPublic } from "@/lib/storage";

/** ต้องวาดใบแจ้งหนี้ด้วย Chrome ก่อน ค่าเริ่มต้น 10 วินาทีไม่พอ */
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * ส่งใบแจ้งหนี้เข้าไลน์ของผู้เช่า
 *
 * ส่งเป็นรูป ไม่ใช่ไฟล์ PDF เพราะ Messaging API ไม่มีชนิดข้อความสำหรับไฟล์เอกสาร
 * และรูปก็ดีกว่าอยู่แล้ว — ผู้เช่าเปิดแชตมาเห็นบิลเต็มใบทันที
 * ไม่ต้องกดเปิด ไม่ต้องมีแอปอ่าน PDF
 *
 * วาดรูปจากหน้าพิมพ์ตัวเดิม ใบที่ผู้เช่าได้จึงเหมือนใบที่เจ้าของพิมพ์ทุกจุด
 */
export async function POST(_request: Request, { params }: { params: Promise<{ billId: string }> }) {
  return handle(async () => {
    const { propertyId, user } = await requireEditor("ส่งบิลเข้าไลน์");

    if (!isLineConfigured()) {
      throw new ApiError(
        `ยังไม่ได้ตั้งค่าไลน์ — ขาด ${missingLineEnv().join(", ")} ตั้งใน Vercel แล้ว redeploy ก่อน`,
        503,
      );
    }

    const { billId } = await params;
    const bill = requireSameProperty(await getBill(decodeURIComponent(billId)), propertyId, "ไม่พบบิลนี้");
    if (bill.status === "void") throw new ApiError("บิลนี้ถูกยกเลิกแล้ว ส่งไม่ได้", 409);

    const tenantId = bill.tenantSnapshot.tenantId;
    const tenant = tenantId ? await getTenant(tenantId) : null;
    if (!tenant?.lineUserId) {
      throw new ApiError(
        `${bill.tenantSnapshot.name} ยังไม่ได้ผูกบัญชีไลน์ — ออกรหัสผูกบัญชีจากหน้าผู้เช่าก่อน`,
        409,
      );
    }

    const property = await getProperty(propertyId);

    const image = await renderInvoice(bill.id, "png");
    // ใส่เวลาไว้ในชื่อไฟล์ แก้บิลแล้วส่งใหม่จะได้ไม่โดนแคชของ LINE ทับ
    const url = await uploadPublic(
      `invoices/${bill.id}-${Date.now()}.png`,
      image,
      "image/png",
    );

    await push(tenant.lineUserId, [
      text(
        [
          `ใบแจ้งหนี้ห้อง ${bill.roomNo} รอบ${cycleLabel(bill.cycle, "full")}`,
          `ยอดชำระ ${baht(bill.balance > 0 ? bill.balance : bill.total)} บาท`,
          `กรุณาชำระภายในวันที่ ${thaiDate(bill.dueDate)}`,
          "",
          "โอนแล้วส่งสลิปกลับมาที่แชตนี้ได้เลยค่ะ",
        ].join("\n"),
      ),
      { type: "image", originalContentUrl: url, previewImageUrl: url },
    ]);

    const sentToLineAt = new Date().toISOString();
    await db().update("bills", bill.id, { sentToLineAt });
    await audit(user, {
      propertyId,
      action: "bill.send-line",
      targetType: "bill",
      targetId: bill.id,
      before: { sentToLineAt: bill.sentToLineAt },
      after: { sentToLineAt, to: tenant.id, property: property?.name },
    });

    return { ok: true, sentToLineAt, tenantName: tenant.name };
  });
}
