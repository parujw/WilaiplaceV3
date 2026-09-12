"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IconGoogle } from "@/components/icons";
import { firebaseReady, signInWithGoogle } from "@/lib/firebase-client";

export function LoginForm({
  serverReady,
  demoAllowed,
}: {
  serverReady: boolean;
  demoAllowed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const ready = serverReady && firebaseReady;

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "เข้าสู่ระบบไม่สำเร็จ");
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      const idToken = await signInWithGoogle();
      await post("/api/auth/session", { idToken });
      startTransition(() => router.replace("/select"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleDemo() {
    setError(null);
    setBusy(true);
    try {
      await post("/api/auth/demo");
      startTransition(() => router.replace("/select"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <div className="space-y-3">
      {ready ? (
        <button
          type="button"
          onClick={handleGoogle}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-accent px-5 py-4 text-[15px] font-bold text-white shadow-[0_8px_24px_-10px_rgb(232_112_58/0.9)] transition active:scale-[0.99] disabled:opacity-60"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white">
            <IconGoogle className="h-4 w-4" />
          </span>
          {disabled ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบด้วย Google"}
        </button>
      ) : demoAllowed ? (
        <>
          <button
            type="button"
            onClick={handleDemo}
            disabled={disabled}
            className="w-full rounded-2xl bg-accent px-5 py-4 text-[15px] font-bold text-white shadow-[0_8px_24px_-10px_rgb(232_112_58/0.9)] transition active:scale-[0.99] disabled:opacity-60"
          >
            {disabled ? "กำลังเข้าสู่ระบบ…" : "เข้าใช้งาน (โหมดสาธิต)"}
          </button>
          <p className="text-center text-xs leading-relaxed text-muted">
            ยังไม่ได้ตั้งค่า Firebase — เข้าใช้ด้วยข้อมูลจริงที่ย้ายมาจาก V2 บนเครื่องนี้
            <br />
            ตั้งค่า <code className="rounded bg-surface-2 px-1">.env.local</code> แล้วปุ่ม Google จะขึ้นมาแทน
          </p>
        </>
      ) : (
        <div className="rounded-2xl bg-surface-2 px-5 py-5 text-center">
          <p className="text-[15px] font-bold">ยังเข้าใช้งานไม่ได้</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่า Firebase และโหมดสาธิตถูกปิดไว้
            เพราะข้อมูลในระบบเป็นชื่อ เบอร์โทร และค่าเช่าจริงของผู้เช่า
            ถ้าเปิดไว้บนลิงก์สาธารณะใครก็เข้าดูได้
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            ตั้งค่า Firebase ใน Environment Variables แล้ว deploy ใหม่
            หรือถ้าตั้งใจจะเปิดให้ดูแบบสาธารณะจริงๆ ให้กำหนด{" "}
            <code className="rounded bg-surface px-1">ALLOW_DEMO_LOGIN=1</code>
          </p>
        </div>
      )}

      {error ? (
        <p className="rounded-xl bg-danger/10 px-4 py-3 text-center text-[13px] font-medium text-danger">{error}</p>
      ) : null}
    </div>
  );
}
