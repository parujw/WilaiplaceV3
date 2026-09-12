"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IconGoogle } from "@/components/icons";
import type { FirebaseWebConfig } from "@/lib/firebase-config";
import { signInWithGoogle } from "@/lib/firebase-client";

/**
 * แปลรหัสข้อผิดพลาดของ Firebase เป็นสิ่งที่ต้องไปทำ
 * ข้อความดิบอย่าง auth/api-key-not-valid ไม่ได้บอกว่าต้องแก้ตรงไหน
 */
const AUTH_ERROR: Record<string, string> = {
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
    "API key ไม่ถูกต้อง — ตรวจค่า NEXT_PUBLIC_FIREBASE_API_KEY ใน Vercel ว่าไม่มีช่องว่าง ไม่มีเครื่องหมายคำพูดครอบ และไม่มีบรรทัดว่างต่อท้าย แล้ว Redeploy",
  "auth/api-key-not-valid":
    "API key ไม่ถูกต้อง — ตรวจค่า NEXT_PUBLIC_FIREBASE_API_KEY ใน Vercel ว่าไม่มีช่องว่างหรือเครื่องหมายคำพูดติดมา แล้ว Redeploy",
  "auth/unauthorized-domain":
    "โดเมนนี้ยังไม่ได้รับอนุญาต — Firebase Console → Authentication → Settings → Authorized domains แล้วเพิ่มโดเมนของเว็บนี้",
  "auth/operation-not-allowed":
    "ยังไม่ได้เปิดการล็อกอินด้วย Google — Firebase Console → Authentication → Sign-in method → เปิด Google",
  "auth/configuration-not-found":
    "โปรเจกต์นี้ยังไม่ได้เปิดใช้ Authentication — Firebase Console → Authentication → Get started",
  "auth/popup-blocked":
    "เบราว์เซอร์บล็อกหน้าต่างล็อกอิน อนุญาตป็อปอัปสำหรับเว็บนี้แล้วลองใหม่",
  "auth/network-request-failed": "เชื่อมต่อ Firebase ไม่ได้ ตรวจสัญญาณอินเทอร์เน็ตแล้วลองใหม่",
};

/** ผู้ใช้ปิดหน้าต่างเอง ไม่ใช่ข้อผิดพลาด ไม่ต้องขึ้นกล่องแดง */
const SILENT = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

/** ย่อ API key ให้เทียบกับค่าใน Firebase Console ได้ โดยไม่ต้องโชว์ทั้งตัว */
function fingerprint(apiKey: string): string {
  return `ค่าที่ระบบใช้อยู่: ${apiKey.slice(0, 8)}…${apiKey.slice(-4)} ยาว ${apiKey.length} ตัว (ของจริงต้องยาว 39 ตัว)`;
}

function describe(err: unknown, config: FirebaseWebConfig | null): string | null {
  const code = (err as { code?: string })?.code ?? "";
  if (SILENT.has(code)) return null;

  const message = err instanceof Error ? err.message : "";
  let text = AUTH_ERROR[code];
  if (!text) {
    // เผื่อ Firebase เปลี่ยนรูปแบบ code ให้จับจากข้อความแทน
    for (const [key, value] of Object.entries(AUTH_ERROR)) {
      if (message.includes(key.replace(/\.$/, ""))) {
        text = value;
        break;
      }
    }
  }
  if (!text) return message || "เข้าสู่ระบบไม่สำเร็จ";

  // ปัญหาเรื่องคีย์ ให้เทียบค่าได้เลยว่าที่เก็บไว้ตรงกับใน Console ไหม
  if (code.startsWith("auth/api-key-not-valid") && config) {
    return `${text}\n\n${fingerprint(config.apiKey)}`;
  }
  return text;
}

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
      setError(describe(err, webConfig));
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
        <p className="whitespace-pre-line rounded-xl bg-danger/10 px-4 py-3 text-center text-[13px] font-medium leading-relaxed text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
