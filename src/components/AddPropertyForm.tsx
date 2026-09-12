"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** เพิ่มอาคารใหม่ในเครือ Wilai Communities */
export function AddPropertyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", shortName: "", address: "", phone: "", floors: "1" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] outline-none focus:border-accent";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, floors: Number(form.floors) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "เพิ่มอาคารไม่สำเร็จ");
      setOpen(false);
      setForm({ id: "", name: "", shortName: "", address: "", phone: "", floors: "1" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มอาคารไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-line py-4 text-[14px] font-bold text-muted"
      >
        + เพิ่มอาคารในเครือ
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="text-[16px] font-bold tracking-tight">เพิ่มอาคารใหม่</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">รหัสอาคาร</span>
          <input
            value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })}
            placeholder="wlp2" className={field} required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">ตัวย่อ</span>
          <input
            value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })}
            placeholder="WLP2" className={field}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-[12px] text-muted">ชื่ออาคาร</span>
        <input
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="วิไลเพลส 2" className={field} required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12px] text-muted">ที่อยู่</span>
        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">โทรศัพท์</span>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">จำนวนชั้น</span>
          <input
            value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })}
            inputMode="numeric" className={field}
          />
        </label>
      </div>

      {error ? <p className="text-[13px] font-semibold text-danger">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-surface-2 py-3 text-[14px] font-bold">
          ยกเลิก
        </button>
        <button type="submit" disabled={busy} className="rounded-xl bg-accent py-3 text-[14px] font-bold text-white disabled:opacity-60">
          {busy ? "กำลังเพิ่ม…" : "เพิ่มอาคาร"}
        </button>
      </div>
    </form>
  );
}
