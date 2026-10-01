"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { IconGoogle } from "@/components/icons";
import type { FirebaseWebConfig } from "@/lib/firebase-config";
import {
  finishGoogleRedirect,
  shouldRedirectToSignIn,
  signInWithGoogle,
  startGoogleRedirect,
} from "@/lib/firebase-client";

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
  "wilai/timeout":
    "รอหน้าต่างล็อกอินนานเกินไป กดปุ่มอีกครั้ง — รอบนี้ระบบจะพาไปหน้า Google ทั้งหน้าแทนการเปิดป็อปอัป",
  "wilai/redirect-empty":
    "กลับมาจากหน้า Google แล้วแต่ไม่ได้ข้อมูลล็อกอิน ถ้าเพิ่งกดยกเลิกไม่ต้องสนใจข้อความนี้ ถ้าไม่ได้กดยกเลิกให้ลองอีกครั้ง",
};

/**
 * ป็อปอัปใช้ไม่ได้บนเครื่องนี้ — ครั้งต่อไปพาออกไปหน้า Google ทั้งหน้าเลย
 * ไม่รวมกรณีผู้ใช้ปิดหน้าต่างเอง เพราะนั่นแปลว่าป็อปอัปทำงานได้ปกติ
 */
const POPUP_UNUSABLE = new Set([
  "wilai/timeout",
  "auth/popup-blocked",
  "auth/web-storage-unsupported",
  "auth/operation-not-supported-in-this-environment",
]);

/** กันปุ่มค้างตลอดไป ถ้า Firebase ไม่ตอบทั้งสำเร็จและล้มเหลว */
const POPUP_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("หมดเวลา"), { code: "wilai/timeout" })), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

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
  if (!text) {
    // ไม่รู้จักรหัสนี้ ให้โชว์ทั้งข้อความและรหัส เวลาส่งภาพหน้าจอมาจะบอกสาเหตุได้ทันที
    const detail = [message, code && `(${code})`].filter(Boolean).join(" ");
    return detail || "เข้าสู่ระบบไม่สำเร็จ";
  }

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
  /** ป็อปอัปเพิ่งค้างหรือถูกบล็อก รอบหน้าไม่ต้องลองอีก พาออกไปหน้า Google ทั้งหน้าเลย */
  const [popupFailed, setPopupFailed] = useState(false);
  const leaving = useRef(false);

  const ready = serverReady && webConfig !== null;

  const post = useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "เข้าสู่ระบบไม่สำเร็จ");
  }, []);

  const enter = useCallback(
    async (idToken: string) => {
      await post("/api/auth/session", { idToken });
      startTransition(() => router.replace("/select"));
    },
    [post, router, startTransition],
  );

  /*
   * ถ้ารอบก่อนเลือกวิธี redirect เบราว์เซอร์จะออกจากหน้านี้ไปที่ Google
   * แล้วกลับมาเปิดหน้านี้ใหม่ ผลการล็อกอินรออยู่ใน Firebase ต้องมารับตรงนี้
   * ไม่รับ = ล็อกอินผ่านแล้วแต่หน้าเว็บไม่รู้เรื่อง ค้างอยู่หน้าล็อกอินเหมือนไม่เคยกด
   */
  useEffect(() => {
    if (!ready) return;
    const flag = "wilai.signin-redirect";
    let returning = false;
    try {
      returning = sessionStorage.getItem(flag) === "1";
      sessionStorage.removeItem(flag);
    } catch {
      // Safari โหมดส่วนตัวห้ามแตะ sessionStorage — ยังรับผลได้ แค่ไม่โชว์สถานะกำลังโหลด
    }

    let alive = true;
    if (returning) setBusy(true);

    finishGoogleRedirect(webConfig!)
      .then(async (idToken) => {
        if (!alive) return;
        if (idToken) {
          leaving.current = true;
          await enter(idToken);
          return;
        }
        // ไม่มีผลรออยู่ และเราก็ไม่ได้เพิ่งกลับมาจาก Google ถือว่าเข้าหน้านี้ปกติ
        if (returning) setError(describe({ code: "wilai/redirect-empty" }, webConfig));
      })
      .catch((err) => {
        if (alive && returning) setError(describe(err, webConfig));
      })
      .finally(() => {
        if (alive && !leaving.current) setBusy(false);
      });

    return () => {
      alive = false;
    };
  }, [ready, webConfig, enter]);

  async function handleGoogle() {
    setError(null);
    setBusy(true);

    if (popupFailed || shouldRedirectToSignIn()) {
      // บอกตัวเองไว้ก่อนออกจากหน้า เพื่อให้รอบหน้ารู้ว่าต้องไปรับผลการล็อกอิน
      try {
        sessionStorage.setItem("wilai.signin-redirect", "1");
      } catch {
        // ไม่ได้ก็ไม่เป็นไร ยังรับผลได้ แค่ไม่รู้ว่าควรโชว์สถานะกำลังโหลด
      }
      try {
        await startGoogleRedirect(webConfig!);
        // ถึงตรงนี้แปลว่าเบราว์เซอร์ยังไม่ยอมเปลี่ยนหน้า ปล่อยให้ค้างไว้ดีกว่ารีเซ็ตแล้วกดซ้ำ
        return;
      } catch (err) {
        setError(describe(err, webConfig));
        setBusy(false);
        return;
      }
    }

    try {
      const idToken = await withTimeout(signInWithGoogle(webConfig!), POPUP_TIMEOUT_MS);
      await enter(idToken);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (POPUP_UNUSABLE.has(code)) setPopupFailed(true);
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
