import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { IconBack } from "@/components/icons";
import { isFirebaseConfigured } from "@/lib/db";
import { listProperties } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import { MigrateForm } from "./MigrateForm";

export const dynamic = "force-dynamic";

/**
 * ไม่เรียก requireContext() เพราะหน้านี้ต้องเข้าได้ตอนที่ยังไม่มีอาคารสักหลัง
 * ไม่งั้น Firestore ที่ว่างเปล่าจะวนกลับไป /select แล้วเข้ามาย้ายข้อมูลไม่ได้เลย
 */
export default async function MigratePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/settings");

  const properties = await listProperties(user);
  const backHref = properties.length === 0 ? "/select" : "/settings";

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <Link href={backHref} aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-bold leading-tight tracking-tight">ย้ายข้อมูลจาก V2</h1>
          <p className="text-[13px] text-muted">อัปโหลดไฟล์ export แล้วกดยืนยัน</p>
        </div>
      </header>

      <div className="px-4">
        <MigrateForm firestore={isFirebaseConfigured()} />
      </div>
    </AppShell>
  );
}
