import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconBack, IconGauge } from "@/components/icons";
import { lastReadingFor } from "@/lib/billing";
import { requireContext } from "@/lib/guard";
import { billingCycles, currentCycle, getRoomViews, listBills, listLeases, listMeterReadings, listTenants } from "@/lib/repo";
import { carryOverFor, tenancyLeaseIds } from "@/lib/tenancy";
import { NewBillForm, type CycleInfo, type RoomChoice } from "./NewBillForm";

export const dynamic = "force-dynamic";

/** ออกบิลใบเดียวแบบกรอกรายการเอง — คนละทางกับการออกบิลค่าเช่าทั้งตึกจากมิเตอร์ */
export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; cycle?: string }>;
}) {
  const { room: roomParam, cycle: cycleParam } = await searchParams;
  const { property } = await requireContext();
  const [views, tenants, cycles, bills, readings, leases] = await Promise.all([
    getRoomViews(property.id),
    listTenants(property.id),
    billingCycles(property.id),
    listBills(property.id),
    listMeterReadings(property.id),
    listLeases(property.id),
  ]);

  const rooms: RoomChoice[] = views.map((v) => ({
    id: v.room.id,
    roomNo: v.room.roomNo,
    tenantId: v.tenant?.id ?? null,
    tenantName: v.tenant?.name ?? null,
    rent: v.lease?.rent ?? v.room.baseRent,
    deposit: v.lease?.deposit ?? 0,
    rates: v.lease?.rates ?? null,
  }));

  /*
   * สถานะของทุกห้องในทุกรอบที่เลือกได้ — เปลี่ยนห้องหรือรอบในฟอร์มแล้วเติมรายการให้ทันที
   * ไม่ต้องถามเซิร์ฟเวอร์ใหม่ 17 ห้อง × ไม่กี่รอบ เล็กพอส่งไปทั้งก้อน
   */
  const live = bills.filter((b) => b.status !== "void");
  const info: Record<string, Record<string, CycleInfo>> = {};
  for (const cycle of cycles) {
    info[cycle] = {};
    for (const v of views) {
      const saved = readings.find((r) => r.roomId === v.room.id && r.cycle === cycle);
      const previous = lastReadingFor(readings, v.room.id, cycle);
      const ofRoom = live.filter((b) => b.roomId === v.room.id && b.cycle === cycle);
      const rentBill = ofRoom.find((b) => b.lines.some((l) => l.type === "rent"));
      info[cycle][v.room.id] = {
        reading: saved
          ? {
              elecPrevious: saved.elecPrevious,
              elecCurrent: saved.elecCurrent,
              waterPrevious: saved.waterPrevious,
              waterCurrent: saved.waterCurrent,
            }
          : null,
        previous: previous ? { elec: previous.elecCurrent, water: previous.waterCurrent } : null,
        // ยอดค้างของการเช่าครั้งนี้เท่านั้น — วิธีเดียวกับตอนออกบิลทั้งตึก
        carryOver: v.lease
          ? carryOverFor(bills, tenancyLeaseIds(leases, v.room.activeLeaseId), v.tenant?.id ?? null, cycle)
          : 0,
        rentBill: rentBill ? { id: rentBill.id, billNo: rentBill.billNo, status: rentBill.status } : null,
        otherBills: ofRoom.filter((b) => b !== rentBill).map((b) => b.billNo),
      };
    }
  }

  const defaultCycle = cycles.includes(cycleParam ?? "") ? cycleParam! : currentCycle();
  const defaultRoom = rooms.some((r) => r.id === roomParam) ? roomParam! : (rooms[0]?.id ?? "");

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-4 pt-8">
        <Link href="/bills" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-bold leading-tight tracking-tight">ออกบิล</h1>
          <p className="text-[13px] text-muted">เติมรายการให้จากสัญญาและมิเตอร์ · {property.name}</p>
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
          info={info}
          defaultCycle={defaultCycle}
          defaultRoom={defaultRoom}
        />
      </section>
    </AppShell>
  );
}
