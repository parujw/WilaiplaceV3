"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Expander, Field, Ghost, Input, Submit, send } from "./form";
import type { Tenant } from "@/lib/types";

/**
 * แก้ข้อมูลส่วนตัวผู้เช่า
 *
 * แก้ชื่อที่นี่ไม่กระทบบิลเก่า เพราะบิลเก็บชื่อ ณ วันออกไว้ใน tenantSnapshot แล้ว
 * ใบแจ้งหนี้ที่พิมพ์ไปแล้วกับใบที่พิมพ์ใหม่จึงตรงกันเสมอ
 *
 * ย้ายห้องไม่ได้จากที่นี่ — ห้องไม่ใช่คุณสมบัติของคน แต่เป็นสัญญาคนละฉบับ
 * (ดูปุ่มย้ายออก/รับเข้าในหน้าห้อง)
 */
export function TenantEditor({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: tenant.name,
    nickname: tenant.nickname,
    phone: tenant.phone,
    lineUserId: tenant.lineUserId ?? "",
    emergencyContact: tenant.emergencyContact ?? "",
    note: tenant.note ?? "",
  });

  return (
    <Expander label="แก้ข้อมูลผู้เช่า">
      {(close) => (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await send(`/api/tenants/${encodeURIComponent(tenant.id)}`, "PATCH", form);
              close();
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
            } finally {
              setBusy(false);
            }
          }}
          className="card space-y-3 p-4"
        >
          <h3 className="text-[16px] font-bold tracking-tight">แก้ข้อมูลผู้เช่า</h3>
          <p className="text-[12px] leading-relaxed text-muted">
            บิลและใบแจ้งหนี้ที่ออกไปแล้วยังใช้ชื่อเดิม ณ วันที่ออก จะไม่เปลี่ยนตาม
          </p>

          <Field label="ชื่อ-นามสกุล">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ชื่อเล่น">
              <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            </Field>
            <Field label="เบอร์โทร">
              <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="ผู้ติดต่อฉุกเฉิน">
            <Input
              value={form.emergencyContact}
              onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
              placeholder="ชื่อ + เบอร์โทร"
            />
          </Field>
          <Field label="LINE User ID" hint="ใส่เมื่อเชื่อม LINE แล้ว ปล่อยว่างได้">
            <Input value={form.lineUserId} onChange={(e) => setForm({ ...form, lineUserId: e.target.value })} />
          </Field>
          <Field label="หมายเหตุ">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>

          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid grid-cols-2 gap-3">
            <Ghost onClick={close} disabled={busy}>ยกเลิก</Ghost>
            <Submit busy={busy}>บันทึก</Submit>
          </div>
        </form>
      )}
    </Expander>
  );
}
