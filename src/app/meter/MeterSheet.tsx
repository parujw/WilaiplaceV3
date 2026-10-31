"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { meterUnits } from "@/lib/billing";
import { BILL_STATUS_LABEL, baht, cycleLabel } from "@/lib/format";
import type { BillStatus } from "@/lib/types";

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
  /** เลขครั้งก่อน — ของที่จดไว้รอบนี้ถ้ามี ไม่งั้นเลขล่าสุดของรอบก่อน */
  elecPrevious: number;
  waterPrevious: number;
  /** เลขที่จดไว้แล้วของรอบนี้ (ออกบิลแล้ว หรือบันทึกไว้ก่อน) — null = ยังไม่เคยจด */
  saved: { elecPrevious: number; elecCurrent: number; waterPrevious: number; waterCurrent: number } | null;
  carryOver: number;
  /** บิลค่าเช่าของรอบนี้ — มีแล้วก็ยังจดใหม่ได้ ระบบแก้ค่าไฟค่าน้ำในบิลนี้ให้ */
  bill: { id: string; billNo: string; total: number; paid: number; status: BillStatus } | null;
  /** บิลอื่นของรอบนี้ที่ไม่มีค่าเช่า เช่น มัดจำหรือค่าซ่อม — ยังต้องออกบิลค่าเช่าต่อ */
  otherBillNos: string[];
}

/**
 * เลขที่กรอกในรอบนี้ และเลขเดิมที่แก้ได้
 *
 * เลขเดิมมาจากที่จดไว้รอบก่อน ปกติไม่ต้องแตะ แต่ถ้ารอบก่อนจดผิด
 * หน่วยที่คิดได้ในรอบนี้จะผิดตามไปด้วย จึงให้แก้ตรงนี้ได้เลย
 * แก้แล้วมีผลกับบิลใบนี้เท่านั้น ไม่ย้อนไปแก้บิลเก่า — ใบเก่าที่ผิดต้องไปแก้ที่ใบนั้น
 */
type Entry = { elec: string; water: string; elecPrev: string; waterPrev: string };

function entryOf(row: MeterRow): Entry {
  return {
    elec: row.saved ? String(row.saved.elecCurrent) : "",
    water: row.saved ? String(row.saved.waterCurrent) : "",
    elecPrev: String(row.elecPrevious),
    waterPrev: String(row.waterPrevious),
  };
}

const STATUS_TONE: Record<BillStatus, string> = {
  paid: "bg-ok/10 text-ok",
  partial: "bg-warn/10 text-warn",
  unpaid: "bg-accent-soft text-accent-strong",
  void: "bg-surface-2 text-muted",
};

export function MeterSheet({ cycle, rows }: { cycle: string; rows: MeterRow[] }) {
  const router = useRouter();

  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(rows.map((r) => [r.roomId, entryOf(r)])),
  );
  // หลังบันทึก หน้าโหลดข้อมูลใหม่จากเซิร์ฟเวอร์ — เติมช่องใหม่จากเลขที่บันทึกจริง
  useEffect(() => {
    setEntries(Object.fromEntries(rows.map((r) => [r.roomId, entryOf(r)])));
  }, [rows]);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    saved: number;
    total: number;
    skipped: string[];
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    return rows.map((row) => {
      const entry = entries[row.roomId] ?? entryOf(row);
      const hasElec = entry.elec.trim() !== "";
      const hasWater = entry.water.trim() !== "";
      // เลขเดิมที่ลบทิ้งจนว่างให้ถือเป็น 0 ไม่ใช่ NaN ที่จะทำให้ยอดเพี้ยนเงียบๆ
      const elecPrevious = entry.elecPrev.trim() === "" ? 0 : Number(entry.elecPrev);
      const waterPrevious = entry.waterPrev.trim() === "" ? 0 : Number(entry.waterPrev);
      const elecCurrent = hasElec ? Number(entry.elec) : elecPrevious;
      const waterCurrent = hasWater ? Number(entry.water) : waterPrevious;
      const elecUnits = meterUnits(elecPrevious, elecCurrent);
      const waterUnits = meterUnits(waterPrevious, waterCurrent);
      const total =
        row.rent + elecUnits * row.elecRate + waterUnits * row.waterRate +
        row.acFee + row.internetFee + row.parkingFee + row.carryOver;
      const ready = hasElec && hasWater;
      // ต่างจากที่บันทึกไว้ไหม — ไม่ต่างก็ไม่ต้องส่งไปเขียนซ้ำ
      const changed =
        ready &&
        (!row.saved ||
          row.saved.elecPrevious !== elecPrevious || row.saved.elecCurrent !== elecCurrent ||
          row.saved.waterPrevious !== waterPrevious || row.saved.waterCurrent !== waterCurrent);
      return {
        row, entry, ready, changed,
        elecPrevious, waterPrevious, elecCurrent, waterCurrent, elecUnits, waterUnits, total,
        // บอกให้เห็นว่าแก้เลขเดิมไปจากที่ระบบจำไว้ จะได้ไม่แก้ค้างไว้โดยไม่ตั้งใจ
        prevEdited: elecPrevious !== row.elecPrevious || waterPrevious !== row.waterPrevious,
      };
    });
  }, [entries, rows]);

  // ห้องที่ยังไม่มีบิลและจดครบ → ออกบิลใหม่
  const toIssue = preview.filter((p) => !p.row.bill && p.ready);
  // ห้องที่ออกบิลแล้วแต่จดเลขใหม่ → แก้ค่าไฟค่าน้ำในบิลเดิม
  const toUpdate = preview.filter((p) => p.row.bill && p.changed);
  // บันทึกเลขอย่างเดียว ยังไม่ออกบิล
  const toSave = preview.filter((p) => !p.row.bill && p.changed);
  const issueTotal = toIssue.reduce((s, p) => s + p.total, 0);
  const pendingCount = rows.filter((r) => !r.bill).length;

  function update(roomId: string, field: keyof Entry, value: string) {
    setEntries((prev) => ({ ...prev, [roomId]: { ...prev[roomId], [field]: value.replace(/[^\d.]/g, "") } }));
  }

  async function submit(mode: "issue" | "save") {
    const send = mode === "issue" ? [...toIssue, ...toUpdate] : [...toSave, ...toUpdate];
    if (send.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/bills/issue-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle,
          mode,
          readings: send.map((p) => ({
            roomId: p.row.roomId,
            elecPrevious: p.elecPrevious,
            waterPrevious: p.waterPrevious,
            elecCurrent: p.elecCurrent,
            waterCurrent: p.waterCurrent,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setResult({
        created: json.created?.length ?? 0,
        updated: json.updated?.length ?? 0,
        saved: json.saved?.length ?? 0,
        total: json.total ?? 0,
        skipped: json.skipped ?? [],
        warnings: json.warnings ?? [],
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-right text-[15px] font-semibold tabular-nums outline-none focus:border-accent";

  const primaryLabel = busy
    ? "กำลังบันทึก…"
    : toIssue.length > 0
      ? `ออกบิล ${toIssue.length} ห้อง · รวม ${baht(issueTotal)} ฿${toUpdate.length ? ` · แก้บิล ${toUpdate.length}` : ""}`
      : toUpdate.length > 0
        ? `บันทึกเลขใหม่ · แก้บิล ${toUpdate.length} ห้อง`
        : "กรอกเลขมิเตอร์เพื่อออกบิล";

  return (
    <div className="space-y-5">
      {result ? (
        <div className="card space-y-1 p-4">
          <p className="text-[15px] font-bold text-ok">
            {[
              result.created ? `ออกบิลแล้ว ${result.created} ห้อง รวม ${baht(result.total)} บาท` : null,
              result.updated ? `แก้บิล ${result.updated} ห้อง` : null,
              result.saved ? `บันทึกเลขไว้ ${result.saved} ห้อง` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "ไม่มีอะไรเปลี่ยน"}
          </p>
          {result.skipped.length > 0 || result.warnings.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
              {result.skipped.map((s) => <li key={s}>ข้าม — {s}</li>)}
              {result.warnings.map((s) => <li key={s} className="text-[#96690f]">{s}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {pendingCount === 0 && rows.length > 0 ? (
        <div className="card px-5 py-4 text-center">
          <p className="font-semibold">ออกบิลรอบ {cycleLabel(cycle, "full")} ครบทุกห้องแล้ว</p>
          <p className="mt-1 text-[13px] text-muted">จดเลขใหม่ได้ ระบบแก้ค่าไฟค่าน้ำในบิลให้</p>
        </div>
      ) : null}

      <div className="space-y-2.5">
        {preview.map(({ row, entry, ready: rowReady, changed, elecUnits, waterUnits, total, elecPrevious, waterPrevious, prevEdited }) => (
          <div
            key={row.roomId}
            className={`card p-4 ${(!row.bill && rowReady) || (row.bill && changed) ? "ring-1 ring-accent/30" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] font-bold tracking-tight">
                  ห้อง {row.roomNo}
                  <span className="ml-2 text-[12px] font-medium text-muted">ชั้น {row.floor}</span>
                </p>
                <p className="truncate text-[13px] text-muted">{row.tenantName}</p>
              </div>
              <p className={`shrink-0 text-[16px] font-bold ${rowReady ? "text-accent-strong" : "text-muted"}`}>
                {baht(row.bill && !changed ? row.bill.total : total)} ฿
              </p>
            </div>

            {/* ออกบิลแล้วแค่บอกสถานะ ไม่ซ่อนห้อง — จดเลขใหม่ได้ตลอด */}
            {row.bill ? (
              <Link
                href={`/bills/${encodeURIComponent(row.bill.id)}`}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold"
              >
                <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[row.bill.status]}`}>
                  ออกบิลแล้ว · {BILL_STATUS_LABEL[row.bill.status]}
                </span>
                <span className="text-muted underline underline-offset-2">{row.bill.billNo}</span>
              </Link>
            ) : row.saved && !changed ? (
              <p className="mt-2 text-[12px] font-semibold text-muted">
                <span className="rounded-full bg-surface-2 px-2 py-0.5">จดเลขไว้แล้ว · ยังไม่ออกบิล</span>
              </p>
            ) : null}
            {row.otherBillNos.length > 0 ? (
              <p className="mt-1 text-[11px] text-muted">บิลอื่นของรอบนี้: {row.otherBillNos.join(", ")}</p>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-3">
              {/* เลขเดิมแก้ได้ เผื่อรอบก่อนจดผิด — ปกติไม่ต้องแตะ ค่าที่โชว์คือของรอบก่อน */}
              <label className="block">
                <span className="mb-1 flex items-baseline justify-between gap-1 text-[11px] text-muted">
                  <span>มิเตอร์ไฟ</span>
                  <span className="flex items-baseline gap-1">
                    เดิม
                    <input
                      type="text" inputMode="numeric" aria-label={`แก้เลขมิเตอร์ไฟเดิมของห้อง ${row.roomNo}`}
                      value={entry.elecPrev} onChange={(e) => update(row.roomId, "elecPrev", e.target.value)}
                      className="w-14 rounded-md bg-surface-2 px-1.5 py-0.5 text-right text-[11px] tabular-nums outline-none focus:bg-accent-soft"
                    />
                  </span>
                </span>
                <input
                  type="text" inputMode="numeric" placeholder={String(elecPrevious)}
                  value={entry.elec} onChange={(e) => update(row.roomId, "elec", e.target.value)}
                  className={input}
                />
                <span className="mt-1 block text-right text-[11px] text-muted">
                  {entry.elec ? `${elecUnits} หน่วย × ${row.elecRate} = ${baht(elecUnits * row.elecRate)} ฿` : "ยังไม่จด"}
                </span>
              </label>

              <label className="block">
                <span className="mb-1 flex items-baseline justify-between gap-1 text-[11px] text-muted">
                  <span>มิเตอร์น้ำ</span>
                  <span className="flex items-baseline gap-1">
                    เดิม
                    <input
                      type="text" inputMode="numeric" aria-label={`แก้เลขมิเตอร์น้ำเดิมของห้อง ${row.roomNo}`}
                      value={entry.waterPrev} onChange={(e) => update(row.roomId, "waterPrev", e.target.value)}
                      className="w-14 rounded-md bg-surface-2 px-1.5 py-0.5 text-right text-[11px] tabular-nums outline-none focus:bg-accent-soft"
                    />
                  </span>
                </span>
                <input
                  type="text" inputMode="numeric" placeholder={String(waterPrevious)}
                  value={entry.water} onChange={(e) => update(row.roomId, "water", e.target.value)}
                  className={input}
                />
                <span className="mt-1 block text-right text-[11px] text-muted">
                  {entry.water ? `${waterUnits} หน่วย × ${row.waterRate} = ${baht(waterUnits * row.waterRate)} ฿` : "ยังไม่จด"}
                </span>
              </label>
            </div>

            {prevEdited ? (
              <p className="mt-2 text-[11px] font-semibold text-[#96690f]">
                แก้เลขเดิมจากที่ระบบจำไว้ ({row.elecPrevious} / {row.waterPrevious}) มีผลกับบิลใบนี้เท่านั้น
              </p>
            ) : null}

            {row.bill && changed ? (
              <p className="mt-2 text-[11px] font-semibold text-accent-strong">
                เลขใหม่ต่างจากในบิล — บันทึกแล้วระบบแก้ค่าไฟค่าน้ำใน {row.bill.billNo} ให้
              </p>
            ) : null}

            {!row.bill && row.carryOver > 0 ? (
              <p className="mt-2 text-[12px] font-semibold text-danger">
                ยกยอดค้างเดิม {baht(row.carryOver)} บาทเข้าบิลนี้
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl bg-danger/10 px-4 py-3 text-center text-[13px] font-semibold text-danger">{error}</p>
      ) : null}

      <div className="sticky bottom-24 z-20 space-y-2">
        {toSave.length > 0 ? (
          <button
            type="button"
            onClick={() => submit("save")}
            disabled={busy}
            className="w-full rounded-2xl bg-surface px-5 py-3 text-[14px] font-bold shadow-[0_10px_30px_-14px_rgb(0_0_0/0.5)] disabled:opacity-60"
          >
            บันทึกเลขไว้ก่อน ยังไม่ออกบิล ({toSave.length} ห้อง)
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => submit("issue")}
          disabled={busy || (toIssue.length === 0 && toUpdate.length === 0)}
          className="w-full rounded-2xl bg-accent px-5 py-4 text-[15px] font-bold text-white shadow-[0_10px_30px_-12px_rgb(232_112_58/0.95)] disabled:bg-muted disabled:shadow-none"
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
