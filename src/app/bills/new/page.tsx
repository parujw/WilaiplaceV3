import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconBack, IconGauge } from "@/components/icons";
import { requireContext } from "@/lib/guard";
import { availableCycles, getRoomViews, listTenants } from "@/lib/repo";
import { NewBillForm, type RoomChoice } from "./NewBillForm";

export const dynamic = "force-dynamic";

/** ออกบิลใบเดียวแบบกรอกรายการเอง — คนละทางกับการออกบิลค่าเช่าทั้งตึกจากมิเตอร์ */
export default async function NewBillPage() {
  const { property } = await requireContext();
  const [views, tenants, cycles] = await Promise.all([
    getRoomViews(property.id),
    listTenants(property.id),
    availableCycles(property.id),
  ]);

  const rooms: RoomChoice[] = views.map((v) => ({
    id: v.room.id,
    roomNo: v.room.roomNo,
    tenantId: v.tenant?.id ?? null,
    tenantName: v.tenant?.name ?? null,
    rent: v.lease?.rent ?? v.room.baseRent,
    deposit: v.lease?.deposit ?? 0,
  }));

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-4 pt-8">
        <Link href="/bills" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-bold leading-tight tracking-tight">ออกบิล</h1>
          <p className="text-[13px] text-muted">กรอกรายการเอง · {property.name}</p>
        </div>
      </header>

      <section className="px-4">
        <Link
          href="/meter"
          className="mb-3 flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-[0_1px_2px_rgb(23_23_27/0.06)]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
            <IconGauge className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold">ออกบิลค่าเช่าทั้งตึก</span>
            <span className="block text-[12px] text-muted">จดมิเตอร์แล้วให้ระบบคิดค่าน้ำค่าไฟให้</span>
          </span>
          <span className="shrink-0 text-[13px] font-bold text-accent">ไปหน้าจดมิเตอร์</span>
        </Link>

        <NewBillForm
          rooms={rooms}
          tenants={tenants.map((t) => ({ id: t.id, name: t.name }))}
          cycles={cycles}
        />
      </section>
    </AppShell>
  );
}
