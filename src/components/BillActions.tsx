"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BillActions({
  billId, balance, canVoid, invoiceUrl, printUrl,
}: { billId: string; balance: number; canVoid: boolean; invoiceUrl: string; printUrl: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState("transfer");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId, amount: Number(amount), method, paidAt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setDone(`บันทึกแล้ว ใบเสร็จ ${json.receiptNo}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function submitVoid() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bills/${billId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "ยกเลิกไม่สำเร็จ");
      setVoiding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] outline-none focus:border-accent";

  return (
    <div className="space-y-3">
      {balance > 0 ? (
        <form onSubmit={submitPayment} className="card space-y-3 p-4">
          <h3 className="text-[16px] font-bold tracking-tight">บันทึกรับชำระ</h3>
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">จำนวนเงิน (บาท)</span>
            <input
              type="number" inputMode="decimal" min="1" max={balance} step="1"
              value={amount} onChange={(e) => setAmount(e.target.value)} className={field} required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">วิธีชำระ</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
                <option value="transfer">โอนธนาคาร</option>
                <option value="cash">เงินสด</option>
                <option value="promptpay">พร้อมเพย์</option>
                <option value="other">อื่นๆ</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">วันที่ชำระ</span>
              <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={field} />
            </label>
          </div>
          <button
            type="submit" disabled={busy}
            className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
          >
            {busy ? "กำลังบันทึก…" : "บันทึกรับชำระ"}
          </button>
        </form>
      ) : null}

      <a
        href={printUrl} target="_blank" rel="noreferrer"
        className="block rounded-xl bg-surface py-3.5 text-center text-[14px] font-bold text-accent-strong shadow-[0_1px_2px_rgb(23_23_27/0.06)]"
      >
        พิมพ์ใบแจ้งหนี้ (A4)
      </a>

      {/* ปุ่ม "เปิดใบแจ้งหนี้" ถูกตัดออก เพราะกดแล้วได้ใบเดียวกับปุ่มพิมพ์ ต่างกันแค่การจัดหน้า
          ลิงก์ใบแจ้งหนี้ยังอยู่ แต่เป็นของไว้ส่งให้ผู้เช่า ไม่ใช่ของไว้เปิดดูเอง */}
      <button
        type="button"
        onClick={async () => {
          const url = new URL(invoiceUrl, window.location.origin).toString();
          try {
            await navigator.clipboard.writeText(url);
            setDone("คัดลอกลิงก์แล้ว ส่งให้ผู้เช่าทาง LINE ได้เลย");
          } catch {
            // บางเบราว์เซอร์ห้ามคัดลอกถ้าไม่ได้เปิดผ่าน https — โชว์ลิงก์ให้กดค้างคัดลอกเองแทน
            setError(`คัดลอกอัตโนมัติไม่ได้ ลิงก์คือ ${url}`);
          }
        }}
        className="w-full rounded-xl bg-surface py-3.5 text-[14px] font-bold text-ink-2 shadow-[0_1px_2px_rgb(23_23_27/0.06)]"
      >
        คัดลอกลิงก์ใบแจ้งหนี้
      </button>

      {canVoid ? (
        voiding ? (
          <div className="card space-y-3 p-4">
            <h3 className="text-[15px] font-bold">ยกเลิกบิล</h3>
            <p className="text-[12px] text-muted">บิลจะไม่ถูกลบ แต่เปลี่ยนสถานะเป็นยกเลิกและบันทึกเหตุผลไว้</p>
            <input
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="เหตุผลที่ยกเลิก" className={field}
            />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setVoiding(false)} className="rounded-xl bg-surface-2 py-3 text-[14px] font-bold">
                ไม่ยกเลิก
              </button>
              <button
                type="button" onClick={submitVoid} disabled={busy || !reason.trim()}
                className="rounded-xl bg-danger py-3 text-[14px] font-bold text-white disabled:opacity-50"
              >
                ยืนยันยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setVoiding(true)} className="w-full py-2 text-[13px] font-medium text-danger underline underline-offset-4">
            ยกเลิกบิลนี้
          </button>
        )
      ) : null}

      {done ? <p className="rounded-xl bg-ok/10 px-4 py-3 text-center text-[13px] font-semibold text-ok">{done}</p> : null}
      {error ? <p className="rounded-xl bg-danger/10 px-4 py-3 text-center text-[13px] font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
