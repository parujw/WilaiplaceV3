import { notFound } from "next/navigation";
import { BILL_STATUS_LABEL, baht, cycleLabel, thaiDate } from "@/lib/format";
import { invoicePrintPath, verifyInvoiceToken } from "@/lib/invoice-link";
import { getBill, getProperty, paymentsOfBill } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * ใบแจ้งหนี้สำหรับผู้เช่า — เปิดจากลิงก์ในไลน์ได้โดยไม่ต้องล็อกอิน
 * ต้องมีโทเคนใน URL ถึงจะเปิดได้ ไม่งั้นไล่เลขบิลอ่านของคนอื่นได้หมด
 * ต้องอ่านง่ายบนมือถือจริงๆ V2 เคยพังเพราะ layout กว้างคงที่
 */
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ billId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ billId }, { t }] = await Promise.all([params, searchParams]);
  const id = decodeURIComponent(billId);

  // ตอบ 404 เหมือนกันทั้งกรณีโทเคนผิดและกรณีไม่มีบิล จะได้ไม่บอกว่าเลขบิลไหนมีอยู่จริง
  if (!verifyInvoiceToken(id, t)) notFound();

  const bill = await getBill(id);
  if (!bill || bill.status === "void") notFound();

  const [property, payments] = await Promise.all([getProperty(bill.propertyId), paymentsOfBill(bill.id)]);
  if (!property) notFound();

  return (
    <main className="mx-auto w-full max-w-[32rem] px-4 py-8">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-br from-accent to-accent-strong px-6 py-7 text-white">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/75">Wilai Communities</p>
          <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-tight">{property.name}</h1>
          <p className="mt-0.5 text-[13px] text-white/85">{[property.address, `โทร ${property.phone}`].filter(Boolean).join(" · ")}</p>

          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[12px] text-white/75">ใบแจ้งหนี้เลขที่</p>
              <p className="text-[15px] font-bold">{bill.invoiceNo}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-white/75">รอบบิล</p>
              <p className="text-[15px] font-bold">{cycleLabel(bill.cycle, "full")}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-line px-6 py-5 text-[13px]">
          <div>
            <p className="text-muted">ห้อง</p>
            <p className="text-[16px] font-bold">{bill.roomNo}</p>
          </div>
          <div>
            <p className="text-muted">ผู้เช่า</p>
            <p className="font-semibold">{bill.tenantSnapshot.name}</p>
          </div>
          <div>
            <p className="text-muted">วันที่ออกบิล</p>
            <p className="font-semibold">{thaiDate(bill.issuedAt, "full")}</p>
          </div>
          <div>
            <p className="text-muted">ครบกำหนดชำระ</p>
            <p className="font-semibold text-accent-strong">{thaiDate(bill.dueDate, "full")}</p>
          </div>
        </div>

        <div className="px-6 py-5">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-muted">
                <th className="pb-2 font-medium">รายการ</th>
                <th className="pb-2 text-right font-medium">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((line, i) => (
                <tr key={`${line.type}-${i}`} className="border-b border-line/70 last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{line.label}</span>
                    {line.qty !== 1 ? (
                      <span className="block text-[12px] text-muted">{line.qty} หน่วย × {line.rate} บาท</span>
                    ) : null}
                  </td>
                  <td className={`py-2.5 text-right font-semibold tabular-nums ${line.amount < 0 ? "text-ok" : ""}`}>
                    {baht(line.amount, { decimals: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-2 rounded-2xl bg-surface-2 px-4 py-4 text-[14px]">
            <div className="flex justify-between">
              <span className="text-muted">ยอดรวม</span>
              <span className="font-bold tabular-nums">{baht(bill.total, { decimals: true })} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">ชำระแล้ว</span>
              <span className="font-semibold tabular-nums text-ok">{baht(bill.paid, { decimals: true })} บาท</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <span className="font-bold">ยอดที่ต้องชำระ</span>
              <span className={`text-[18px] font-bold tabular-nums ${bill.balance > 0 ? "text-accent-strong" : "text-ok"}`}>
                {baht(bill.balance, { decimals: true })} บาท
              </span>
            </div>
          </div>

          <p className="mt-4 text-center text-[13px] font-semibold">
            สถานะ: {BILL_STATUS_LABEL[bill.status]}
          </p>

          {payments.length > 0 ? (
            <div className="mt-5">
              <p className="mb-2 text-[12px] font-semibold text-muted">ประวัติการชำระ</p>
              <ul className="space-y-1.5 text-[13px]">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span className="text-muted">{thaiDate(p.paidAt)} · {p.receiptNo}</span>
                    <span className="font-semibold tabular-nums">{baht(p.amount)} บาท</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {bill.note ? <p className="mt-5 text-[12px] text-muted">หมายเหตุ: {bill.note}</p> : null}
        </div>
      </div>

      <p className="no-print mt-5 text-center">
        <a
          href={invoicePrintPath(bill.id)}
          className="inline-block rounded-full bg-accent px-6 py-3 text-[14px] font-bold text-white"
        >
          พิมพ์ใบแจ้งหนี้ (A4)
        </a>
      </p>

      <p className="mt-5 text-center text-[12px] leading-relaxed text-muted">
        สอบถามเพิ่มเติมโทร {property.phone}
        <br />
        เอกสารนี้ออกโดยระบบ Wilai Communities
      </p>
    </main>
  );
}
