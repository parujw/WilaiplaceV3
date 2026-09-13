"use client";

import { useState } from "react";

/**
 * ชิ้นส่วนฟอร์มที่ใช้ซ้ำทุกหน้าแก้ข้อมูล
 * เดิมแต่ละหน้าก๊อป class ยาวๆ ของช่องกรอกไปเอง พอแก้ทีหนึ่งก็ลืมแก้ให้ครบ
 */

export const FIELD =
  "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] outline-none focus:border-accent";

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${FIELD} ${props.className ?? ""}`} />;
}

export function Submit({
  busy, children, tone = "accent", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; tone?: "accent" | "danger" }) {
  const bg = tone === "danger" ? "bg-danger" : "bg-accent";
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={`w-full rounded-xl ${bg} py-3.5 text-[15px] font-bold text-white disabled:opacity-60`}
    >
      {busy ? "กำลังบันทึก…" : children}
    </button>
  );
}

export function Ghost({
  children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`w-full rounded-xl bg-surface-2 py-3 text-[14px] font-bold disabled:opacity-60 ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Alert({ tone, children }: { tone: "ok" | "danger"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger";
  return <p className={`rounded-xl px-4 py-3 text-[13px] font-semibold ${cls}`}>{children}</p>;
}

/**
 * กล่องที่กดแล้วกางฟอร์มออกมา
 * ใช้แทนการเปิดหน้าใหม่ เพราะทุกหน้าอ่านข้อมูลสดจากเซิร์ฟเวอร์ กดแล้วต้องรอ
 * กางในที่เดิมได้ทันทีและยังเห็นข้อมูลเดิมประกอบตอนกรอก
 */
export function Expander({
  label, tone = "normal", children,
}: { label: string; tone?: "normal" | "danger"; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          tone === "danger"
            ? "w-full py-2 text-[13px] font-medium text-danger underline underline-offset-4"
            : "w-full rounded-xl bg-surface py-3.5 text-[14px] font-bold text-accent-strong shadow-[0_1px_2px_rgb(23_23_27/0.06)]"
        }
      >
        {label}
      </button>
    );
  }
  return <>{children(() => setOpen(false))}</>;
}

/** ยิง API แล้วคืนข้อความผิดพลาดเป็นภาษาคนเสมอ ไม่ปล่อยให้ขึ้น "Unexpected token <" */
export async function send(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`เซิร์ฟเวอร์ตอบกลับมาไม่ใช่ JSON (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : `ทำรายการไม่สำเร็จ (HTTP ${res.status})`);
  return json;
}
