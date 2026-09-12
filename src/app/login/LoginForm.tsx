"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IconGoogle } from "@/components/icons";
import type { FirebaseWebConfig } from "@/lib/firebase-config";
import { signInWithGoogle } from "@/lib/firebase-client";

/** บอกให้ชัดว่าแต่ละตัวไปหยิบมาจากหน้าไหนของ Firebase Console */
const WHERE_FROM: Record<string, string> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "Project settings → General → Your apps → Web app → apiKey",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "Project settings → General → Project ID",
  FIREBASE_CLIENT_EMAIL: "Project settings → Service accounts → Generate new private key → client_email ในไฟล์ JSON",
  FIREBASE_PRIVATE_KEY: "ไฟล์ JSON เดียวกัน → private_key (วางทั้งก้อนรวมบรรทัด BEGIN/END)",
};

export function LoginForm({
  serverReady,
  demoAllowed,
  missingEnv,
  webConfig,
}: {
  serverReady: boolean;
  demoAllowed: boolean;
  /** ชื่อ env var ที่ยังไม่ได้ตั้ง — ชื่อตัวแปรอย่างเดียว ไม่ใช่ค่า */
  missingEnv: string[];
  /** null = ตั้งค่าไม่ครบ ล็อกอิน Google ไม่ได้ */
  webConfig: FirebaseWebConfig | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const ready = serverReady && webConfig !== null;

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
      const idToken = await signInWithGoogle(webConfig!);
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
            เพราะข้อมูลในระบบเป็นชื่อและค่าเช่าจริงของผู้เช่า
            ถ้าเปิดไว้บนลิงก์สาธารณะใครก็เข้าดูได้
          </p>

          {missingEnv.length > 0 ? (
            <div className="mt-4 rounded-xl bg-surface px-4 py-3 text-left">
              <p className="text-[12px] font-semibold text-muted">ยังขาด Environment Variables</p>
              <ul className="mt-2 space-y-2">
                {missingEnv.map((name) => (
                  <li key={name}>
                    <p className="font-mono text-[12px] font-semibold text-accent-strong">{name}</p>
                    <p className="text-[11px] leading-relaxed text-muted">{WHERE_FROM[name]}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                ใส่ใน Vercel → Settings → Environment Variables แล้ว Redeploy
              </p>
            </div>
          ) : null}

          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            ตั้งครบแล้ว deploy ใหม่อีกครั้ง หรือถ้าตั้งใจเปิดให้ดูแบบสาธารณะ ให้กำหนด{" "}
            <code className="rounded bg-surface-2 px-1">ALLOW_DEMO_LOGIN=1</code>
          </p>
        </div>
      )}

      {error ? (
        <p className="rounded-xl bg-danger/10 px-4 py-3 text-center text-[13px] font-medium text-danger">{error}</p>
      ) : null}
    </div>
  );
}
