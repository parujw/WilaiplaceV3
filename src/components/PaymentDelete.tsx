"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Ghost, Input, Submit, send } from "./form";

/**
 * ลบใบเสร็จที่บันทึกผิด — กรอกยอดเกิน กดซ้ำสองครั้ง หรือลงผิดใบ
 * ยอดในบิลถอยกลับให้เองที่ฝั่งเซิร์ฟเวอร์ ไม่ต้องไปแก้บิลตามทีหลัง
 */
export function PaymentDelete({ paymentId, receiptNo }: { paymentId: string; receiptNo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 text-[12px] font-medium text-muted underline underline-offset-4"
      >
        ลบ
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl bg-surface-2 p-3">
      <p className="text-[12px] leading-relaxed text-muted">
        ลบใบเสร็จ {receiptNo} แล้วยอดชำระในบิลจะถอยกลับตามจำนวนนี้
      </p>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="เหตุผลที่ลบ เช่น บันทึกซ้ำ"
        className="!bg-surface !py-2.5 text-[14px]"
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-2">
        <Ghost onClick={() => { setOpen(false); setError(null); }} disabled={busy} className="!bg-surface">
          ไม่ลบ
        </Ghost>
        <Submit
          type="button"
          tone="danger"
          busy={busy}
          disabled={!reason.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await send(`/api/payments/${encodeURIComponent(paymentId)}`, "DELETE", { reason });
              setOpen(false);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
            } finally {
              setBusy(false);
            }
          }}
        >
          ยืนยันลบ
        </Submit>
      </div>
    </div>
  );
}
