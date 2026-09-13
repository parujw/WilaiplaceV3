import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconUsers } from "@/components/icons";
import { PendingSwap } from "@/components/LinkPending";
import { Avatar, Badge, EmptyState, SectionHeader } from "@/components/ui";
import { baht, thaiDate } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { getRoomViews, listLeases, listTenants } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const { property } = await requireContext();
  const [tenants, leases, views] = await Promise.all([
    listTenants(property.id),
    listLeases(property.id),
    getRoomViews(property.id),
  ]);

  const roomNoById = new Map(views.map((v) => [v.room.id, v.room.roomNo]));
  const outstandingByRoom = new Map(views.map((v) => [v.room.id, v.outstanding]));
  const activeByTenant = new Map(leases.filter((l) => l.status === "active").map((l) => [l.tenantId, l]));

  const current = tenants
    .filter((t) => activeByTenant.has(t.id))
    .sort((a, b) => {
      const ra = roomNoById.get(activeByTenant.get(a.id)!.roomId) ?? "";
      const rb = roomNoById.get(activeByTenant.get(b.id)!.roomId) ?? "";
      return ra.localeCompare(rb);
    });
  const past = tenants.filter((t) => !activeByTenant.has(t.id));

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent-strong">
          <IconUsers />
        </span>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">ผู้เช่า</h1>
          <p className="text-[13px] text-muted">
            {current.length} คนอยู่ปัจจุบัน · {property.name}
          </p>
        </div>
      </header>

      <section className="px-4">
        <SectionHeader title="อยู่ปัจจุบัน" action={`${current.length} คน`} />
        {current.length === 0 ? (
          <EmptyState title="ยังไม่มีผู้เช่า" />
        ) : (
          <div className="space-y-2.5">
            {current.map((tenant) => {
              const lease = activeByTenant.get(tenant.id)!;
              const roomNo = roomNoById.get(lease.roomId) ?? "—";
              const outstanding = outstandingByRoom.get(lease.roomId) ?? 0;
              return (
                <Link key={tenant.id} href={`/tenants/${tenant.id}`} className="card flex items-center gap-3.5 p-3.5 active:bg-surface-2">
                  <Avatar name={tenant.name} photoUrl={tenant.photoUrl} size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-bold leading-tight tracking-tight">
                      {tenant.name}
                      {tenant.nickname ? <span className="ml-1 text-[13px] font-normal text-muted">({tenant.nickname})</span> : null}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      ห้อง {roomNo} · {baht(lease.rent)} ฿/เดือน
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">สัญญาถึง {thaiDate(lease.endDate)}</p>
                  </div>
                  <PendingSwap>
                    {outstanding > 0 ? <Badge tone="danger">ค้าง {baht(outstanding)}</Badge> : <Badge tone="ok">ปกติ</Badge>}
                  </PendingSwap>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section className="px-4 pt-6">
          <SectionHeader title="ย้ายออกแล้ว" action={`${past.length} คน`} />
          <div className="space-y-2.5">
            {past.map((tenant) => (
              <Link key={tenant.id} href={`/tenants/${tenant.id}`} className="card flex items-center gap-3.5 p-3.5 opacity-75 active:bg-surface-2">
                <Avatar name={tenant.name} photoUrl={tenant.photoUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{tenant.name}</p>
                  <p className="text-[12px] text-muted">รหัส {tenant.id}</p>
                </div>
                <Badge>ไม่มีสัญญา</Badge>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
