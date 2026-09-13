import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CollectionChart } from "@/components/CollectionChart";
import { IconBell, IconBuilding, IconChevron, IconDoor, IconGauge, IconReceipt, IconWallet, IconWrench } from "@/components/icons";
import { Avatar, Badge, EmptyState, RowLink, SectionHeader, StatCard } from "@/components/ui";
import { baht, compactBaht, cycleLabel, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { agingReport, collectionByCycle, currentCycle, getAlerts, getSummary, recentActivity } from "@/lib/repo";
import { badgeCount } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const QUICK = [
  { href: "/meter", label: "จดมิเตอร์", Icon: IconGauge },
  { href: "/bills", label: "บิล", Icon: IconReceipt },
  { href: "/payments", label: "รับชำระ", Icon: IconWallet },
  { href: "/maintenance", label: "แจ้งซ่อม", Icon: IconWrench },
];

export default async function HomePage() {
  const { user, property, properties } = await requireContext();
  const cycle = currentCycle();

  const [summary, chart, activity, aging, alerts] = await Promise.all([
    getSummary(property.id, cycle),
    collectionByCycle(property.id, 6),
    recentActivity(property.id, 6),
    agingReport(property.id),
    getAlerts(property.id),
  ]);

  const urgent = badgeCount(alerts);

  const overdue = aging.buckets["1-30"] + aging.buckets["31-60"] + aging.buckets["60+"];

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <Link href="/settings" aria-label="ตั้งค่า">
          <Avatar name={user.name} photoUrl={user.photoUrl} size={46} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-bold leading-tight tracking-tight">{user.name}</p>
          {/* เดิมคำว่า "เปลี่ยน" ขึ้นเฉพาะตอนมีหลายอาคาร พอมีอาคารเดียวเลยดูเหมือนข้อความเฉยๆ
              ไม่มีใครรู้ว่ากดได้ ทั้งที่เป็นทางเดียวที่จะกลับไปหน้าเลือกอาคาร */}
          <Link href="/select" className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
            <IconBuilding className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{property.name}</span>
            <span className="shrink-0 font-semibold text-accent">· เปลี่ยน</span>
            <IconChevron className="h-3.5 w-3.5 shrink-0 text-accent" />
          </Link>
        </div>
        {/* กระดิ่งเดิมพาไปหน้าแจ้งซ่อมอย่างเดียว ทั้งที่เรื่องที่ต้องรู้มีมากกว่านั้น
            ตอนนี้รวมทุกเรื่องที่ต้องทำอะไรสักอย่างไว้ที่ /alerts
            ตัวเลขนับเฉพาะเรื่องที่ต้องรีบ ไม่งั้นจะบวมจนไม่มีความหมาย */}
        <Link
          href="/alerts"
          aria-label={urgent > 0 ? `ที่ต้องจัดการ ${urgent} เรื่อง` : "ที่ต้องจัดการ"}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface shadow-[0_1px_2px_rgb(23_23_27/0.06)]"
        >
          <IconBell />
          {urgent > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-none text-white ring-2 ring-bg">
              {urgent > 9 ? "9+" : urgent}
            </span>
          ) : null}
        </Link>
      </header>

      <section className="px-4">
        <SectionHeader title="สรุปภาพรวม" action={cycleLabel(cycle, "full")} />
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<IconBuilding />}
            label="อาคารทั้งหมด"
            value={String(properties.length).padStart(2, "0")}
            sub="ในเครือวิไล"
            href="/select"
          />
          <StatCard
            icon={<IconDoor />}
            label="ห้องที่มีผู้เช่า"
            value={
              <>
                {summary.occupied}
                <span className="text-muted">/{summary.rooms}</span>
              </>
            }
            sub={`ว่าง ${summary.rooms - summary.occupied} ห้อง`}
            href="/property"
          />
          <StatCard
            icon={<IconWallet />}
            label="เก็บค่าเช่าแล้ว"
            value={
              <>
                {summary.billsPaid}
                <span className="text-muted">/{summary.billsIssued}</span>
              </>
            }
            sub={`${baht(summary.collected)} / ${baht(summary.billed)} ฿`}
            href="/bills"
          />
          <StatCard
            icon={<IconWrench />}
            label="งานแจ้งซ่อม"
            value={String(summary.openMaintenance).padStart(2, "0")}
            sub="ที่ยังไม่ปิดงาน"
            href="/maintenance"
          />
        </div>
      </section>

      <section className="px-4 pt-4">
        <div className="card grid grid-cols-4 gap-1 p-2">
          {QUICK.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 active:bg-surface-2">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent-strong">
                <Icon />
              </span>
              <span className="text-[11px] font-semibold text-ink-2">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-4 pt-6">
        <div className="card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-bold tracking-tight">อัตราเก็บค่าเช่า</h2>
            <span className="rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-ink-2">ราย 6 เดือน</span>
          </div>
          <CollectionChart data={chart} />
        </div>
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="ยอดค้างชำระ" action="ดูบิลค้าง" href="/bills?status=unpaid" />
        <div className="card p-4">
          <p className="text-[28px] font-bold leading-none tracking-tight">
            {baht(summary.outstanding)} <span className="text-[15px] font-semibold text-muted">บาท</span>
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {aging.bills.length} บิลที่ยังไม่ปิด · เกินกำหนด {baht(overdue)} บาท
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {(
              [
                ["ยังไม่ครบกำหนด", aging.buckets.current, "neutral"],
                ["1–30 วัน", aging.buckets["1-30"], "warn"],
                ["31–60 วัน", aging.buckets["31-60"], "warn"],
                ["เกิน 60 วัน", aging.buckets["60+"], "danger"],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="rounded-xl bg-surface-2 px-1.5 py-2.5">
                <p className={`text-[15px] font-bold ${value > 0 && tone === "danger" ? "text-danger" : ""}`}>
                  {compactBaht(value)}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-muted">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="ความเคลื่อนไหวล่าสุด" action="ดูทั้งหมด" href="/bills" />
        {activity.length === 0 ? (
          <EmptyState title="ยังไม่มีความเคลื่อนไหว" detail="เริ่มจากจดมิเตอร์แล้วออกบิลรอบนี้" />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {activity.map((item) => (
              <RowLink
                key={`${item.kind}-${item.id}`}
                href={item.href}
                leading={
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                      item.kind === "payment" ? "bg-ok/12 text-ok" : item.kind === "bill" ? "bg-accent-soft text-accent-strong" : "bg-warn/15 text-[#96690f]"
                    }`}
                  >
                    {item.kind === "payment" ? <IconWallet /> : item.kind === "bill" ? <IconReceipt /> : <IconWrench />}
                  </span>
                }
                title={item.title}
                detail={`${item.detail} · ${thaiDate(item.at)}`}
                right={
                  item.amount != null ? (
                    <span className="shrink-0 text-[14px] font-bold">{baht(item.amount)} ฿</span>
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </section>

      {user.demo ? (
        <div className="px-4 pt-6">
          <Link href="/settings" className="block">
            <Badge tone="warn">โหมดสาธิต — ข้อมูล V2 อยู่ในไฟล์บนเครื่องนี้ ยังไม่ได้ต่อ Firebase</Badge>
          </Link>
        </div>
      ) : null}
    </AppShell>
  );
}
