"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { downscaleImage } from "@/lib/image";
import { IconCamera } from "./icons";
import { PropertyImage } from "./ui";

export function PropertyEditor({
  propertyId, name, address, phone, photoUrl,
}: {
  propertyId: string;
  name: string;
  address: string;
  phone: string;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name, address, phone });
  const [preview, setPreview] = useState(photoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const field = "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] outline-none focus:border-accent";

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/properties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
  }

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await downscaleImage(file, 1024, 0.8);
      setPreview(dataUrl);
      await patch({ photoDataUrl: dataUrl });
      router.refresh();
    } catch (err) {
      setPreview(photoUrl);
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await patch(form);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card overflow-hidden">
      <div className="relative h-36">
        <PropertyImage photoUrl={preview} name={form.name} />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          aria-label="เปลี่ยนรูปอาคาร"
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-[12px] font-bold text-ink shadow-[0_2px_10px_rgb(0_0_0/0.2)] disabled:opacity-60"
        >
          <IconCamera className="h-4 w-4" />
          {preview ? "เปลี่ยนรูป" : "เพิ่มรูปอาคาร"}
        </button>
        <input ref={fileInput} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
      </div>

      <div className="space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">ชื่ออาคาร</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">ที่อยู่</span>
          <input
            value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="V2 ไม่มีข้อมูลนี้ กรอกเพิ่มได้" className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">โทรศัพท์</span>
          <input
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            inputMode="tel" className={field}
          />
        </label>

        {error ? <p className="text-[13px] font-semibold text-danger">{error}</p> : null}
        {saved ? <p className="text-[13px] font-semibold text-ok">บันทึกแล้ว</p> : null}

        <button
          type="submit" disabled={busy}
          className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy ? "กำลังบันทึก…" : "บันทึกข้อมูลอาคาร"}
        </button>
      </div>
    </form>
  );
}
