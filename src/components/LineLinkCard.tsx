"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Ghost, Submit, send } from "./form";

/**
 * ผูกบัญชีไลน์ของผู้เช่า
 *
 * ผู้จัดการกดออกรหัส แล้วส่งรหัสให้ผู้เช่าทางที่คุยกันอยู่แล้ว
 * ผู้เช่าแอดบอทเป็นเพื่อนแล้วพิมพ์รหัสเข้าไป ระบบถึงจะรู้ว่าไลน์ไอดีนั้นเป็นของใคร
 *
 * ไม่ให้ผู้เช่าพิมพ์เลขห้องมาลงทะเบียนเอง เพราะใครก็พิมพ์ "301" ได้
 * แล้วบิลที่มีทั้งชื่อ เบอร์ และยอดหนี้ จะวิ่งไปหาคนแปลกหน้า
 */
export function LineLinkCard({
  tenantId, tenantName, linked,
}: { tenantId: string; tenantName: string; linked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (linked && !code) {
    return (
      <div className="card flex items-center gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok/12 text-[18px]">💬</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">ผูกไลน์แล้ว</p>
          <p className="text-[12px] text-muted">ใบแจ้งหนี้ส่งเข้าแชตของผู้เช่าได้เลย</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await send("/api/line/link", "DELETE", { tenantId });
              router.refresh();
            })
          }
          className="shrink-0 text-[12px] font-medium text-muted underline underline-offset-4"
        >
          ยกเลิก
        </button>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <p className="text-[15px] font-bold">ยังไม่ได้ผูกไลน์</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          ออกรหัสแล้วส่งให้{tenantName}ทางที่คุยกันอยู่ ให้เขาแอดบัญชีทางการเป็นเพื่อน
          แล้วพิมพ์รหัสนี้ส่งเข้าไป ระบบจะผูกให้เอง
        </p>
      </div>

      {code ? (
        <div className="rounded-xl bg-accent-soft px-4 py-4 text-center">
          <p className="text-[11px] font-semibold text-accent-strong">รหัสผูกบัญชี · ใช้ได้ครั้งเดียว อายุ 7 วัน</p>
          <p className="mt-1.5 font-mono text-[30px] font-bold tracking-[0.2em] text-accent-strong">{code}</p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
              } catch {
                setError(`คัดลอกอัตโนมัติไม่ได้ รหัสคือ ${code}`);
              }
            }}
            className="mt-2 text-[12px] font-semibold text-accent-strong underline underline-offset-4"
          >
            {copied ? "คัดลอกแล้ว" : "คัดลอกรหัส"}
          </button>
        </div>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {code ? (
        <Ghost
          disabled={busy}
          onClick={() =>
            run(async () => {
              const res = await send("/api/line/link", "POST", { tenantId });
              setCode(String(res.code));
              setCopied(false);
            })
          }
        >
          ออกรหัสใหม่
        </Ghost>
      ) : (
        <Submit
          type="button"
          busy={busy}
          onClick={() =>
            run(async () => {
              const res = await send("/api/line/link", "POST", { tenantId });
              setCode(String(res.code));
            })
          }
        >
          ออกรหัสผูกไลน์
        </Submit>
      )}
    </div>
  );
}
