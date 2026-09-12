import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, getBill, paymentsOfBill } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";

/**
 * ยกเลิกบิล — ไม่ลบ เพราะเลขรันต้องไม่ขาดช่วง
 */
export async function POST(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role !== "owner" && user.role !== "manager") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ยกเลิกบิล" }, { status: 403 });
  }

  const { billId } = await params;
  const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };
  if (!reason?.trim()) return NextResponse.json({ error: "ต้องระบุเหตุผลที่ยกเลิก" }, { status: 400 });

  const bill = await getBill(billId);
  if (!bill) return NextResponse.json({ error: "ไม่พบบิล" }, { status: 404 });
  if (bill.status === "void") return NextResponse.json({ error: "บิลนี้ยกเลิกไปแล้ว" }, { status: 409 });

  const payments = await paymentsOfBill(billId);
  if (payments.length > 0) {
    return NextResponse.json(
      { error: "บิลนี้มีการรับชำระแล้ว ต้องคืนเงินและลบใบเสร็จก่อนจึงจะยกเลิกได้" },
      { status: 409 },
    );
  }

  await db().update("bills", billId, { status: "void", balance: 0, voidReason: reason.trim() });
  await audit(user, {
    propertyId: bill.propertyId,
    action: "bill.void",
    targetType: "bill",
    targetId: billId,
    before: { status: bill.status, balance: bill.balance },
    after: { status: "void", balance: 0, voidReason: reason.trim() },
  });

  return NextResponse.json({ ok: true });
}
