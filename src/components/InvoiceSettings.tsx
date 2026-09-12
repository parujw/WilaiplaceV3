"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { downscaleImage } from "@/lib/image";
import { IconCamera } from "./icons";
import type { PaymentInfo } from "@/lib/types";

/**
 * ข้อมูลที่พิมพ์ลงใบแจ้งหนี้ A4 — ชื่อภาษาอังกฤษ ผู้จัดทำ และช่องทางรับชำระ
 * ทั้งหมดเป็นของอาคาร ไม่ใช่ของบิล จึงกรอกครั้งเดียวใช้กับทุกใบ
 */
export function InvoiceSettings({
  propertyId,
  nameEn,
  preparedBy,
  payment,
  printHref,
}: {
  propertyId: string;
  nameEn: string;
  preparedBy: string;
  payment: PaymentInfo | null;
  /** ลิงก์ดูตัวอย่างใบล่าสุด ไม่มีบิลก็ไม่ต้องส่งมา */
  printHref: string | null;
}) {
  const router = useRouter();
  const qrInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nameEn,
    preparedBy,
    method: payment?.method ?? "",
    accountName: payment?.accountName ?? "",
    accountNo: payment?.accountNo ?? "",
    reference: payment?.reference ?? "",
    note: payment?.note ?? "",
  });
  const [qr, setQr] = useState(payment?.qrUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const field =
    "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] outline-none focus:border-accent";

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/properties", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
  }

  async function onPickQr(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      // QR ต้องคมพอให้สแกนติดตอนพิมพ์ จึงย่อน้อยกว่ารูปอื่น
      const dataUrl = await downscaleImage(file, 900, 0.92);
      setQr(dataUrl);
      await patch({ qrDataUrl: dataUrl });
      router.refresh();
    } catch (err) {
      setQr(payment?.qrUrl ?? null);
      setError(err instanceof Error ? err.message : "อัปโหลด QR ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function removeQr() {
    setBusy(true);
    setError(null);
    try {
      await patch({ qrDataUrl: null });
      setQr(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบ QR ไม่สำเร็จ");
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
      await patch({
        nameEn: form.nameEn,
        preparedBy: form.preparedBy,
        payment: {
          method: form.method,
          accountName: form.accountName,
          accountNo: form.accountNo,
          reference: form.reference,
          note: form.note,
        },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card space-y-3 p-4">
      <p className="text-[13px] leading-relaxed text-muted">
        ข้อมูลชุดนี้ใช้กับใบแจ้งหนี้ทุกใบ กรอกครั้งเดียวพอ
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">ชื่อภาษาอังกฤษ</span>
          <input
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            placeholder="WILAI PLACE"
            className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">ผู้จัดทำ</span>
          <input
            value={form.preparedBy}
            onChange={(e) => setForm({ ...form, preparedBy: e.target.value })}
            placeholder="ผู้จัดการ"
            className={field}
          />
        </label>
      </div>

      <div className="h-px bg-line" />

      <label className="block">
        <span className="mb-1 block text-[12px] text-muted">ช่องทางชำระ</span>
        <input
          value={form.method}
          onChange={(e) => setForm({ ...form, method: e.target.value })}
          placeholder="PromptPay / KBank"
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12px] text-muted">ชื่อบัญชี</span>
        <input
          value={form.accountName}
          onChange={(e) => setForm({ ...form, accountName: e.target.value })}
          placeholder="น.ส. วิไล กรแก้ว"
          className={field}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">เลขบัญชี</span>
          <input
            value={form.accountNo}
            onChange={(e) => setForm({ ...form, accountNo: e.target.value })}
            placeholder="xxx-x-x1085-x"
            className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-muted">เลขที่อ้างอิง</span>
          <input
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            placeholder="เว้นว่าง = ใช้เลขที่บิล"
            className={field}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-[12px] text-muted">ข้อความต่อท้าย</span>
        <input
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="กรุณาส่งสลิปหลังโอนผ่าน LINE"
          className={field}
        />
      </label>

      <div className="rounded-xl bg-surface-2 p-3">
        <p className="mb-2 text-[12px] font-semibold text-muted">QR พร้อมเพย์</p>
        <div className="flex items-center gap-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR พร้อมเพย์" className="h-24 w-auto rounded-lg bg-white" />
          ) : (
            <div className="grid h-24 w-20 shrink-0 place-items-center rounded-lg border border-dashed border-line text-[11px] text-muted">
              ยังไม่มีรูป
            </div>
          )}
          <div className="flex-1 space-y-2">
            <button
              type="button"
              onClick={() => qrInput.current?.click()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-surface py-2.5 text-[13px] font-bold disabled:opacity-60"
            >
              <IconCamera className="h-4 w-4" />
              {qr ? "เปลี่ยนรูป QR" : "อัปโหลดรูป QR"}
            </button>
            {qr ? (
              <button
                type="button"
                onClick={removeQr}
                disabled={busy}
                className="w-full text-[12px] text-muted underline underline-offset-4"
              >
                ลบรูป QR
              </button>
            ) : null}
          </div>
        </div>
        <input ref={qrInput} type="file" accept="image/*" onChange={onPickQr} className="hidden" />
      </div>

      {error ? <p className="text-[13px] font-semibold text-danger">{error}</p> : null}
      {saved ? <p className="text-[13px] font-semibold text-ok">บันทึกแล้ว</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
      >
        {busy ? "กำลังบันทึก…" : "บันทึกข้อมูลใบแจ้งหนี้"}
      </button>

      {printHref ? (
        <a
          href={printHref}
          target="_blank"
          rel="noreferrer"
          className="block rounded-xl bg-surface-2 py-3 text-center text-[13px] font-bold text-ink-2"
        >
          ดูตัวอย่างใบแจ้งหนี้ล่าสุด
        </a>
      ) : null}
    </form>
  );
}
