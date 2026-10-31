import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconBack, IconChevron } from "@/components/icons";
import { lastReadingFor } from "@/lib/billing";
import { cycleLabel } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { billingCycles, currentCycle, getRoomViews, listBills, listMeterReadings } from "@/lib/repo";
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
    billingCycles(property.id),
  ]);

  const live = billsAll.filter((b) => b.status !== "void");
  // ออกบิลค่าเช่าไปแล้วเท่านั้นที่ถือว่าจบ บิลมัดจำหรือบิลค่าซ่อมยังต้องออกค่าเช่าต่อ
  const rentBill = new Map(
    live
      .filter((b) => b.cycle === cycle && b.lines.some((l) => l.type === "rent"))
      .map((b) => [b.roomId, b]),
  );
  // บิลอื่นของรอบนี้เอาไว้บอกว่าห้องนั้นมีใบอะไรออกไปแล้วบ้าง จะได้ไม่ออกซ้ำโดยไม่รู้ตัว
  const otherBills = new Map<string, string[]>();
  for (const b of live) {
    if (b.cycle !== cycle || b.lines.some((l) => l.type === "rent")) continue;
    otherBills.set(b.roomId, [...(otherBills.get(b.roomId) ?? []), b.billNo]);
  }

  const rows: MeterRow[] = views
    .filter((v) => v.lease && v.tenant)
    .map((v) => {
      const previous = lastReadingFor(readings, v.room.id, cycle);
      // จดของรอบนี้ไว้แล้ว (ออกบิลแล้ว หรือบันทึกเลขไว้ก่อน) — ขึ้นเลขเดิมให้แก้ต่อได้
      const saved = readings.find((r) => r.roomId === v.room.id && r.cycle === cycle) ?? null;
      const bill = rentBill.get(v.room.id);
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
        elecPrevious: saved?.elecPrevious ?? previous?.elecCurrent ?? 0,
        waterPrevious: saved?.waterPrevious ?? previous?.waterCurrent ?? 0,
        saved: saved
          ? {
              elecPrevious: saved.elecPrevious,
              elecCurrent: saved.elecCurrent,
              waterPrevious: saved.waterPrevious,
              waterCurrent: saved.waterCurrent,
            }
          : null,
        carryOver,
        bill: bill ? { billNo: bill.billNo, id: bill.id, total: bill.total, paid: bill.paid, status: bill.status } : null,
        otherBillNos: otherBills.get(v.room.id) ?? [],
      };
    });

  const pending = rows.filter((r) => !r.bill).length;

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

      <div className="space-y-2 px-4 pb-4">
        {rows.length > 0 ? (
          // เดินเก็บเลขมิเตอร์ 17 ห้องเองทุกเดือนคือเวลาที่เสียไปเปล่าๆ แจกใบให้ผู้เช่าจดเองได้
          <Link
            href={`/meter/slips?cycle=${cycle}`}
            className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgb(23_23_27/0.06)] transition active:scale-[0.99]"
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-bold">พิมพ์ใบให้ผู้เช่าจดมิเตอร์เอง</span>
              <span className="block text-[12px] text-muted">
                A4 แผ่นละ 2 ใบ · มีเลขครั้งก่อนพิมพ์มาให้ · {rows.length} ห้อง
              </span>
            </span>
            <IconChevron className="h-5 w-5 shrink-0 text-muted" />
          </Link>
        ) : null}
        {/* อาคารอื่นที่ยังไม่ได้อยู่ในระบบ ไม่ต้องมีห้องหรือผู้เช่าก็พิมพ์ได้ */}
        <Link
          href="/meter/slips/blank"
          className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgb(23_23_27/0.06)] transition active:scale-[0.99]"
        >
          <span className="min-w-0">
            <span className="block text-[14px] font-bold">พิมพ์ใบจดมิเตอร์เปล่า (อาคารอื่น)</span>
            <span className="block text-[12px] text-muted">
              ให้ผู้เช่ากรอกห้องและชื่อเอง · มี QR ไลน์ส่งกลับเหมือนกัน
            </span>
          </span>
          <IconChevron className="h-5 w-5 shrink-0 text-muted" />
        </Link>
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
