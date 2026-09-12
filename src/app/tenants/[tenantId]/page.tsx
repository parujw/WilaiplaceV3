import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { IconBack, IconReceipt } from "@/components/icons";
import { TenantPhotoUpload } from "@/components/TenantPhotoUpload";
import { Badge, EmptyState, RowLink, SectionHeader } from "@/components/ui";
import { BILL_STATUS_LABEL, baht, cycleLabel, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { getTenant, leasesOfTenant, listBills, getRoom } from "@/lib/repo";

export const dynamic = "force-dynamic";

const STATUS_TONE = { paid: "ok", partial: "warn", unpaid: "danger", void: "neutral" } as const;
const LEASE_LABEL = { active: "กำลังเช่า", ended: "จบสัญญา", reserved: "จอง" } as const;

export default async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { property } = await requireContext();

  const tenant = await getTenant(tenantId);
  if (!tenant || tenant.propertyId !== property.id) notFound();

  const leases = await leasesOfTenant(tenant.id);
  const rooms = await Promise.all(leases.map((l) => getRoom(l.roomId)));
  const allBills = await listBills(property.id);
  const bills = allBills.filter((b) => b.tenantSnapshot.tenantId === tenant.id);
  const activeLease = leases.find((l) => l.status === "active") ?? null;
  const activeRoom = activeLease ? rooms[leases.indexOf(activeLease)] : null;

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-2 pt-8">
        <Link href="/tenants" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <h1 className="flex-1 text-[18px] font-bold tracking-tight">ข้อมูลผู้เช่า</h1>
      </header>

      <section className="px-4 pt-3">
        <div className="card flex flex-col items-center gap-3 px-5 py-6">
          <TenantPhotoUpload tenantId={tenant.id} name={tenant.name} photoUrl={tenant.photoUrl} />
          <div className="text-center">
            <h2 className="text-[20px] font-bold leading-tight tracking-tight">{tenant.name}</h2>
            {tenant.nickname ? <p className="text-[14px] text-muted">({tenant.nickname})</p> : null}
            <p className="mt-1 text-[13px] text-muted">รหัส {tenant.id}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {activeRoom ? <Badge tone="accent">ห้อง {activeRoom.roomNo}</Badge> : <Badge>ไม่มีสัญญาที่ใช้งานอยู่</Badge>}
            {tenant.lineUserId ? <Badge tone="ok">เชื่อม LINE แล้ว</Badge> : <Badge tone="warn">ยังไม่เชื่อม LINE</Badge>}
          </div>
          {tenant.phone ? (
            <a href={`tel:${tenant.phone}`} className="rounded-full bg-accent-soft px-5 py-2.5 text-[14px] font-bold text-accent-strong">
              โทร {tenant.phone}
            </a>
          ) : (
            <p className="text-[13px] text-muted">ยังไม่มีเบอร์โทรในระบบ</p>
          )}
          {tenant.note ? <p className="text-center text-[12px] text-muted">{tenant.note}</p> : null}
        </div>
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="สัญญา" action={`${leases.length} ฉบับ`} />
        <div className="space-y-2.5">
          {leases.map((lease, i) => {
            const room = rooms[i];
            return (
              <div key={lease.id} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[16px] font-bold tracking-tight">ห้อง {room?.roomNo ?? "—"}</p>
                  <Badge tone={lease.status === "active" ? "ok" : "neutral"}>{LEASE_LABEL[lease.status]}</Badge>
                </div>
                <p className="mt-1 text-[13px] text-muted">
                  {thaiDate(lease.startDate)} – {thaiDate(lease.endDate)}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      ["ค่าเช่า", lease.rent],
                      ["ประกัน", lease.deposit],
                      ["ล่วงหน้า", lease.advance],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-surface-2 py-2.5">
                      <p className="text-[15px] font-bold">{baht(value)}</p>
                      <p className="text-[11px] text-muted">{label}</p>
                    </div>
                  ))}
                </div>
                {lease.endedReason ? <p className="mt-2 text-[12px] text-muted">{lease.endedReason}</p> : null}
                {room ? (
                  <Link href={`/rooms/${room.id}`} className="mt-3 block text-[13px] font-semibold text-accent">
                    ดูห้อง {room.roomNo} →
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="บิลของผู้เช่ารายนี้" action={`${bills.length} ใบ`} />
        {bills.length === 0 ? (
          <EmptyState title="ยังไม่มีบิล" detail="บิลจะผูกกับผู้เช่าตั้งแต่รอบที่ออกในระบบ V3" />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {bills.map((bill) => (
              <RowLink
                key={bill.id}
                href={`/bills/${bill.id}`}
                leading={
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
                    <IconReceipt />
                  </span>
                }
                title={`${cycleLabel(bill.cycle, "full")} · ${baht(bill.total)} ฿`}
                detail={`ห้อง ${bill.roomNo} · ${bill.billNo}`}
                right={<Badge tone={STATUS_TONE[bill.status]}>{BILL_STATUS_LABEL[bill.status]}</Badge>}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
