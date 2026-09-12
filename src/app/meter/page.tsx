import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconBack } from "@/components/icons";
import { lastReadingFor } from "@/lib/billing";
import { cycleLabel } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { availableCycles, currentCycle, getRoomViews, listBills, listMeterReadings } from "@/lib/repo";
import { MeterSheet, type MeterRow } from "./MeterSheet";

export const dynamic = "force-dynamic";

export default async function MeterPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const { property } = await requireContext();
  const cycle = /^\d{6}$/.test(cycleParam ?? "") ? cycleParam! : currentCycle();

  const [views, readings, billsAll, cycles] = await Promise.all([
    getRoomViews(property.id),
    listMeterReadings(property.id),
    listBills(property.id),
    availableCycles(property.id),
  ]);

  const live = billsAll.filter((b) => b.status !== "void");
  const billedThisCycle = new Map(live.filter((b) => b.cycle === cycle).map((b) => [b.roomId, b.billNo]));

  const rows: MeterRow[] = views
    .filter((v) => v.lease && v.tenant)
    .map((v) => {
      const previous = lastReadingFor(readings, v.room.id, cycle);
      const carryOver = live
        .filter((b) => b.roomId === v.room.id && b.cycle < cycle)
        .reduce((sum, b) => sum + b.balance, 0);

      return {
        roomId: v.room.id,
        roomNo: v.room.roomNo,
        floor: v.room.floor,
        tenantName: v.tenant!.name,
        rent: v.lease!.rent,
        elecRate: v.lease!.rates.elec,
        waterRate: v.lease!.rates.water,
        acFee: v.lease!.rates.ac,
        internetFee: v.lease!.rates.internet,
        parkingFee: v.lease!.rates.parking,
        elecPrevious: previous?.elecCurrent ?? 0,
        waterPrevious: previous?.waterCurrent ?? 0,
        carryOver,
        billedBillNo: billedThisCycle.get(v.room.id) ?? null,
      };
    });

  const pending = rows.filter((r) => !r.billedBillNo).length;

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-4 pt-8">
        <Link href="/" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-bold leading-tight tracking-tight">จดมิเตอร์ &amp; ออกบิล</h1>
          <p className="text-[13px] text-muted">
            รอบ {cycleLabel(cycle, "full")} · เหลือ {pending} ห้อง
          </p>
        </div>
      </header>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-4">
        {cycles.slice(0, 6).map((c) => (
          <Link
            key={c}
            href={`/meter?cycle=${c}`}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold ${
              c === cycle ? "bg-accent text-white" : "bg-surface text-ink-2"
            }`}
          >
            {cycleLabel(c)}
          </Link>
        ))}
      </div>

      <div className="px-4">
        {rows.length === 0 ? (
          <div className="card px-6 py-10 text-center">
            <p className="font-semibold">ยังไม่มีห้องที่มีผู้เช่า</p>
            <p className="mt-1 text-sm text-muted">เพิ่มสัญญาเช่าก่อนจึงจะออกบิลได้</p>
          </div>
        ) : (
          <MeterSheet cycle={cycle} rows={rows} />
        )}
      </div>
    </AppShell>
  );
}
