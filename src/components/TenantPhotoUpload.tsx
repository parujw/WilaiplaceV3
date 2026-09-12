"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { downscaleImage } from "@/lib/image";
import { IconCamera } from "./icons";
import { Avatar } from "./ui";

export function TenantPhotoUpload({
  tenantId, name, photoUrl,
}: { tenantId: string; name: string; photoUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(photoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      const dataUrl = await downscaleImage(file);
      setPreview(dataUrl);
      const res = await fetch(`/api/tenants/${tenantId}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "อัปโหลดไม่สำเร็จ");
      setPreview(json.photoUrl);
      router.refresh();
    } catch (err) {
      setPreview(photoUrl);
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/photo`, { method: "DELETE" });
      if (!res.ok) throw new Error("ลบรูปไม่สำเร็จ");
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative">
        <Avatar name={name} photoUrl={preview} size={96} className={busy ? "opacity-50" : ""} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label="เปลี่ยนรูปผู้เช่า"
          className="absolute -bottom-0.5 -right-0.5 grid h-9 w-9 place-items-center rounded-full bg-accent text-white ring-4 ring-surface transition active:scale-95 disabled:opacity-60"
        >
          <IconCamera className="h-[18px] w-[18px]" />
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="hidden"
      />

      {preview ? (
        <button type="button" onClick={onRemove} disabled={busy} className="text-[12px] text-muted underline underline-offset-4">
          ลบรูป
        </button>
      ) : (
        <p className="text-[12px] text-muted">แตะกล้องเพื่อเพิ่มรูป</p>
      )}

      {error ? <p className="text-center text-[12px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}
