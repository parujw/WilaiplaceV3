import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconBack, IconGauge, IconPin } from "@/components/icons";
import { Avatar, Badge, PropertyImage, SectionHeader, StatCard } from "@/components/ui";
import { baht, compactBaht, cycleLabel } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { currentCycle, getRoomViews, getSummary } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function PropertyPage() {
  const { property, properties } = await requireContext();
  const cycle = currentCycle();
  const [summary, views] = await Promise.all([getSummary(property.id, cycle), getRoomViews(property.id)]);

  const occupancy = summary.rooms === 0 ? 0 : Math.round((summary.occupied / summary.rooms) * 100);
  const floors = [...new Set(views.map((v) => v.room.floor))].sort((a, b) => a - b);

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-4 pt-8">
        {properties.length > 1 ? (
          <Link href="/select" aria-label="เปลี่ยนอาคาร" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
            <IconBack />
          </Link>
        ) : null}
        <h1 className="flex-1 truncate text-[20px] font-bold tracking-tight">{property.name}</h1>
        <Link
          href="/meter"
          aria-label="จดมิเตอร์"
          className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white shadow-[0_6px_18px_-8px_rgb(232_112_58/0.9)]"
        >
          <IconGauge />
        </Link>
      </header>

      <div className="px-4">
        <div className="card relative h-44 overflow-hidden">
          <PropertyImage photoUrl={property.photoUrl} name={property.name} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[14px] text-ink-2">
          <IconPin className="h-4 w-4 shrink-0 text-muted" />
          {property.address || "ยังไม่ได้ระบุที่อยู่"} · โทร {property.phone}
        </p>
      </div>

      <section className="px-4 pt-6">
        <SectionHeader title="สรุปรอบนี้" action={cycleLabel(cycle, "full")} />
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="เก็บได้แล้ว" value={`${compactBaht(summary.collected)} ฿`} sub={`จาก ${baht(summary.billed)} บาท`} />
          <StatCard label="ยอดค้างทั้งหมด" value={`${compactBaht(summary.outstanding)} ฿`} sub="รวมทุกรอบบิล" />
          <StatCard label="อัตราเข้าอยู่" value={`${occupancy}%`} sub={`${summary.occupied} จาก ${summary.rooms} ห้อง`} />
          <StatCard label="งานค้างซ่อม" value={String(summary.openMaintenance).padStart(2, "0")} sub="รายการ" />
        </div>
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="รายการห้อง" action={`${summary.rooms} ห้อง`} />

        <div className="space-y-4">
          {floors.map((floor) => {
            const rooms = views.filter((v) => v.room.floor === floor);
            return (
              <div key={floor}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-[13px] font-bold text-ink-2">ชั้น {floor}</h3>
                  <span className="text-[12px] text-muted">
                    {rooms.filter((r) => r.lease).length}/{rooms.length} มีผู้เช่า
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {rooms.map(({ room, tenant, outstanding }) => {
                    const occupied = Boolean(room.activeLeaseId);
                    return (
                      <Link
                        key={room.id}
                        href={`/rooms/${room.id}`}
                        className={`card flex flex-col gap-1 p-3 transition active:scale-[0.98] ${
                          occupied ? "" : "bg-surface-2"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[17px] font-bold tracking-tight">{room.roomNo}</span>
                          {tenant ? <Avatar name={tenant.name} photoUrl={tenant.photoUrl} size={22} /> : null}
                        </div>
                        <span className={`text-[11px] font-semibold ${occupied ? "text-ok" : "text-muted"}`}>
                          {occupied ? "มีผู้เช่า" : "ว่าง"}
                        </span>
                        {outstanding > 0 ? (
                          <span className="text-[11px] font-semibold text-danger">ค้าง {compactBaht(outstanding)}</span>
                        ) : (
                          <span className="truncate text-[11px] text-muted">
                            {tenant ? tenant.nickname || tenant.name : `${baht(room.baseRent)} ฿`}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="px-4 pt-6">
        <div className="flex flex-wrap gap-2">
          <Badge tone="ok">มีผู้เช่า {summary.occupied}</Badge>
          <Badge>ว่าง {summary.rooms - summary.occupied}</Badge>
          <Badge tone="accent">ค่าไฟ {property.defaultRates.elec} ฿/หน่วย</Badge>
          <Badge tone="accent">ค่าน้ำ {property.defaultRates.water} ฿/หน่วย</Badge>
        </div>
      </div>
    </AppShell>
  );
}
