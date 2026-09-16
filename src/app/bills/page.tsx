import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconReceipt } from "@/components/icons";
import { Badge, EmptyState, RowLink, SectionHeader } from "@/components/ui";
import { BILL_STATUS_LABEL, baht, cycleLabel, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { availableCycles, listBills } from "@/lib/repo";
import type { Bill } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_TONE = { paid: "ok", partial: "warn", unpaid: "danger", void: "neutral" } as const;
const STATUSES: Array<{ key: string; label: string }> = [
  { key: "", label: "ทั้งหมด" },
  { key: "unpaid", label: "ค้างชำระ" },
  { key: "partial", label: "บางส่วน" },
  { key: "paid", label: "ชำระแล้ว" },
  { key: "void", label: "ยกเลิก" },
];

function chip(active: boolean) {
  return `shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
    active ? "bg-accent text-white" : "bg-surface text-ink-2"
  }`;
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; status?: string }>;
}) {
  const { cycle = "", status = "" } = await searchParams;
  const { property } = await requireContext();

  const cycles = await availableCycles(property.id);
  const bills = await listBills(property.id, {
    cycle: cycle || undefined,
    status: (status || undefined) as Bill["status"] | undefined,
  });

  const totals = bills.reduce(
    (acc, b) => {
      if (b.status === "void") return acc;
      acc.total += b.total;
      acc.paid += b.paid;
      acc.balance += b.balance;
      return acc;
    },
    { total: 0, paid: 0, balance: 0 },
  );

  const href = (next: { cycle?: string; status?: string }) => {
    const params = new URLSearchParams();
    const c = next.cycle ?? cycle;
    const s = next.status ?? status;
    if (c) params.set("cycle", c);
    if (s) params.set("status", s);
    const qs = params.toString();
    return qs ? `/bills?${qs}` : "/bills";
  };

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-4 pt-8">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent-strong">
          <IconReceipt />
        </span>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">บิล</h1>
          <p className="text-[13px] text-muted">{bills.length} รายการ · {property.name}</p>
        </div>
        {/* ออกบิลใบเดียวแบบกรอกเอง — ค่าเช่าทั้งตึกอยู่ในหน้านั้นอีกที
            ของเดิมพาไปหน้าจดมิเตอร์ตรงๆ ทำให้ออกบิลมัดจำหรือค่าซ่อมไม่ได้เลย */}
        <Link href="/bills/new" className="rounded-full bg-accent px-4 py-2.5 text-[13px] font-bold text-white">
          ออกบิล
        </Link>
      </header>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
        <Link href={href({ cycle: "" })} className={chip(!cycle)}>ทุกรอบ</Link>
        {cycles.map((c) => (
          <Link key={c} href={href({ cycle: c })} className={chip(cycle === c)}>
            {cycleLabel(c)}
          </Link>
        ))}
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
        {STATUSES.map((s) => (
          <Link key={s.key} href={href({ status: s.key })} className={chip(status === s.key)}>
            {s.label}
          </Link>
        ))}
      </div>

      <section className="px-4">
        <div className="card grid grid-cols-3 divide-x divide-line">
          {(
            [
              ["ออกบิล", totals.total],
              ["เก็บได้", totals.paid],
              ["ค้าง", totals.balance],
            ] as const
          ).map(([label, value], i) => (
            <div key={label} className="px-3 py-3.5 text-center">
              <p className={`text-[17px] font-bold tracking-tight ${i === 2 && value > 0 ? "text-danger" : ""}`}>
                {baht(value)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{label} (บาท)</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pt-5">
        <SectionHeader title="รายการบิล" />
        {bills.length === 0 ? (
          <EmptyState title="ไม่มีบิลตามเงื่อนไขนี้" detail="ลองเปลี่ยนรอบบิลหรือสถานะ" />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {bills.map((bill) => (
              <RowLink
                key={bill.id}
                href={`/bills/${bill.id}`}
                leading={
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[14px] font-bold">
                    {bill.roomNo}
                  </span>
                }
                title={`${baht(bill.total)} ฿ · ${bill.tenantSnapshot.name}`}
                detail={`${bill.billNo} · ${cycleLabel(bill.cycle)} · ครบกำหนด ${thaiDate(bill.dueDate)}`}
                right={<Badge tone={STATUS_TONE[bill.status]}>{BILL_STATUS_LABEL[bill.status]}</Badge>}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
