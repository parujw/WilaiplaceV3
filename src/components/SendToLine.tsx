"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, send } from "./form";
import { thaiDate } from "@/lib/format";

/** ส่งใบแจ้งหนี้เข้าไลน์ของผู้เช่า — เซิร์ฟเวอร์วาดรูปจากหน้าพิมพ์ตัวเดิมแล้วส่งให้ */
export function SendToLine({
  billId, sentAt, canSend, reason,
}: {
  billId: string;
  sentAt: string | null;
  /** ผู้เช่าผูกไลน์แล้วหรือยัง */
  canSend: boolean;
  /** ส่งไม่ได้เพราะอะไร ใช้ตอน canSend เป็น false */
  reason: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!canSend) {
    return (
      <p className="rounded-xl bg-surface-2 px-4 py-3 text-center text-[12px] leading-relaxed text-muted">
        {reason}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setDone(null);
          try {
            const res = await send(`/api/line/send/${encodeURIComponent(billId)}`, "POST");
            setDone(`ส่งให้${res.tenantName ?? "ผู้เช่า"}แล้ว`);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
          } finally {
            setBusy(false);
          }
        }}
        className="w-full rounded-xl bg-[#06C755] py-3.5 text-[14px] font-bold text-white disabled:opacity-60"
      >
        {busy ? "กำลังส่ง…" : sentAt ? "ส่งเข้าไลน์อีกครั้ง" : "ส่งเข้าไลน์"}
      </button>

      {sentAt && !done ? (
        <p className="text-center text-[12px] text-muted">ส่งไปแล้วเมื่อ {thaiDate(sentAt.slice(0, 10))}</p>
      ) : null}
      {done ? <Alert tone="ok">{done}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
