import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, getBill, nextReceiptNo } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import type { Bill, Payment, PaymentMethod } from "@/lib/types";

const METHODS: PaymentMethod[] = ["cash", "transfer", "promptpay", "other"];

/** บันทึกรับชำระ แล้วอัปเดตยอดในบิลให้ตรงกัน — เขียนสองที่ต้องไปด้วยกัน */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ยังไม่ได้ล็อกอิน" }, { status: 401 });
  if (user.role === "viewer") return NextResponse.json({ error: "ไม่มีสิทธิ์บันทึกการชำระ" }, { status: 403 });

  const body = (await request.json()) as {
    billId?: string; amount?: number; method?: PaymentMethod; paidAt?: string; note?: string;
  };

  if (!body.billId) return NextResponse.json({ error: "ไม่ได้ระบุบิล" }, { status: 400 });
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "จำนวนเงินต้องมากกว่า 0" }, { status: 400 });
  }
  const method: PaymentMethod = METHODS.includes(body.method as PaymentMethod) ? body.method! : "transfer";

  const bill = await getBill(body.billId);
  if (!bill) return NextResponse.json({ error: "ไม่พบบิล" }, { status: 404 });
  if (bill.status === "void") return NextResponse.json({ error: "บิลนี้ถูกยกเลิกแล้ว" }, { status: 409 });
  if (amount > bill.balance) {
    return NextResponse.json(
      { error: `รับเกินยอดค้าง (ค้างอยู่ ${bill.balance.toLocaleString("th-TH")} บาท)` },
      { status: 400 },
    );
  }

  const paidAt = body.paidAt || new Date().toISOString().slice(0, 10);
  const receiptNo = await nextReceiptNo(bill.cycle);

  const payment: Payment = {
    id: receiptNo,
    propertyId: bill.propertyId,
    receiptNo,
    billId: bill.id,
    roomId: bill.roomId,
    roomNo: bill.roomNo,
    amount,
    method,
    paidAt,
    slip: null,
    note: body.note || undefined,
  };

  const paid = bill.paid + amount;
  const balance = bill.total - paid;
  const status: Bill["status"] = balance <= 0 ? "paid" : "partial";

  await db().batch([
    { type: "set", collection: "payments", id: payment.id, data: payment as unknown as Record<string, unknown> },
    { type: "update", collection: "bills", id: bill.id, data: { paid, balance, status } },
  ]);

  await audit(user, {
    propertyId: bill.propertyId,
    action: "payment.create",
    targetType: "bill",
    targetId: bill.id,
    before: { paid: bill.paid, balance: bill.balance, status: bill.status },
    after: { paid, balance, status, receiptNo },
  });

  return NextResponse.json({ ok: true, receiptNo });
}
