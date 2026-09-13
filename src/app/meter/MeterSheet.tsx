"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { meterUnits } from "@/lib/billing";
import { baht, cycleLabel } from "@/lib/format";

export interface MeterRow {
  roomId: string;
  roomNo: string;
  floor: number;
  tenantName: string;
  rent: number;
  elecRate: number;
  waterRate: number;
  acFee: number;
  internetFee: number;
  parkingFee: number;
  elecPrevious: number;
  waterPrevious: number;
  carryOver: number;
  /** เลขที่บิลค่าเช่าของรอบนี้ ถ้ามีแล้วห้องนี้ถือว่าจบ */
  billedBillNo: string | null;
  /** บิลอื่นของรอบนี้ที่ไม่มีค่าเช่า เช่น มัดจำหรือค่าซ่อม — ยังต้องออกบิลค่าเช่าต่อ */
  otherBillNos: string[];
}

type Entry = { elec: string; water: string };

export function MeterSheet({ cycle, rows }: { cycle: string; rows: MeterRow[] }) {
  const router = useRouter();
  const pending = rows.filter((r) => !r.billedBillNo);

  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(rows.map((r) => [r.roomId, { elec: "", water: "" }])),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; total: number; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    return pending.map((row) => {
      const entry = entries[row.roomId] ?? { elec: "", water: "" };
      const hasElec = entry.elec.trim() !== "";
      const hasWater = entry.water.trim() !== "";
      const elecCurrent = hasElec ? Number(entry.elec) : row.elecPrevious;
      const waterCurrent = hasWater ? Number(entry.water) : row.waterPrevious;
      const elecUnits = meterUnits(row.elecPrevious, elecCurrent);
      const waterUnits = meterUnits(row.waterPrevious, waterCurrent);
      const total =
        row.rent + elecUnits * row.elecRate + waterUnits * row.waterRate +
        row.acFee + row.internetFee + row.parkingFee + row.carryOver;
      return { row, entry, ready: hasElec && hasWater, elecCurrent, waterCurrent, elecUnits, waterUnits, total };
    });
  }, [entries, pending]);

  const ready = preview.filter((p) => p.ready);
  const grandTotal = ready.reduce((s, p) => s + p.total, 0);

  function update(roomId: string, field: keyof Entry, value: string) {
    setEntries((prev) => ({ ...prev, [roomId]: { ...prev[roomId], [field]: value.replace(/[^\d.]/g, "") } }));
  }

  async function issue() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/bills/issue-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle,
          readings: ready.map((p) => ({
            roomId: p.row.roomId,
            elecCurrent: p.elecCurrent,
            waterCurrent: p.waterCurrent,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "ออกบิลไม่สำเร็จ");
      setResult({ created: json.created.length, total: json.total, skipped: json.skipped ?? [] });
      setEntries((prev) => {
        const next = { ...prev };
        for (const p of ready) next[p.row.roomId] = { elec: "", water: "" };
        return next;
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ออกบิลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-right text-[15px] font-semibold tabular-nums outline-none focus:border-accent";

  return (
    <div className="space-y-5">
      {result ? (
        <div className="card space-y-1 p-4">
          <p className="text-[15px] font-bold text-ok">
            ออกบิลแล้ว {result.created} ห้อง รวม {baht(result.total)} บาท
          </p>
          {result.skipped.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
              {result.skipped.map((s) => <li key={s}>ข้าม — {s}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {preview.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="font-semibold">ออกบิลรอบ {cycleLabel(cycle, "full")} ครบทุกห้องแล้ว</p>
          <p className="mt-1 text-sm text-muted">ไปที่หน้าบิลเพื่อดูรายการ</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {preview.map(({ row, entry, ready: rowReady, elecUnits, waterUnits, total }) => (
            <div key={row.roomId} className={`card p-4 ${rowReady ? "ring-1 ring-accent/30" : ""}`}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[17px] font-bold tracking-tight">
                    ห้อง {row.roomNo}
                    <span className="ml-2 text-[12px] font-medium text-muted">ชั้น {row.floor}</span>
                  </p>
                  <p className="truncate text-[13px] text-muted">{row.tenantName}</p>
                </div>
                <p className={`shrink-0 text-[16px] font-bold ${rowReady ? "text-accent-strong" : "text-muted"}`}>
                  {baht(total)} ฿
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 flex items-baseline justify-between text-[11px] text-muted">
                    <span>มิเตอร์ไฟ</span>
                    <span>เดิม {row.elecPrevious}</span>
                  </span>
                  <input
                    type="text" inputMode="numeric" placeholder={String(row.elecPrevious)}
                    value={entry.elec} onChange={(e) => update(row.roomId, "elec", e.target.value)}
                    className={input}
                  />
                  <span className="mt-1 block text-right text-[11px] text-muted">
                    {entry.elec ? `${elecUnits} หน่วย × ${row.elecRate} = ${baht(elecUnits * row.elecRate)} ฿` : "ยังไม่จด"}
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1 flex items-baseline justify-between text-[11px] text-muted">
                    <span>มิเตอร์น้ำ</span>
                    <span>เดิม {row.waterPrevious}</span>
                  </span>
                  <input
                    type="text" inputMode="numeric" placeholder={String(row.waterPrevious)}
                    value={entry.water} onChange={(e) => update(row.roomId, "water", e.target.value)}
                    className={input}
                  />
                  <span className="mt-1 block text-right text-[11px] text-muted">
                    {entry.water ? `${waterUnits} หน่วย × ${row.waterRate} = ${baht(waterUnits * row.waterRate)} ฿` : "ยังไม่จด"}
                  </span>
                </label>
              </div>

              {row.carryOver > 0 ? (
                <p className="mt-2 text-[12px] font-semibold text-danger">
                  ยกยอดค้างเดิม {baht(row.carryOver)} บาทเข้าบิลนี้
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {rows.some((r) => r.billedBillNo) ? (
        <div className="card p-4">
          <p className="mb-1 text-[13px] font-bold text-muted">ออกบิลค่าเช่ารอบนี้แล้ว</p>
          <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
            ห้องเหล่านี้ไม่ขึ้นในรายการข้างบนแล้ว เพราะออกบิลค่าเช่าของรอบนี้ไปแล้ว
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rows.filter((r) => r.billedBillNo).map((r) => (
              <span key={r.roomId} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold">
                {r.roomNo}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* บิลที่ไม่มีค่าเช่า (มัดจำ ค่าซ่อม) ไม่บล็อกการออกบิลค่าเช่า
          แต่ต้องบอกให้เห็น ไม่งั้นจะไม่รู้ว่าเดือนนี้เคยออกใบอะไรให้ห้องนั้นไปแล้ว */}
      {rows.some((r) => r.otherBillNos.length > 0) ? (
        <div className="card p-4">
          <p className="mb-1 text-[13px] font-bold text-muted">มีบิลอื่นของรอบนี้อยู่แล้ว</p>
          <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
            เช่น ค่ามัดจำหรือค่าซ่อม ห้องเหล่านี้ยังออกบิลค่าเช่าได้ตามปกติ
          </p>
          <div className="space-y-1">
            {rows.filter((r) => r.otherBillNos.length > 0).map((r) => (
              <p key={r.roomId} className="text-[12px]">
                <span className="font-semibold">ห้อง {r.roomNo}</span>
                <span className="text-muted"> · {r.otherBillNos.join(", ")}</span>
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-danger/10 px-4 py-3 text-center text-[13px] font-semibold text-danger">{error}</p>
      ) : null}

      {preview.length > 0 ? (
        <div className="sticky bottom-24 z-20">
          <button
            type="button"
            onClick={issue}
            disabled={busy || ready.length === 0}
            className="w-full rounded-2xl bg-accent px-5 py-4 text-[15px] font-bold text-white shadow-[0_10px_30px_-12px_rgb(232_112_58/0.95)] disabled:bg-muted disabled:shadow-none"
          >
            {busy
              ? "กำลังออกบิล…"
              : ready.length === 0
                ? "กรอกเลขมิเตอร์เพื่อออกบิล"
                : `ออกบิล ${ready.length} ห้อง · รวม ${baht(grandTotal)} ฿`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
