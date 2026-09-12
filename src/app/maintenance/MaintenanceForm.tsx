"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MaintenanceForm({ rooms }: { rooms: Array<{ id: string; roomNo: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [category, setCategory] = useState("ทั่วไป");
  const [problem, setProblem] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] outline-none focus:border-accent";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, category, problem, urgency }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setProblem("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl bg-accent px-5 py-3.5 text-[15px] font-bold text-white shadow-[0_8px_24px_-12px_rgb(232_112_58/0.9)]"
      >
        + แจ้งซ่อมใหม่
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h3 className="text-[16px] font-bold tracking-tight">แจ้งซ่อมใหม่</h3>
      <label className="block">
        <span className="mb-1 block text-[12px] text-muted">ห้อง</span>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={field}>
          {rooms.map((r) => <option key={r.id} value={r.id}>ห้อง {r.roomNo}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">หมวดหมู่</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {["ทั่วไป", "ไฟฟ้า", "ประปา", "แอร์", "ประตู/หน้าต่าง", "เฟอร์นิเจอร์"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">ความเร่งด่วน</span>
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className={field}>
            <option value="low">ไม่รีบ</option>
            <option value="normal">ปกติ</option>
            <option value="urgent">ด่วน</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-[12px] text-muted">ปัญหาที่พบ</span>
        <textarea
          value={problem} onChange={(e) => setProblem(e.target.value)} rows={3}
          placeholder="เช่น ก๊อกน้ำห้องน้ำรั่ว" className={field} required
        />
      </label>
      {error ? <p className="text-[13px] font-semibold text-danger">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-surface-2 py-3 text-[14px] font-bold">
          ยกเลิก
        </button>
        <button type="submit" disabled={busy} className="rounded-xl bg-accent py-3 text-[14px] font-bold text-white disabled:opacity-60">
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </form>
  );
}

export function StatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const next: Array<{ key: string; label: string }> =
    status === "open"
      ? [{ key: "in_progress", label: "เริ่มซ่อม" }, { key: "cancelled", label: "ยกเลิก" }]
      : status === "in_progress"
        ? [{ key: "done", label: "ปิดงาน" }]
        : [];

  if (next.length === 0) return null;

  async function change(value: string) {
    setBusy(true);
    await fetch("/api/maintenance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: value }),
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="mt-3 flex gap-2">
      {next.map((n) => (
        <button
          key={n.key}
          type="button"
          disabled={busy}
          onClick={() => change(n.key)}
          className="rounded-full bg-surface-2 px-3.5 py-2 text-[12px] font-bold text-ink-2 disabled:opacity-50"
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}
