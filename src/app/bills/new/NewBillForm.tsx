"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Field, Ghost, Input, Select, Submit, send } from "@/components/form";
import { EDITABLE_LINE_TYPES, LINE_TYPE_LABEL, round2 } from "@/lib/bill-edit";
import { baht, cycleLabel } from "@/lib/format";
import type { BillLineType } from "@/lib/types";

/**
 * ออกบิลใบเดียวแบบกรอกรายการเอง
 *
 * หน้าจดมิเตอร์ออกบิลค่าเช่าทั้งตึกเดือนละครั้งและคิดรายการให้เอง
 * แต่ของจริงมีใบที่ไม่เข้ารอบนั้น — ค่ามัดจำตอนจอง ค่าซ่อม ค่าปรับ บิลย้อนหลัง
 * เดิมปุ่มออกบิลพาไปหน้าจดมิเตอร์อย่างเดียว ใบพวกนี้จึงออกไม่ได้เลย
 */

export interface RoomChoice {
  id: string;
  roomNo: string;
  tenantId: string | null;
  tenantName: string | null;
  rent: number;
  deposit: number;
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

function amountOf(r: Row): number {
  const value = round2(Number(r.qty) * Number(r.rate));
  if (!Number.isFinite(value)) return 0;
  return r.type === "discount" ? -Math.abs(value) : value;
}

export function NewBillForm({
  rooms, tenants, cycles,
}: {
  rooms: RoomChoice[];
  tenants: Array<{ id: string; name: string }>;
  cycles: string[];
}) {
  const router = useRouter();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [cycle, setCycle] = useState(cycles[0] ?? "");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [tenantChoice, setTenantChoice] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [rows, setRows] = useState<Row[]>([row("deposit", "ค่ามัดจำ")]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const room = rooms.find((r) => r.id === roomId);
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
            lines: rows.map(({ type, label, qty, rate }) => ({ type, label, qty, rate })),
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
            <Select value={roomId} onChange={(e) => { setRoomId(e.target.value); setTenantChoice(""); }} required>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  ห้อง {r.roomNo}{r.tenantName ? ` · ${r.tenantName}` : " · ว่าง"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="รอบบิล">
            <Select value={cycle} onChange={(e) => setCycle(e.target.value)}>
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

      <div className="card space-y-3 p-4">
        <h2 className="text-[15px] font-bold tracking-tight">รายการในบิล</h2>

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
