"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Expander, Field, Ghost, Input, Select, Submit, send } from "./form";
import { EDITABLE_LINE_TYPES, LINE_TYPE_LABEL, round2 } from "@/lib/bill-edit";
import { baht } from "@/lib/format";
import type { Bill, BillLine } from "@/lib/types";

/**
 * แก้บิลที่ออกไปแล้ว และลบบิลที่ไม่ควรมีตั้งแต่แรก
 *
 * บิลออกผิดมีสองแบบ ต้องแยกกันให้ชัด ไม่งั้นบัญชีจะเล่าเรื่องผิด
 *   ตัวเลขผิด        จดมิเตอร์ผิด ลืมส่วนลด คิดค่าแอร์ทั้งที่ถอดไปแล้ว
 *                    → แก้รายการในใบเดิม เลขที่บิลคงเดิม แล้วพิมพ์ใบใหม่ทับ
 *   ไม่ควรมีใบนี้     ออกซ้ำ ออกให้ห้องว่าง ออกผิดคน
 *                    → ยกเลิก (เก็บไว้เป็นประวัติ) หรือลบทิ้ง (เจ้าของเท่านั้น)
 *
 * ทั้งสองทางทำให้ยอดไม่ค้างเหมือนกัน ต่างกันที่ยังเห็นในรายการไหม
 */

interface Row {
  key: string;
  type: string;
  label: string;
  qty: string;
  rate: string;
}

let nextKey = 0;
const rowFrom = (line: BillLine): Row => ({
  key: `r${nextKey++}`,
  type: line.type,
  label: line.label,
  qty: String(line.qty),
  // ส่วนลดเก็บเป็นค่าติดลบ แต่กรอกเป็นบวกอ่านง่ายกว่า
  rate: String(line.type === "discount" ? Math.abs(line.rate) : line.rate),
});

function rowAmount(row: Row): number {
  const amount = round2(Number(row.qty) * Number(row.rate));
  if (!Number.isFinite(amount)) return 0;
  return row.type === "discount" ? -Math.abs(amount) : amount;
}

function EditForm({ bill, close }: { bill: Bill; close: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(bill.lines.map(rowFrom));
  const [dueDate, setDueDate] = useState(bill.dueDate);
  const [note, setNote] = useState(bill.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = round2(rows.reduce((sum, r) => sum + rowAmount(r), 0));
  const balance = round2(total - bill.paid);

  const patch = (key: string, field: keyof Row, value: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await send(`/api/bills/${encodeURIComponent(bill.id)}`, "PATCH", {
            lines: rows.map(({ type, label, qty, rate }) => ({ type, label, qty, rate })),
            dueDate,
            note,
          });
          close();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
        } finally {
          setBusy(false);
        }
      }}
      className="card space-y-3 p-4"
    >
      <h3 className="text-[16px] font-bold tracking-tight">แก้รายการในบิล</h3>
      <p className="text-[12px] leading-relaxed text-muted">
        เลขที่บิล {bill.billNo} คงเดิม แก้เสร็จแล้วพิมพ์ใบแจ้งหนี้ใหม่ส่งให้ผู้เช่าแทนใบเดิม
      </p>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="rounded-xl bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <Select
                value={row.type}
                onChange={(e) => patch(row.key, "type", e.target.value)}
                className="!w-auto !bg-surface !py-2 text-[13px]"
              >
                {EDITABLE_LINE_TYPES.map((t) => (
                  <option key={t} value={t}>{LINE_TYPE_LABEL[t]}</option>
                ))}
              </Select>
              <span className="ml-auto text-[15px] font-bold tabular-nums">
                {baht(rowAmount(row))}
              </span>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                aria-label="ลบรายการนี้"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-[18px] font-bold text-danger"
              >
                ×
              </button>
            </div>
            <div className="mt-2 space-y-2">
              <Input
                value={row.label}
                onChange={(e) => patch(row.key, "label", e.target.value)}
                placeholder="ชื่อรายการที่จะขึ้นบนใบแจ้งหนี้"
                className="!bg-surface !py-2.5 text-[14px]"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number" inputMode="decimal" min="0" step="any" value={row.qty}
                  onChange={(e) => patch(row.key, "qty", e.target.value)}
                  aria-label="จำนวน" className="!bg-surface !py-2.5 text-[14px]"
                />
                <Input
                  type="number" inputMode="decimal" step="any" value={row.rate}
                  onChange={(e) => patch(row.key, "rate", e.target.value)}
                  aria-label="ราคาต่อหน่วย" className="!bg-surface !py-2.5 text-[14px]"
                />
              </div>
              <p className="text-[11px] text-muted">จำนวน × ราคาต่อหน่วย</p>
            </div>
          </div>
        ))}
      </div>

      <Ghost
        onClick={() =>
          setRows((prev) => [...prev, { key: `r${nextKey++}`, type: "other", label: "", qty: "1", rate: "0" }])
        }
      >
        + เพิ่มรายการ
      </Ghost>

      <div className="rounded-xl bg-surface-2 px-4 py-3">
        <div className="flex items-center justify-between text-[14px]">
          <span className="text-muted">ยอดรวมใหม่</span>
          <strong className="text-[17px]">{baht(total)} ฿</strong>
        </div>
        {bill.paid > 0 ? (
          <div className="mt-1 flex items-center justify-between text-[13px]">
            <span className="text-muted">ชำระแล้ว {baht(bill.paid)} · คงค้างใหม่</span>
            <strong className={balance < 0 ? "text-danger" : ""}>{baht(balance)} ฿</strong>
          </div>
        ) : null}
        {balance < 0 ? (
          <p className="mt-2 text-[12px] font-semibold text-danger">
            ยอดใหม่ต่ำกว่าที่รับเงินมาแล้ว ต้องลบใบเสร็จที่รับเกินก่อน
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ครบกำหนดชำระ">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="แก้เลขมิเตอร์" />
        </Field>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Ghost onClick={close} disabled={busy}>ยกเลิก</Ghost>
        <Submit busy={busy} disabled={balance < 0 || rows.length === 0}>บันทึกบิล</Submit>
      </div>
    </form>
  );
}

function DeleteForm({ bill, close }: { bill: Bill; close: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card space-y-3 p-4">
      <h3 className="text-[15px] font-bold">ลบบิลนี้ทิ้ง</h3>
      <p className="text-[12px] leading-relaxed text-muted">
        ใช้กับบิลที่ไม่ควรออกตั้งแต่แรก เช่น ออกซ้ำหรือออกให้ห้องว่าง บิลจะหายไปจากรายการทั้งหมด
        <br />
        ถ้าบิลใบนี้ออกจริงแต่ตัวเลขผิด ให้กด &ldquo;แก้รายการในบิล&rdquo; แทน
        หรือถ้าอยากเก็บไว้เป็นประวัติให้กด &ldquo;ยกเลิกบิลนี้&rdquo;
        <br />
        สำเนาบิลถูกบันทึกไว้ในประวัติการแก้ไขก่อนลบเสมอ
      </p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลที่ลบ" />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Ghost onClick={close} disabled={busy}>ไม่ลบ</Ghost>
        <Submit
          type="button"
          tone="danger"
          busy={busy}
          disabled={!reason.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await send(`/api/bills/${encodeURIComponent(bill.id)}`, "DELETE", { reason });
              router.replace("/bills");
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
              setBusy(false);
            }
          }}
        >
          ยืนยันลบถาวร
        </Submit>
      </div>
    </div>
  );
}

export function BillEditor({ bill, canDelete }: { bill: Bill; canDelete: boolean }) {
  return (
    <div className="space-y-3">
      {bill.status === "void" ? null : (
        <Expander label="แก้รายการในบิล">{(close) => <EditForm bill={bill} close={close} />}</Expander>
      )}
      {canDelete ? (
        <Expander label="ลบบิลนี้ทิ้ง (ออกผิดตั้งแต่แรก)" tone="danger">
          {(close) => <DeleteForm bill={bill} close={close} />}
        </Expander>
      ) : null}
    </div>
  );
}
