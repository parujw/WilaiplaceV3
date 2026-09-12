import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconBack, IconWallet } from "@/components/icons";
import { Badge, EmptyState, RowLink, SectionHeader } from "@/components/ui";
import { METHOD_LABEL, baht, cycleLabel, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { agingReport, listPayments } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const { property } = await requireContext();
  const [payments, aging] = await Promise.all([listPayments(property.id, 40), agingReport(property.id)]);

  const byMonth = new Map<string, number>();
  for (const p of payments) {
    if (!p.paidAt) continue;
    const cycle = p.paidAt.slice(0, 4) + p.paidAt.slice(5, 7);
    byMonth.set(cycle, (byMonth.get(cycle) ?? 0) + p.amount);
  }

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <Link href="/" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <div className="flex-1">
          <h1 className="text-[20px] font-bold leading-tight tracking-tight">รับชำระ</h1>
          <p className="text-[13px] text-muted">{payments.length} ใบเสร็จล่าสุด</p>
        </div>
      </header>

      <section className="px-4">
        <SectionHeader title="รอเก็บ" action={`${aging.bills.length} บิล`} />
        {aging.bills.length === 0 ? (
          <EmptyState title="เก็บครบทุกบิลแล้ว" detail="ไม่มียอดค้างในระบบ" />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {aging.bills.slice(0, 12).map((bill) => (
              <RowLink
                key={bill.id}
                href={`/bills/${bill.id}`}
                leading={
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[14px] font-bold">
                    {bill.roomNo}
                  </span>
                }
                title={`${baht(bill.balance)} ฿ · ${bill.tenantSnapshot.name}`}
                detail={`${cycleLabel(bill.cycle)} · ครบกำหนด ${thaiDate(bill.dueDate)}`}
                right={<Badge tone="danger">ค้าง</Badge>}
              />
            ))}
          </div>
        )}
      </section>

      {byMonth.size > 0 ? (
        <section className="px-4 pt-6">
          <SectionHeader title="เงินสดรับรายเดือน" action="ตามวันที่ชำระจริง" />
          <div className="card divide-y divide-line overflow-hidden">
            {[...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([cycle, amount]) => (
              <div key={cycle} className="flex items-center justify-between px-4 py-3">
                <span className="text-[14px] font-semibold">{cycleLabel(cycle, "full")}</span>
                <span className="text-[15px] font-bold">{baht(amount)} ฿</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="px-4 pt-6">
        <SectionHeader title="ใบเสร็จล่าสุด" />
        {payments.length === 0 ? (
          <EmptyState title="ยังไม่มีใบเสร็จ" />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {payments.map((p) => (
              <RowLink
                key={p.id}
                href={p.billId ? `/bills/${p.billId}` : `/rooms/${p.roomId}`}
                leading={
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok/12 text-ok">
                    <IconWallet />
                  </span>
                }
                title={`ห้อง ${p.roomNo} · ${baht(p.amount)} ฿`}
                detail={`${p.receiptNo} · ${thaiDate(p.paidAt)} · ${METHOD_LABEL[p.method]}`}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
