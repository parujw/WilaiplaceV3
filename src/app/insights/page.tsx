import { AppShell } from "@/components/AppShell";
import { IconChart, IconDoor, IconWallet } from "@/components/icons";
import { EmptyState, SectionHeader } from "@/components/ui";
import { baht, cycleLabel } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { availableCycles, getInsights } from "@/lib/repo";
import { Forecast } from "./Forecast";
import { RevenueMix } from "./RevenueMix";

export const dynamic = "force-dynamic";

/** ตัวเลขเดี่ยวพร้อมคำอธิบายว่ามันบอกอะไร ไม่ใช่แค่เลขลอยๆ */
function Metric({
  label, value, unit, detail,
}: { label: string; value: string; unit?: string; detail: string }) {
  return (
    <div className="card p-4">
      <p className="text-[12px] leading-tight text-muted">{label}</p>
      <p className="mt-1.5 text-[24px] font-bold leading-none tracking-tight">
        {value}
        {unit ? <span className="ml-1 text-[13px] font-semibold text-muted">{unit}</span> : null}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted">{detail}</p>
    </div>
  );
}

export default async function InsightsPage() {
  const { property } = await requireContext();
  const [data, cycles] = await Promise.all([getInsights(property.id), availableCycles(property.id)]);

  const occupancy = data.rooms === 0 ? 0 : data.occupied / data.rooms;
  // เต็มทุกห้อง = ค่าเช่าที่เก็บอยู่จริง + ราคาป้ายของห้องที่ยังว่าง
  const fullOccupancyMonthly = data.recurring.total + data.vacancy.monthly;
  const collection = data.collection ?? 1;

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent-strong">
          <IconChart />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">วิเคราะห์</h1>
          <p className="truncate text-[13px] text-muted">
            {property.name} · {data.occupied}/{data.rooms} ห้องมีผู้เช่า
          </p>
        </div>
      </header>

      <section className="px-4">
        <SectionHeader title="รายได้ประจำ" action="ต่อเดือน" />
        <div className="card p-5">
          <p className="text-[13px] text-muted">รับเข้าทุกเดือนจากสัญญาที่เดินอยู่</p>
          <p className="mt-0.5 text-[32px] font-bold leading-none tracking-tight">
            {baht(data.recurring.total)} <span className="text-[16px] font-semibold text-muted">บาท</span>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 px-3.5 py-3">
              <p className="text-[11px] text-muted">ค่าเช่าห้อง</p>
              <p className="text-[17px] font-bold">{baht(data.recurring.rent)}</p>
            </div>
            <div className="rounded-xl bg-surface-2 px-3.5 py-3">
              <p className="text-[11px] text-muted">ค่าบริการรายเดือน</p>
              <p className="text-[17px] font-bold">{baht(data.recurring.services)}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            ค่าน้ำค่าไฟไม่นับรวม เพราะเก็บจากผู้เช่าแล้วจ่ายการไฟฟ้ากับการประปาต่อ
            ผ่านมือเฉยๆ นับรวมเมื่อไหร่ตัวเลขจะพองโดยไม่มีกำไรเพิ่ม
          </p>
        </div>
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="ตัวเลขบริหาร" />
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="อัตราเข้าอยู่"
            value={String(Math.round(occupancy * 100))}
            unit="%"
            detail={`ว่าง ${data.vacancy.rooms} ห้องจาก ${data.rooms} ห้อง`}
          />
          <Metric
            label="เก็บเงินได้จริง"
            value={data.collection === null ? "—" : String(Math.round(data.collection * 100))}
            unit={data.collection === null ? undefined : "%"}
            detail={data.collection === null ? "ยังไม่มีบิลให้คิด" : "จากบิลทั้งหมดที่ออกไป"}
          />
          <Metric
            label="รายได้ต่อห้อง"
            value={baht(data.band?.perRoom ?? 0)}
            unit="฿"
            detail="เฉลี่ยทุกห้องรวมห้องว่าง บอกผลตอบแทนจริงของตึก"
          />
          <Metric
            label="ค่าเช่าเฉลี่ย"
            value={baht(data.band?.average ?? 0)}
            unit="฿"
            detail={
              data.band ? `ต่ำสุด ${baht(data.band.min)} · สูงสุด ${baht(data.band.max)}` : "ยังไม่มีสัญญา"
            }
          />
        </div>
      </section>

      {data.vacancy.rooms > 0 ? (
        <section className="px-4 pt-6">
          <div className="card flex items-start gap-3.5 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn/15 text-[#96690f]">
              <IconDoor />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold">ห้องว่าง {data.vacancy.rooms} ห้อง</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                ถ้าเก็บเต็มจะได้เพิ่มอีก <strong className="text-ink">{baht(data.vacancy.monthly)}</strong> บาท/เดือน
                หรือ <strong className="text-ink">{baht(data.vacancy.yearly)}</strong> บาท/ปี
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-4 pt-6">
        <SectionHeader title="รายได้มาจากอะไร" action="เลือกรอบได้" />
        <RevenueMix bills={data.bills} cycles={cycles} />
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="ประมาณการรายได้" action="ปรับสมมติฐานได้" />
        {fullOccupancyMonthly === 0 ? (
          <EmptyState title="ยังประมาณการไม่ได้" detail="ต้องมีสัญญาเช่าหรือราคาป้ายของห้องก่อน" />
        ) : (
          <Forecast
            fullOccupancyMonthly={fullOccupancyMonthly}
            occupancy={occupancy}
            collection={collection}
          />
        )}
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="สัญญาที่ต้องต่อ" action={`${data.expiry.reduce((s, e) => s + e.leases, 0)} ฉบับ`} />
        {data.expiry.length === 0 ? (
          <EmptyState title="ยังไม่มีสัญญาที่เดินอยู่" />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {data.expiry.map((bucket) => (
              <div key={bucket.buddhistYear ?? "none"} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold">
                    {bucket.buddhistYear === null ? "ไม่ระบุวันสิ้นสุด" : `หมดอายุปี ${bucket.buddhistYear}`}
                  </p>
                  <p className="text-[12px] text-muted">
                    {bucket.leases} ฉบับ
                    {bucket.buddhistYear === null ? " · ต่อสัญญาเมื่อไหร่ก็ได้" : ""}
                  </p>
                </div>
                <p className="shrink-0 text-[15px] font-bold tabular-nums">{baht(bucket.monthly)} ฿/ด.</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="เก็บได้จริงย้อนหลัง" action={`${data.actuals.length} รอบ`} />
        {data.actuals.length === 0 ? (
          <EmptyState title="ยังไม่มีบิลในระบบ" />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {[...data.actuals].reverse().map((row) => {
              const rate = row.billed === 0 ? 0 : row.collected / row.billed;
              return (
                <div key={row.cycle} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold">{cycleLabel(row.cycle, "full")}</p>
                    <p className="text-[12px] text-muted">
                      ออกบิล {baht(row.billed)} · เก็บได้ {baht(row.collected)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${
                      rate >= 1 ? "bg-ok/12 text-ok" : rate >= 0.8 ? "bg-warn/15 text-[#96690f]" : "bg-danger/12 text-danger"
                    }`}
                  >
                    {Math.round(rate * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="px-4 pt-6">
        <div className="card flex items-start gap-3 p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
            <IconWallet className="h-4.5 w-4.5" />
          </span>
          <p className="text-[12px] leading-relaxed text-muted">
            ประมาณการคิดจากสัญญาที่ผูกไว้จริงตอนนี้ ไม่ได้ลากเส้นจากประวัติบิล
            เพราะประวัติที่ย้ายมาจาก V2 มีไม่กี่รอบ ลากเส้นแล้วได้ตัวเลขที่ดูน่าเชื่อแต่ไม่มีอะไรรองรับ
            ยิ่งใช้ระบบนานขึ้น ตัวเลขเก็บได้จริงย้อนหลังจะยิ่งบอกได้แม่นขึ้น
          </p>
        </div>
      </section>
    </AppShell>
  );
}
