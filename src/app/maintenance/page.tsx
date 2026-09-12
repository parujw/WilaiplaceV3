import { AppShell } from "@/components/AppShell";
import { IconWrench } from "@/components/icons";
import { Badge, EmptyState, SectionHeader } from "@/components/ui";
import { MAINTENANCE_STATUS_LABEL, baht, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { getRoomViews, listMaintenance } from "@/lib/repo";
import { MaintenanceForm, StatusButtons } from "./MaintenanceForm";

export const dynamic = "force-dynamic";

const STATUS_TONE = { open: "danger", in_progress: "warn", done: "ok", cancelled: "neutral" } as const;
const URGENCY_LABEL = { low: "ไม่รีบ", normal: "ปกติ", urgent: "ด่วน" } as const;

export default async function MaintenancePage() {
  const { property } = await requireContext();
  const [tickets, views] = await Promise.all([listMaintenance(property.id), getRoomViews(property.id)]);

  const rooms = views.map((v) => ({ id: v.room.id, roomNo: v.room.roomNo }));
  const active = tickets.filter((t) => t.status === "open" || t.status === "in_progress");
  const closed = tickets.filter((t) => t.status === "done" || t.status === "cancelled");

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent-strong">
          <IconWrench />
        </span>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">แจ้งซ่อม</h1>
          <p className="text-[13px] text-muted">{active.length} งานที่ยังไม่ปิด · {property.name}</p>
        </div>
      </header>

      <div className="px-4">
        <MaintenanceForm rooms={rooms} />
      </div>

      <section className="px-4 pt-6">
        <SectionHeader title="งานที่ยังไม่ปิด" action={`${active.length} รายการ`} />
        {active.length === 0 ? (
          <EmptyState title="ไม่มีงานค้าง" detail="ทุกห้องเรียบร้อยดี" />
        ) : (
          <div className="space-y-2.5">
            {active.map((t) => (
              <div key={t.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold tracking-tight">
                      ห้อง {t.roomNo} · {t.category}
                    </p>
                    <p className="mt-0.5 text-[14px] text-ink-2">{t.problem}</p>
                    <p className="mt-1 text-[12px] text-muted">
                      {t.ticketNo} · แจ้ง {thaiDate(t.reportedAt)} โดย {t.reportedBy}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={STATUS_TONE[t.status]}>{MAINTENANCE_STATUS_LABEL[t.status]}</Badge>
                    {t.urgency === "urgent" ? <Badge tone="danger">ด่วน</Badge> : null}
                  </div>
                </div>
                <StatusButtons id={t.id} status={t.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      {closed.length > 0 ? (
        <section className="px-4 pt-6">
          <SectionHeader title="ปิดงานแล้ว" action={`${closed.length} รายการ`} />
          <div className="card divide-y divide-line overflow-hidden">
            {closed.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">ห้อง {t.roomNo} · {t.problem}</p>
                  <p className="text-[12px] text-muted">
                    {t.ticketNo} · {URGENCY_LABEL[t.urgency]} · {thaiDate(t.reportedAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge tone={STATUS_TONE[t.status]}>{MAINTENANCE_STATUS_LABEL[t.status]}</Badge>
                  {t.cost > 0 ? <p className="mt-1 text-[12px] font-semibold">{baht(t.cost)} ฿</p> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
