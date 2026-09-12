"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface Preview {
  collection: string;
  total: number;
  existing: number;
}

interface Report {
  written: number;
  skipped: number;
  byCollection: Array<{ collection: string; total: number; written: number; skipped: number }>;
  counters: Record<string, number>;
}

const LABEL: Record<string, string> = {
  properties: "อาคาร",
  rooms: "ห้อง",
  tenants: "ผู้เช่า",
  leases: "สัญญา",
  meterReadings: "การจดมิเตอร์",
  bills: "บิล",
  payments: "ใบเสร็จ",
  utilityCosts: "ต้นทุนค่าน้ำค่าไฟ",
};

const COUNTER_LABEL: Record<string, string> = {
  bill: "เลขรันบิล",
  invoice: "เลขรันใบแจ้งหนี้",
  receipt: "เลขรันใบเสร็จ",
  maintenance: "เลขรันแจ้งซ่อม",
};

export function MigrateForm({ firestore }: { firestore: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [force, setForce] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyThere = preview?.some((p) => p.existing > 0) ?? false;

  async function send(data: unknown, dryRun: boolean) {
    const res = await fetch("/api/admin/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ export: data, dryRun, force }),
    });

    // เซิร์ฟเวอร์อาจตอบเป็นหน้า HTML ตอนพังหนักๆ ต้องอ่านเป็นข้อความก่อน
    // ไม่งั้น res.json() จะพังแล้วกลืนสาเหตุจริงไปหมด
    const text = await res.text();
    let json: { error?: string; detail?: string } & Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`เซิร์ฟเวอร์ตอบผิดพลาด (HTTP ${res.status})\n${text.slice(0, 200)}`);
      }
      throw new Error("เซิร์ฟเวอร์ตอบข้อมูลที่อ่านไม่ออก");
    }

    if (!res.ok) {
      throw new Error(
        [json.error ?? `ทำรายการไม่สำเร็จ (HTTP ${res.status})`, json.detail ? `\n\nรายละเอียด: ${json.detail}` : ""]
          .join(""),
      );
    }
    return json;
  }

  /** ใช้ร่วมกันทั้งตอนเลือกไฟล์และตอนวางข้อความ */
  async function load(raw: string, label: string) {
    setBusy(true);
    setError(null);
    setReport(null);
    setPreview(null);
    try {
      const data = JSON.parse(raw) as unknown;
      const json = await send(data, true);
      setPayload(data);
      setFileName(label);
      setPreview(json.preview as Preview[]);
      setIssues((json.issues as string[]) ?? []);
    } catch (err) {
      setPayload(null);
      setFileName(null);
      setError(
        err instanceof SyntaxError
          ? "ข้อมูลนี้อ่านไม่ออก ต้องเป็นเนื้อหาของไฟล์ v2-export.json ทั้งไฟล์"
          : err instanceof Error
            ? err.message
            : "อ่านข้อมูลไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    let raw: string;
    try {
      raw = await file.text();
    } catch {
      setError("อ่านไฟล์ไม่ได้ ลองใช้วิธีวางข้อความแทน");
      return;
    }
    await load(raw, file.name);
  }

  async function confirm() {
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      const json = await send(payload, false);
      setReport(json.report as Report);
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ย้ายข้อมูลไม่สำเร็จ");
      // ปล่อย payload ไว้ จะได้กดยืนยันซ้ำได้โดยไม่ต้องเลือกไฟล์ใหม่
    } finally {
      setBusy(false);
    }
  }

  if (report) {
    return (
      <div className="space-y-3">
        <div className="card p-5 text-center">
          <p className="text-[20px] font-bold text-ok">ย้ายข้อมูลเรียบร้อย</p>
          <p className="mt-1 text-[14px] text-muted">
            เขียนใหม่ {report.written} เอกสาร · ข้ามของเดิม {report.skipped} เอกสาร
          </p>
        </div>

        <div className="card divide-y divide-line overflow-hidden">
          {report.byCollection.map((row) => (
            <div key={row.collection} className="flex items-center justify-between px-4 py-3">
              <span className="text-[14px] font-semibold">{LABEL[row.collection] ?? row.collection}</span>
              <span className="text-[13px] text-muted">
                {row.written > 0 ? <span className="font-bold text-ok">+{row.written}</span> : null}
                {row.written > 0 && row.skipped > 0 ? " · " : null}
                {row.skipped > 0 ? `ข้าม ${row.skipped}` : null}
                {row.written === 0 && row.skipped === 0 ? "—" : null}
              </span>
            </div>
          ))}
        </div>

        <div className="card p-4">
          <p className="mb-2 text-[13px] font-bold">เลขรันตั้งต่อจากของเดิม</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(report.counters).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-surface-2 px-3 py-2.5">
                <p className="text-[16px] font-bold">{value}</p>
                <p className="text-[11px] text-muted">{COUNTER_LABEL[key] ?? key}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="w-full rounded-2xl bg-accent py-4 text-[15px] font-bold text-white"
        >
          ไปหน้าหลัก
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!firestore ? (
        <div className="card p-4">
          <p className="text-[14px] font-bold text-warn">ยังไม่ได้ต่อ Firebase</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            ตอนนี้ย้ายเข้าไปก็จะอยู่แค่ในหน่วยความจำ หายเมื่อเซิร์ฟเวอร์รีสตาร์ต
            ตั้งค่า Firebase ก่อนแล้วค่อยย้าย ข้อมูลถึงจะอยู่ถาวร
          </p>
        </div>
      ) : null}

      <div className="card p-5">
        <h2 className="text-[16px] font-bold tracking-tight">เลือกไฟล์ข้อมูล V2</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          ไฟล์ <code className="rounded bg-surface-2 px-1">v2-export.json</code> ที่เก็บไว้
          เลือกแล้วจะยังไม่เขียนอะไร ระบบจะสรุปให้ดูก่อนว่าจะย้ายอะไรบ้าง
        </p>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="mt-4 w-full rounded-2xl bg-accent py-4 text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy ? "กำลังตรวจข้อมูล…" : fileName ? "เลือกไฟล์อื่น" : "เลือกไฟล์"}
        </button>
        {/* ไม่จำกัดชนิดไฟล์ เพราะมือถือหลายรุ่นมองไม่เห็นไฟล์ .json เมื่อใส่ accept */}
        <input ref={fileInput} type="file" onChange={onPick} className="hidden" />
        {fileName ? <p className="mt-2 text-center text-[12px] text-muted">{fileName}</p> : null}

        <button
          type="button"
          onClick={() => setPasteOpen((open) => !open)}
          className="mt-3 w-full text-center text-[12px] font-medium text-muted underline underline-offset-4"
        >
          {pasteOpen ? "ซ่อนช่องวางข้อความ" : "เลือกไฟล์ไม่ได้ ใช้วิธีวางข้อความแทน"}
        </button>

        {pasteOpen ? (
          <div className="mt-3 space-y-2">
            <p className="text-[12px] leading-relaxed text-muted">
              เปิดไฟล์ <code className="rounded bg-surface-2 px-1">v2-export.json</code> เลือกทั้งหมด
              คัดลอก แล้ววางลงช่องนี้
            </p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={5}
              placeholder='{ "property": { ... }, "rooms": [ ... ] }'
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 font-mono text-[12px] outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={busy || pasted.trim() === ""}
              onClick={() => load(pasted, "ข้อความที่วาง")}
              className="w-full rounded-xl bg-accent py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              ตรวจข้อมูลที่วาง
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="whitespace-pre-line rounded-xl bg-danger/10 px-4 py-3 text-[13px] font-semibold leading-relaxed text-danger">
          {error}
        </p>
      ) : null}

      {preview ? (
        <>
          <div className="card divide-y divide-line overflow-hidden">
            <p className="px-4 pb-2 pt-3.5 text-[13px] font-bold text-muted">จะย้ายเข้าไปทั้งหมด</p>
            {preview.map((row) => (
              <div key={row.collection} className="flex items-center justify-between px-4 py-3">
                <span className="text-[14px] font-semibold">{LABEL[row.collection] ?? row.collection}</span>
                <span className="text-[13px]">
                  <span className="font-bold">{row.total}</span>
                  <span className="text-muted"> รายการ</span>
                  {row.existing > 0 ? (
                    <span className="ml-2 text-warn">มีอยู่แล้ว {row.existing}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>

          {issues.length > 0 ? (
            <div className="card p-4">
              <p className="text-[13px] font-bold">ข้อมูล V2 ที่ไม่ตรงกัน ({issues.length} รายการ)</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                ย้ายเข้าไปตามที่เป็น ไม่ได้แก้ให้เงียบๆ ตามแก้ในแอปทีหลังได้
              </p>
              <ul className="mt-2 space-y-1.5">
                {issues.map((issue) => (
                  <li key={issue} className="flex gap-2 text-[12px] leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {alreadyThere ? (
            <label className="card flex items-start gap-3 p-4">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#e8703a]"
              />
              <span className="text-[13px] leading-relaxed">
                <span className="font-bold">เขียนทับของเดิม</span>
                <span className="block text-muted">
                  ไม่ติ๊ก = ข้ามรายการที่มีอยู่แล้ว ติ๊ก = เขียนทับด้วยข้อมูลจากไฟล์นี้
                  (สิ่งที่แก้ในแอปหลังย้ายครั้งก่อนจะหาย)
                </span>
              </span>
            </label>
          ) : null}

          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="w-full rounded-2xl bg-accent py-4 text-[15px] font-bold text-white disabled:opacity-60"
          >
            {busy ? "กำลังย้ายข้อมูล…" : "ยืนยัน ย้ายข้อมูลเข้าระบบ"}
          </button>
        </>
      ) : null}
    </div>
  );
}
