import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconBack, IconBell } from "@/components/icons";
import { EmptyState, RowLink } from "@/components/ui";
import { requireContext } from "@/lib/guard";
import { getAlerts } from "@/lib/repo";
import type { AlertLevel } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const GROUPS: Array<{ level: AlertLevel; title: string; hint: string }> = [
  { level: "danger", title: "ต้องจัดการด่วน", hint: "ค้างนาน หรือเรื่องด่วน" },
  { level: "warn", title: "ควรทำสัปดาห์นี้", hint: "ยังไม่เลยจุดที่แก้ยาก" },
  { level: "info", title: "ไว้ดูตอนว่าง", hint: "ยังไม่เสียหาย แต่รู้ไว้ดีกว่า" },
];

const DOT: Record<AlertLevel, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  info: "bg-muted",
};

/** รวมทุกเรื่องที่ต้องทำอะไรสักอย่างไว้ที่เดียว — เข้ามาจากกระดิ่งมุมขวาบนของหน้าหลัก */
export default async function AlertsPage() {
  const { property } = await requireContext();
  const alerts = await getAlerts(property.id);

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <Link href="/" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">ที่ต้องจัดการ</h1>
          <p className="truncate text-[13px] text-muted">
            {alerts.length === 0 ? "ไม่มีอะไรค้าง" : `${alerts.length} เรื่อง`} · {property.name}
          </p>
        </div>
      </header>

      {alerts.length === 0 ? (
        <section className="px-4">
          <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-ok/12 text-ok">
              <IconBell className="h-7 w-7" />
            </span>
            <p className="mt-1 text-[17px] font-bold">เรียบร้อยทั้งหมด</p>
            <p className="text-[13px] leading-relaxed text-muted">
              ไม่มีบิลค้าง ไม่มีงานซ่อมค้าง และออกบิลรอบนี้ครบแล้ว
            </p>
          </div>
        </section>
      ) : null}

      {GROUPS.map(({ level, title, hint }) => {
        const group = alerts.filter((a) => a.level === level);
        if (group.length === 0) return null;
        return (
          <section key={level} className="px-4 pt-6 first:pt-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT[level]}`} />
                {title}
                <span className="text-[13px] font-semibold text-muted">{group.length}</span>
              </h2>
              <span className="text-[12px] text-muted">{hint}</span>
            </div>
            <div className="card divide-y divide-line overflow-hidden">
              {group.map((alert) => (
                <RowLink key={alert.id} href={alert.href} title={alert.title} detail={alert.detail} />
              ))}
            </div>
          </section>
        );
      })}

      {alerts.length > 0 ? (
        <p className="px-5 pt-6 text-[11px] leading-relaxed text-muted">
          รายการนี้คิดใหม่ทุกครั้งที่เปิดหน้า ไม่ต้องกดปิดทีละอัน
          แก้เรื่องไหนเสร็จแล้วเรื่องนั้นจะหายไปเอง
        </p>
      ) : null}
    </AppShell>
  );
}
