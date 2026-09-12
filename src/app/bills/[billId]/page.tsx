import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BillActions } from "@/components/BillActions";
import { IconBack } from "@/components/icons";
import { Badge, SectionHeader } from "@/components/ui";
import { BILL_STATUS_LABEL, METHOD_LABEL, baht, cycleLabel, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { invoicePath, invoicePrintPath } from "@/lib/invoice-link";
import { getBill, paymentsOfBill } from "@/lib/repo";

export const dynamic = "force-dynamic";

const STATUS_TONE = { paid: "ok", partial: "warn", unpaid: "danger", void: "neutral" } as const;

export default async function BillPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  const { property, user } = await requireContext();

  const bill = await getBill(decodeURIComponent(billId));
  if (!bill || bill.propertyId !== property.id) notFound();

  const payments = await paymentsOfBill(bill.id);
  const canVoid = (user.role === "owner" || user.role === "manager") && bill.status !== "void";

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <Link href="/bills" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] font-bold tracking-tight">{bill.billNo}</h1>
          <p className="text-[13px] text-muted">
            ห้อง {bill.roomNo} · รอบ {cycleLabel(bill.cycle, "full")}
          </p>
        </div>
        <Badge tone={STATUS_TONE[bill.status]}>{BILL_STATUS_LABEL[bill.status]}</Badge>
      </header>

      <section className="px-4">
        <div className="card p-5">
          <p className="text-[13px] text-muted">ยอดรวม</p>
          <p className="mt-0.5 text-[32px] font-bold leading-none tracking-tight">
            {baht(bill.total)} <span className="text-[16px] font-semibold text-muted">บาท</span>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 px-3.5 py-3">
              <p className="text-[11px] text-muted">ชำระแล้ว</p>
              <p className="text-[17px] font-bold text-ok">{baht(bill.paid)}</p>
            </div>
            <div className="rounded-xl bg-surface-2 px-3.5 py-3">
              <p className="text-[11px] text-muted">คงค้าง</p>
              <p className={`text-[17px] font-bold ${bill.balance > 0 ? "text-danger" : ""}`}>{baht(bill.balance)}</p>
            </div>
          </div>
          <div className="mt-4 space-y-1 text-[13px] text-muted">
            <p>ผู้เช่า: <span className="font-semibold text-ink">{bill.tenantSnapshot.name}</span></p>
            <p>ออกบิล {thaiDate(bill.issuedAt)} · ครบกำหนด {thaiDate(bill.dueDate)}</p>
            {bill.note ? <p>หมายเหตุ: {bill.note}</p> : null}
            {bill.voidReason ? <p className="text-danger">เหตุผลที่ยกเลิก: {bill.voidReason}</p> : null}
          </div>
        </div>
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="รายการในบิล" />
        <div className="card divide-y divide-line overflow-hidden">
          {bill.lines.map((line, i) => (
            <div key={`${line.type}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{line.label}</p>
                {line.qty !== 1 ? (
                  <p className="text-[12px] text-muted">{line.qty} × {line.rate} บาท</p>
                ) : null}
              </div>
              <p className={`shrink-0 text-[15px] font-bold ${line.amount < 0 ? "text-ok" : ""}`}>
                {baht(line.amount)}
              </p>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-3.5">
            <p className="text-[14px] font-bold">รวมทั้งสิ้น</p>
            <p className="text-[17px] font-bold">{baht(bill.total)} ฿</p>
          </div>
        </div>
      </section>

      {payments.length > 0 ? (
        <section className="px-4 pt-6">
          <SectionHeader title="ใบเสร็จที่ออกแล้ว" action={`${payments.length} ใบ`} />
          <div className="card divide-y divide-line overflow-hidden">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{p.receiptNo}</p>
                  <p className="text-[12px] text-muted">
                    {thaiDate(p.paidAt)} · {METHOD_LABEL[p.method]}
                  </p>
                </div>
                <p className="shrink-0 text-[15px] font-bold text-ok">{baht(p.amount)} ฿</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="px-4 pt-6">
        <BillActions
          billId={bill.id}
          balance={bill.status === "void" ? 0 : bill.balance}
          canVoid={canVoid && payments.length === 0}
          invoiceUrl={invoicePath(bill.id)}
          printUrl={invoicePrintPath(bill.id)}
        />
      </section>
    </AppShell>
  );
}
