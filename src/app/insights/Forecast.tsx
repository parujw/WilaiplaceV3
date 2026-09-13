"use client";

import { useState } from "react";
import { projectYears } from "@/lib/forecast";
import { baht, compactBaht } from "@/lib/format";

/**
 * ประมาณการรายได้ 1-5 ปี พร้อมสมมติฐานที่ปรับได้
 *
 * ตั้งใจให้ปรับสมมติฐานได้เอง เพราะตัวเลขทำนายที่ปรับไม่ได้คือตัวเลขที่เชื่อไม่ได้
 * เจ้าของรู้ดีกว่าระบบว่าปีหน้าจะขึ้นค่าเช่าไหม และห้องว่างจะเต็มเมื่อไหร่
 * ระบบรู้แค่ตัวเลขวันนี้ จึงให้ค่าตั้งต้นจากของจริงแล้วให้ปรับต่อ
 */
export function Forecast({
  fullOccupancyMonthly, occupancy, collection,
}: {
  /** รายได้ต่อเดือนถ้าทุกห้องมีคนอยู่ในราคาปัจจุบัน */
  fullOccupancyMonthly: number;
  occupancy: number;
  collection: number;
}) {
  const [assume, setAssume] = useState({
    occupancy: Math.round(occupancy * 100),
    collection: Math.round(collection * 100),
    rentIncrease: 0,
    years: 5,
  });

  const rows = projectYears(fullOccupancyMonthly, {
    occupancy: assume.occupancy / 100,
    collection: assume.collection / 100,
    rentIncrease: assume.rentIncrease / 100,
    years: assume.years,
  });

  const peak = Math.max(...rows.map((r) => r.potential), 1);
  const fiveYearTotal = rows.reduce((sum, r) => sum + r.expected, 0);

  const slider = (
    key: "occupancy" | "collection" | "rentIncrease",
    label: string,
    max: number,
    suffix = "%",
  ) => (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <strong className="text-[15px] tabular-nums">{assume[key]}{suffix}</strong>
      </span>
      <input
        type="range" min="0" max={max} step="1" value={assume[key]}
        onChange={(e) => setAssume({ ...assume, [key]: Number(e.target.value) })}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-accent"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <p className="text-[13px] text-muted">รวม {assume.years} ปีข้างหน้า</p>
        <p className="mt-0.5 text-[30px] font-bold leading-none tracking-tight">
          {baht(fiveYearTotal)} <span className="text-[15px] font-semibold text-muted">บาท</span>
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          คิดจากสัญญาที่เดินอยู่ตอนนี้ ไม่รวมค่าน้ำค่าไฟที่เก็บแล้วจ่ายต่อ
        </p>

        {/* แต่ละปีสองแท่งซ้อนกัน จางคือถ้าเต็มทุกห้องเก็บได้ครบ เข้มคือที่คาดว่าจะได้จริง
            ส่วนที่โผล่พ้นแท่งเข้มขึ้นไปคือรายได้ที่หายไปจากห้องว่างกับเก็บเงินไม่ได้ */}
        <div className="mt-4 flex h-44 gap-2">
          {rows.map((row) => (
            <div key={row.year} className="flex h-full flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold tabular-nums text-ink-2">
                {compactBaht(row.expected)}
              </span>
              <div className="relative min-h-0 w-full flex-1">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-lg bg-accent-soft"
                  style={{ height: `${(row.potential / peak) * 100}%` }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-lg bg-gradient-to-t from-accent-strong to-accent"
                  style={{ height: `${(row.expected / peak) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-muted">{row.buddhistYear}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" />คาดว่าจะได้จริง
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent-soft" />เต็มทุกห้อง
          </span>
        </div>
      </div>

      <div className="card space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold tracking-tight">สมมติฐาน</h3>
          <div className="flex gap-1.5">
            {[1, 3, 5].map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setAssume({ ...assume, years: y })}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                  assume.years === y ? "bg-accent text-white" : "bg-surface-2 text-ink-2"
                }`}
              >
                {y} ปี
              </button>
            ))}
          </div>
        </div>

        {slider("occupancy", "ห้องมีคนอยู่", 100)}
        {slider("collection", "เก็บเงินได้จริง", 100)}
        {slider("rentIncrease", "ขึ้นค่าเช่าต่อปี", 15)}

        <p className="text-[11px] leading-relaxed text-muted">
          ค่าตั้งต้นมาจากตัวเลขจริงของอาคารนี้ ลองปรับดูว่าถ้าเก็บห้องว่างได้เต็ม
          หรือขึ้นค่าเช่าปีละไม่กี่เปอร์เซ็นต์ รายได้จะต่างไปเท่าไหร่
        </p>
      </div>

      <div className="card divide-y divide-line overflow-hidden">
        {rows.map((row) => (
          <div key={row.year} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-[14px] font-bold">ปี {row.buddhistYear}</p>
              <p className="text-[12px] text-muted">
                เต็มที่ {baht(row.potential)} · หายไป {baht(row.gap)}
              </p>
            </div>
            <p className="text-[16px] font-bold tabular-nums">{baht(row.expected)} ฿</p>
          </div>
        ))}
      </div>
    </div>
  );
}
