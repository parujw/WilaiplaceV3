import { notFound } from "next/navigation";
import { Sarabun } from "next/font/google";
import { FitToPage } from "./FitToPage";
import { PrintButton } from "./PrintButton";
import { BILL_STATUS_LABEL, baht, cycleLabel, thaiDate } from "@/lib/format";
import { verifyInvoiceToken } from "@/lib/invoice-link";
import { paymentFor } from "@/lib/payment-default";
import { getBill, getProperty, paymentsOfBill } from "@/lib/repo";
import type { Bill } from "@/lib/types";
import "./print.css";

export const dynamic = "force-dynamic";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

const STATUS_CLASS: Record<Bill["status"], string> = {
  paid: "pill-paid",
  partial: "pill-partial",
  unpaid: "pill-unpaid",
  void: "pill-void",
};

/** ใบแจ้งหนี้สำหรับพิมพ์ลงกระดาษ A4 — รูปแบบเดียวกับที่ใช้อยู่เดิม */
export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ billId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ billId }, { t }] = await Promise.all([params, searchParams]);
  const id = decodeURIComponent(billId);
  if (!verifyInvoiceToken(id, t)) notFound();

  const bill = await getBill(id);
  if (!bill) notFound();

  const [property, payments] = await Promise.all([getProperty(bill.propertyId), paymentsOfBill(bill.id)]);
  if (!property) notFound();

  const pay = paymentFor(property.payment);
  const paidAt = payments.map((p) => p.paidAt).filter(Boolean).sort().at(-1) ?? null;
  const reference = pay.reference.trim() || bill.billNo;

  return (
    <main className={`${sarabun.className} sheet`}>
      <FitToPage />
      <PrintButton />

      <header className="head">
        <div>
          <h1 className="brand">
            {property.nameEn ? `${property.nameEn} / ` : ""}
            {property.name}
          </h1>
          <p className="sub">
            {[property.address, property.phone ? `โทร ${property.phone}` : ""].filter(Boolean).join("  ·  ")}
          </p>
          <p className="doctype">ใบแจ้งหนี้ / INVOICE</p>
        </div>

        <div className="head-right">
          <p className="invno">{bill.invoiceNo}</p>
          <dl className="meta">
            <div>
              <dt>วันที่ออก</dt>
              <dd>{thaiDate(bill.issuedAt)}</dd>
            </div>
            <div>
              <dt>ค่าเช่าเดือน</dt>
              <dd>{cycleLabel(bill.cycle, "full")}</dd>
            </div>
            <div>
              <dt>ครบกำหนด</dt>
              <dd>{thaiDate(bill.dueDate)}</dd>
            </div>
          </dl>
          <p>
            <span className={`pill ${STATUS_CLASS[bill.status]}`}>{BILL_STATUS_LABEL[bill.status]}</span>
          </p>
        </div>
      </header>

      <div className="rule" />

      <section className="cards">
        <div className="card">
          <p className="card-title">ข้อมูลผู้เช่า</p>
          <div className="row">
            <span>ชื่อ-นามสกุล</span>
            <strong>{bill.tenantSnapshot.name}</strong>
          </div>
          <div className="row">
            <span>เลขที่ห้อง</span>
            <strong>ห้อง {bill.roomNo}</strong>
          </div>
          {bill.tenantSnapshot.phone ? (
            <div className="row">
              <span>โทรศัพท์</span>
              <strong>{bill.tenantSnapshot.phone}</strong>
            </div>
          ) : null}
        </div>

        <div className="card">
          <p className="card-title">สรุปการชำระ</p>
          <div className="row">
            <span>ยอดรวม</span>
            <strong>฿{baht(bill.total)}</strong>
          </div>
          <div className="row">
            <span>ชำระแล้ว</span>
            <strong className="ok">฿{baht(bill.paid)}</strong>
          </div>
          <div className="row">
            <span>คงค้าง</span>
            <strong className={bill.balance > 0 ? "due" : "ok"}>฿{baht(bill.balance)}</strong>
          </div>
          <div className="row">
            <span>วันชำระ</span>
            <strong>{paidAt ? thaiDate(paidAt) : "—"}</strong>
          </div>
        </div>
      </section>

      <table className="items">
        <thead>
          <tr>
            <th>รายการ</th>
            <th className="amount">จำนวน (฿)</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((line, i) => (
            <tr key={`${line.type}-${i}`}>
              <td>
                {line.label}
                {/* แถวค่าเช่าบอกเดือนต่อท้ายเหมือนใบเดิม: "ค่าเช่าห้อง — เดือนกันยายน 2569" */}
                {line.type === "rent" ? ` — เดือน${cycleLabel(bill.cycle, "full")}` : null}
                {line.qty !== 1 ? <span className="qty"> · {line.qty} หน่วย × {line.rate} บาท</span> : null}
              </td>
              <td className="amount">{baht(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grand">
        <span>ยอดรวมทั้งสิ้น</span>
        <strong>฿{baht(bill.total)}</strong>
      </div>

      <section className="pay">
        {pay.qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pay.qrUrl} alt="QR พร้อมเพย์" className="qr" />
        ) : null}
        <div className="pay-body">
          <p className="pay-title">ชำระผ่าน {pay.method || "โอนธนาคาร"}</p>
          {pay.accountName ? (
            <p>
              ชื่อบัญชี: <strong>{pay.accountName}</strong>
            </p>
          ) : null}
          {pay.accountNo ? <p>เลขบัญชี: {pay.accountNo}</p> : null}
          <p>เลขที่อ้างอิง: {reference}</p>
          {pay.note ? <p className="muted">{pay.note}</p> : null}
        </div>
      </section>

      <aside className="notice">
        <p>
          กรุณาชำระเงินภายในวันที่ <strong>{thaiDate(bill.dueDate)}</strong> และส่งหลักฐานการชำระเงินผ่าน LINE
        </p>
        <p>
          หากมีข้อสงสัย กรุณาติดต่อผู้จัดการ{property.name} ก่อนวันครบกำหนดชำระ
          {property.phone ? `  ·  โทร ${property.phone}` : ""}
        </p>
      </aside>

      <section className="signs">
        <div>
          <p className="line" />
          <p className="role">ผู้จัดทำ / Prepared by</p>
          <p className="who">{property.preparedBy || "ผู้จัดการ"}</p>
        </div>
        <div>
          <p className="line" />
          <p className="role">ผู้เช่ารับทราบ / Tenant</p>
          <p className="who">{bill.tenantSnapshot.name}</p>
        </div>
      </section>

      <footer className="foot">
        <span>
          {property.name} · {bill.billNo}
        </span>
        <span>ออกโดยระบบ Wilai Communities</span>
      </footer>
    </main>
  );
}
