import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { IconBack } from "@/components/icons";
import { Avatar, Badge, SectionHeader } from "@/components/ui";
import { baht } from "@/lib/format";
import { requireContext } from "@/lib/guard";
import { isFirebaseConfigured } from "@/lib/db";
import { migrationIssues } from "@/lib/repo";
import { PropertyEditor } from "@/components/PropertyEditor";
import { SignOutButton } from "./SettingsActions";

export const dynamic = "force-dynamic";

const ROLE_LABEL = { owner: "เจ้าของ", manager: "ผู้จัดการ", viewer: "ดูอย่างเดียว" } as const;

export default async function SettingsPage() {
  const { user, property, properties } = await requireContext();
  const issues = await migrationIssues();
  const firestore = isFirebaseConfigured();

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <Link href="/" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <h1 className="flex-1 text-[20px] font-bold tracking-tight">ตั้งค่า</h1>
      </header>

      <section className="px-4">
        <div className="card flex items-center gap-3.5 p-4">
          <Avatar name={user.name} photoUrl={user.photoUrl} size={54} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold tracking-tight">{user.name}</p>
            <p className="truncate text-[13px] text-muted">{user.email}</p>
          </div>
          <Badge tone="accent">{ROLE_LABEL[user.role]}</Badge>
        </div>
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="อาคารที่ใช้งานอยู่" action={properties.length > 1 ? "เปลี่ยน" : undefined} href="/select" />
        <PropertyEditor
          propertyId={property.id}
          name={property.name}
          address={property.address}
          phone={property.phone}
          photoUrl={property.photoUrl}
        />

        <dl className="card mt-3 divide-y divide-line overflow-hidden text-[14px]">
          {(
            [
              ["รหัสอาคาร", property.shortName],
              ["จำนวนชั้น", `${property.floors} ชั้น`],
              ["ค่าไฟเริ่มต้น", `${property.defaultRates.elec} บาท/หน่วย`],
              ["ค่าน้ำเริ่มต้น", `${property.defaultRates.water} บาท/หน่วย`],
              ["ค่าแอร์เริ่มต้น", `${baht(property.defaultRates.ac)} บาท/เดือน`],
              ["ครบกำหนดชำระ", `ทุกวันที่ ${property.paymentDueDay}`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-muted">{label}</dt>
              <dd className="text-right font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="px-4 pt-6">
        <SectionHeader title="ที่เก็บข้อมูล" />
        <div className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-bold">{firestore ? "Firebase Firestore" : "ไฟล์ในเครื่อง (โหมดสาธิต)"}</p>
            <Badge tone={firestore ? "ok" : "warn"}>{firestore ? "พร้อมใช้งานจริง" : "สาธิต"}</Badge>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {firestore
              ? "ข้อมูลทั้งหมดอยู่บน Firestore และทุกการเขียนมี audit log กำกับ"
              : "ข้อมูล V2 ถูกย้ายเข้าไฟล์ data/local-store.json บนเครื่องนี้ ตั้งค่า .env.local แล้วรัน npm run migrate:v2 เพื่อย้ายขึ้น Firestore"}
          </p>
        </div>
      </section>

      {issues.length > 0 ? (
        <section className="px-4 pt-6">
          <SectionHeader title="ข้อมูล V2 ที่ต้องตรวจสอบ" action={`${issues.length} รายการ`} />
          <div className="card p-4">
            <p className="mb-2 text-[13px] leading-relaxed text-muted">
              ตัวแปลงไม่ได้แก้ข้อมูลให้เงียบๆ รายการเหล่านี้คือจุดที่ชีต V2 ไม่ตรงกัน ควรตามแก้ในระบบ V3 ให้ครบ
            </p>
            <ul className="space-y-2">
              {issues.map((issue) => (
                <li key={issue} className="flex gap-2 text-[13px] leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="px-4 pt-6">
        <SignOutButton />
      </section>

      <p className="px-4 pt-6 text-center text-[12px] text-muted">
        Wilai Communities · V3
      </p>
    </AppShell>
  );
}
