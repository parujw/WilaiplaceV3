"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Field, Ghost, Input, Select, Submit, send } from "@/components/form";
import Link from "next/link";
import { EDITABLE_LINE_TYPES, LINE_TYPE_LABEL, round2 } from "@/lib/bill-edit";
import { meterUnits, type MeterValues } from "@/lib/billing";
import { BILL_STATUS_LABEL, baht, cycleLabel } from "@/lib/format";
import type { BillLineType, BillStatus, Rates } from "@/lib/types";

/**
 * ออกบิลใบเดียวแบบกรอกรายการเอง
 *
 * หน้าจดมิเตอร์ออกบิลค่าเช่าทั้งตึกเดือนละครั้งและคิดรายการให้เอง
 * แต่ของจริงมีใบที่ไม่เข้ารอบนั้น — ค่ามัดจำตอนจอง ค่าซ่อม ค่าปรับ บิลย้อนหลัง
 * เดิมปุ่มออกบิลพาไปหน้าจดมิเตอร์อย่างเดียว ใบพวกนี้จึงออกไม่ได้เลย
 *
 * เลือกห้องกับรอบแล้วเติมรายการให้เอง — ค่าเช่า ค่าบริการรายเดือน ยอดค้าง
 * และค่าไฟค่าน้ำถ้าจดมิเตอร์รอบนั้นไว้แล้ว ไม่ต้องพิมพ์ทีละบรรทัด
 * ห้องที่ออกบิลค่าเช่ารอบนั้นไปแล้วไม่บล็อก แค่บอกสถานะให้เห็น เพราะใบเพิ่มมีจริง
 */

export interface RoomChoice {
  id: string;
  roomNo: string;
  tenantId: string | null;
  tenantName: string | null;
  rent: number;
  deposit: number;
  /** ค่าต่อหน่วยของสัญญา — null = ห้องว่าง */
  rates: Rates | null;
}

/** สถานะของห้องหนึ่งในรอบหนึ่ง */
export interface CycleInfo {
  /** จดมิเตอร์รอบนี้ไว้แล้ว */
  reading: MeterValues | null;
  /** เลขล่าสุดก่อนรอบนี้ — บอกให้รู้ว่าครั้งก่อนอยู่ที่เท่าไหร่ */
  previous: { elec: number; water: number } | null;
  carryOver: number;
  rentBill: { id: string; billNo: string; status: BillStatus } | null;
  otherBills: string[];
}

interface Row {
  key: string;
  type: BillLineType;
  label: string;
  qty: string;
  rate: string;
}

let nextKey = 0;
const row = (type: BillLineType, label: string, rate: number | string = ""): Row => ({
  key: `r${nextKey++}`,
  type,
  label,
  qty: "1",
  rate: String(rate),
});

/** เลขมิเตอร์ที่กรอกในฟอร์ม — เก็บเป็นข้อความ ช่องว่างคือยังไม่กรอก ไม่ใช่ 0 */
interface MeterInput {
  elecPrev: string;
  elec: string;
  waterPrev: string;
  water: string;
}

/** เลขตั้งต้นของห้องในรอบนั้น — จดไว้แล้วใช้ของที่จด ยังไม่จดเอาเลขครั้งก่อนมาใส่ให้ */
function meterOf(info: CycleInfo | undefined): MeterInput {
  const text = (n: number | undefined) => (n === undefined ? "" : String(n));
  return {
    elecPrev: text(info?.reading?.elecPrevious ?? info?.previous?.elec),
    elec: text(info?.reading?.elecCurrent),
    waterPrev: text(info?.reading?.waterPrevious ?? info?.previous?.water),
    water: text(info?.reading?.waterCurrent),
  };
}

/** เลขครบทั้งสี่ช่อง — ใช้คิดหน่วยและบันทึกเป็นการจดมิเตอร์ของรอบนี้ได้ */
function meterValues(m: MeterInput): MeterValues | null {
  const fields = [m.elecPrev, m.elec, m.waterPrev, m.water];
  if (fields.some((f) => f.trim() === "" || !Number.isFinite(Number(f)))) return null;
  return {
    elecPrevious: Number(m.elecPrev),
    elecCurrent: Number(m.elec),
    waterPrevious: Number(m.waterPrev),
    waterCurrent: Number(m.water),
  };
}

/**
 * ใส่ค่าไฟค่าน้ำตามเลขมิเตอร์ที่กรอก แทนของเดิมที่ตำแหน่งเดิม
 * ค่าต่อหน่วยใช้ของที่อยู่ในรายการ ถ้าแก้ราคาเองไว้ก็ไม่โดนทับ
 * ยังกรอกเลขไม่ครบ เหลือช่องไว้ให้ใส่จำนวนหน่วยเองได้ ไม่ใส่ก็ไม่ขึ้นบนบิล
 */
function withMeterRows(rows: Row[], m: MeterInput, rates: Rates): Row[] {
  const isMeter = (r: Row) => r.type === "electricity" || r.type === "water";
  const existing = (type: BillLineType) => rows.find((r) => r.type === type);

  const meterRow = (type: "electricity" | "water", name: string, prev: string, cur: string, rate: number): Row => {
    const old = existing(type);
    const unitRate = old?.rate || String(rate);
    const base = { ...row(type, name, unitRate), key: old?.key ?? row(type, name).key };
    if (prev.trim() === "" || cur.trim() === "") return { ...base, qty: old && !old.label.includes("→") ? old.qty : "" };
    return { ...base, label: `${name} (${prev} → ${cur})`, qty: String(meterUnits(Number(prev), Number(cur))) };
  };

  const firstMeter = rows.findIndex(isMeter);
  const at = firstMeter >= 0 ? firstMeter : rows.findIndex((r) => r.type === "rent") + 1;
  const insertAt = rows.slice(0, at).filter((r) => !isMeter(r)).length;
  const kept = rows.filter((r) => !isMeter(r));
  return [
    ...kept.slice(0, insertAt),
    meterRow("electricity", "ค่าไฟ", m.elecPrev, m.elec, rates.elec),
    meterRow("water", "ค่าน้ำ", m.waterPrev, m.water, rates.water),
    ...kept.slice(insertAt),
  ];
}

/** รายการเริ่มต้นของห้องในรอบนั้น — ห้องว่างเริ่มที่ค่ามัดจำ (คนจอง) */
function autoRows(room: RoomChoice | undefined, info: CycleInfo | undefined): Row[] {
  if (!room) return [];
  if (!room.rates || !room.tenantId) return [row("deposit", "ค่ามัดจำ", room.deposit || room.rent || "")];

  const rows: Row[] = [row("rent", "ค่าเช่าห้อง", room.rent)];
  if (room.rates.ac > 0) rows.push(row("ac", "ค่าเช่าแอร์", room.rates.ac));
  if (room.rates.internet > 0) rows.push(row("internet", "ค่าอินเทอร์เน็ต", room.rates.internet));
  if (room.rates.parking > 0) rows.push(row("parking", "ค่าที่จอดรถ", room.rates.parking));
  if (info && info.carryOver > 0) rows.push(row("carryOver", "ยอดค้างยกมา", info.carryOver));
  return withMeterRows(rows, meterOf(info), room.rates);
}

function amountOf(r: Row): number {
  const value = round2(Number(r.qty) * Number(r.rate));
  if (!Number.isFinite(value)) return 0;
  return r.type === "discount" ? -Math.abs(value) : value;
}

export function NewBillForm({
  rooms, tenants, cycles, info, defaultCycle, defaultRoom,
}: {
  rooms: RoomChoice[];
  tenants: Array<{ id: string; name: string }>;
  cycles: string[];
  info: Record<string, Record<string, CycleInfo>>;
  defaultCycle: string;
  defaultRoom: string;
}) {
  const router = useRouter();
  const [roomId, setRoomId] = useState(defaultRoom);
  const [cycle, setCycle] = useState(defaultCycle);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [tenantChoice, setTenantChoice] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    autoRows(rooms.find((r) => r.id === defaultRoom), info[defaultCycle]?.[defaultRoom]),
  );
  const [meter, setMeter] = useState<MeterInput>(() => meterOf(info[defaultCycle]?.[defaultRoom]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const room = rooms.find((r) => r.id === roomId);
  const status = info[cycle]?.[roomId];

  // เปลี่ยนห้องหรือรอบ = เติมรายการใหม่ของห้องนั้นรอบนั้น
  function choose(nextRoom: string, nextCycle: string) {
    setRoomId(nextRoom);
    setCycle(nextCycle);
    setRows(autoRows(rooms.find((r) => r.id === nextRoom), info[nextCycle]?.[nextRoom]));
    setMeter(meterOf(info[nextCycle]?.[nextRoom]));
  }

  function changeMeter(field: keyof MeterInput, value: string) {
    const next = { ...meter, [field]: value.replace(/[^\d.]/g, "") };
    setMeter(next);
    if (room?.rates) setRows((prev) => withMeterRows(prev, next, room.rates!));
  }
  const meterReady = meterValues(meter);
  const total = round2(rows.reduce((sum, r) => sum + amountOf(r), 0));
  const patch = (key: string, field: keyof Row, value: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  // ห้องว่างไม่มีผู้เช่าให้ใช้ชื่อ ต้องพิมพ์เอง (เช่น คนจองที่ยังไม่ย้ายเข้า)
  const needsName = Boolean(room && !room.tenantId && !tenantChoice);

  const presets: Array<[string, () => Row]> = [
    ["ค่ามัดจำ", () => row("deposit", "ค่ามัดจำ", room?.deposit || room?.rent || "")],
    ["ค่าเช่าห้อง", () => row("rent", "ค่าเช่าห้อง", room?.rent ?? "")],
    ["ค่าซ่อม", () => row("other", "ค่าซ่อมแซม")],
    ["ค่าปรับ", () => row("other", "ค่าปรับชำระล่าช้า")],
    ["ส่วนลด", () => row("discount", "ส่วนลด")],
  ];

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await send("/api/bills", "POST", {
            roomId,
            cycle,
            dueDate: dueDate || undefined,
            note,
            tenantId: tenantChoice || undefined,
            tenantName: needsName ? tenantName : undefined,
            // เลขครบก็บันทึกเป็นการจดมิเตอร์ของรอบนี้ด้วย เลขครั้งก่อนของเดือนหน้าจะได้ถูก
            meter: room?.tenantId && meterReady ? meterReady : undefined,
            lines: rows
              // ช่องค่าไฟค่าน้ำที่เติมไว้ให้แต่ไม่ได้กรอกหน่วย ไม่ต้องขึ้นบนบิลเป็นบรรทัด 0 บาท
              .filter((r) => !((r.type === "electricity" || r.type === "water") && amountOf(r) === 0))
              .map(({ type, label, qty, rate }) => ({ type, label, qty, rate })),
          });
          router.replace(`/bills/${encodeURIComponent(String(res.billId))}`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "ออกบิลไม่สำเร็จ");
          setBusy(false);
        }
      }}
      className="space-y-3"
    >
      <div className="card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="ห้อง">
            <Select value={roomId} onChange={(e) => { choose(e.target.value, cycle); setTenantChoice(""); }} required>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  ห้อง {r.roomNo}{r.tenantName ? ` · ${r.tenantName}` : " · ว่าง"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="รอบบิล">
            <Select value={cycle} onChange={(e) => choose(roomId, e.target.value)}>
              {cycles.map((c) => (
                <option key={c} value={c}>{cycleLabel(c, "full")}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="ออกบิลในชื่อ"
          hint={room?.tenantName ? `ไม่เลือก = ${room.tenantName} ที่อยู่ห้องนี้` : "ห้องนี้ว่าง ต้องระบุชื่อผู้รับบิล"}
        >
          <Select value={tenantChoice} onChange={(e) => setTenantChoice(e.target.value)}>
            <option value="">{room?.tenantName ? `${room.tenantName} (ผู้เช่าปัจจุบัน)` : "— พิมพ์ชื่อเอง —"}</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>

        {needsName ? (
          <Field label="ชื่อผู้รับบิล" hint="ใช้กับคนที่ยังไม่ได้เป็นผู้เช่าในระบบ เช่น คนจองห้อง">
            <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="คุณสมชาย ใจดี" required />
          </Field>
        ) : null}
      </div>

      {status && room?.tenantId ? (
        <div className="card space-y-1.5 p-4 text-[13px]">
          <p className="text-[12px] font-bold text-muted">ห้อง {room.roomNo} · รอบ {cycleLabel(cycle, "full")}</p>
          {status.rentBill ? (
            <p className="rounded-xl bg-warn/10 px-3 py-2 font-semibold text-[#96690f]">
              ออกบิลค่าเช่ารอบนี้แล้ว ·{" "}
              <Link href={`/bills/${encodeURIComponent(status.rentBill.id)}`} className="underline underline-offset-2">
                {status.rentBill.billNo}
              </Link>{" "}
              ({BILL_STATUS_LABEL[status.rentBill.status]}) — ใบนี้จะเป็นบิลเพิ่ม ถ้าจะแก้ยอดให้แก้ที่บิลเดิม
            </p>
          ) : (
            <p className="text-muted">ยังไม่ออกบิลค่าเช่ารอบนี้</p>
          )}
          {status.reading ? (
            <p>
              จดมิเตอร์แล้ว · ไฟ {status.reading.elecPrevious} → {status.reading.elecCurrent} · น้ำ{" "}
              {status.reading.waterPrevious} → {status.reading.waterCurrent}
            </p>
          ) : (
            <p className="text-muted">
              ยังไม่จดมิเตอร์รอบนี้
              {status.previous ? ` · ครั้งก่อน ไฟ ${status.previous.elec} น้ำ ${status.previous.water}` : ""} — กรอกเลขในช่องมิเตอร์ด้านล่าง หรือ{" "}
              <Link href={`/meter?cycle=${cycle}`} className="font-semibold text-accent">ไปจดมิเตอร์</Link>
            </p>
          )}
          {status.otherBills.length > 0 ? (
            <p className="text-muted">บิลอื่นของรอบนี้: {status.otherBills.join(", ")}</p>
          ) : null}
        </div>
      ) : null}

      {room?.rates && room.tenantId ? (
        <div className="card space-y-3 p-4">
          <h2 className="text-[15px] font-bold tracking-tight">มิเตอร์รอบนี้</h2>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["ไฟ", "elecPrev", "elec", room.rates.elec],
              ["น้ำ", "waterPrev", "water", room.rates.water],
            ] as const).map(([name, prevKey, curKey, rate]) => {
              const units =
                meter[prevKey] !== "" && meter[curKey] !== ""
                  ? meterUnits(Number(meter[prevKey]), Number(meter[curKey]))
                  : null;
              return (
                <div key={name} className="space-y-1.5">
                  <p className="text-[12px] font-semibold text-muted">มิเตอร์{name}</p>
                  {/* ช่องที่มีเลขอยู่แล้วไม่เห็น placeholder ต้องมีป้ายกำกับไว้ข้างช่องเสมอ */}
                  <label className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[11px] text-muted">ครั้งก่อน</span>
                    <Input
                      inputMode="numeric" value={meter[prevKey]}
                      onChange={(e) => changeMeter(prevKey, e.target.value)}
                      aria-label={`เลขมิเตอร์${name}ครั้งก่อน`} className="!py-2 text-right text-[13px] tabular-nums"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[11px] font-semibold">ครั้งนี้</span>
                    <Input
                      inputMode="numeric" value={meter[curKey]}
                      onChange={(e) => changeMeter(curKey, e.target.value)}
                      aria-label={`เลขมิเตอร์${name}ครั้งนี้`} className="text-right font-semibold tabular-nums"
                    />
                  </label>
                  <p className="text-right text-[11px] text-muted">
                    {units === null ? "ยังไม่จด" : `${units} หน่วย × ${rate} = ${baht(units * rate)} ฿`}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            {status?.rentBill
              ? `รอบนี้ออกบิลค่าเช่าแล้ว (${status.rentBill.billNo}) เลขที่กรอกตรงนี้ใช้คิดในใบนี้เท่านั้น ถ้าจะแก้เลขมิเตอร์ให้แก้ที่หน้าจดมิเตอร์`
              : "กรอกครบทั้งไฟและน้ำ ระบบบันทึกเป็นเลขมิเตอร์ของรอบนี้ด้วย เดือนหน้าจะได้เลขครั้งก่อนถูก"}
          </p>
        </div>
      ) : null}

      <div className="card space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold tracking-tight">รายการในบิล</h2>
          <button
            type="button"
            onClick={() => {
              setRows(autoRows(room, status));
              setMeter(meterOf(status));
            }}
            className="text-[12px] font-semibold text-accent"
          >
            เติมรายการใหม่
          </button>
        </div>

        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {presets.map(([label, make]) => (
            <button
              key={label}
              type="button"
              onClick={() => setRows((prev) => [...prev, make()])}
              className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent-strong"
            >
              + {label}
            </button>
          ))}
        </div>

        {rows.map((r) => (
          <div key={r.key} className="rounded-xl bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <Select
                value={r.type}
                onChange={(e) => patch(r.key, "type", e.target.value)}
                className="!w-auto !bg-surface !py-2 text-[13px]"
              >
                {EDITABLE_LINE_TYPES.map((t) => (
                  <option key={t} value={t}>{LINE_TYPE_LABEL[t]}</option>
                ))}
              </Select>
              <span className="ml-auto text-[15px] font-bold tabular-nums">{baht(amountOf(r))}</span>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                aria-label="ลบรายการนี้"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-[18px] font-bold text-danger"
              >
                ×
              </button>
            </div>
            <div className="mt-2 space-y-2">
              <Input
                value={r.label}
                onChange={(e) => patch(r.key, "label", e.target.value)}
                placeholder="ชื่อรายการที่จะขึ้นบนใบแจ้งหนี้"
                className="!bg-surface !py-2.5 text-[14px]"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number" inputMode="decimal" min="0" step="any" value={r.qty}
                  onChange={(e) => patch(r.key, "qty", e.target.value)}
                  aria-label="จำนวน" className="!bg-surface !py-2.5 text-[14px]"
                />
                <Input
                  type="number" inputMode="decimal" step="any" value={r.rate}
                  onChange={(e) => patch(r.key, "rate", e.target.value)}
                  aria-label="ราคาต่อหน่วย" placeholder="ราคา" className="!bg-surface !py-2.5 text-[14px]"
                  required
                />
              </div>
              <p className="text-[11px] text-muted">จำนวน × ราคาต่อหน่วย</p>
            </div>
          </div>
        ))}

        <Ghost onClick={() => setRows((prev) => [...prev, row("other", "")])}>+ เพิ่มรายการเปล่า</Ghost>

        <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-[14px] text-muted">ยอดรวม</span>
          <strong className="text-[19px]">{baht(total)} ฿</strong>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="ครบกำหนดชำระ" hint="เว้นว่าง = คิดจากรอบบิล">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="หมายเหตุ">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น มัดจำจองห้อง" />
          </Field>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Submit busy={busy} disabled={total <= 0 || rows.length === 0 || !roomId}>
        ออกบิล {total > 0 ? `${baht(total)} ฿` : ""}
      </Submit>
    </form>
  );
}
