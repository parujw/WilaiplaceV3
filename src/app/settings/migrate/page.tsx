import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { IconBack } from "@/components/icons";
import { isFirebaseConfigured } from "@/lib/db";
import { requireContext } from "@/lib/guard";
import { MigrateForm } from "./MigrateForm";

export const dynamic = "force-dynamic";

export default async function MigratePage() {
  const { user } = await requireContext();
  if (user.role !== "owner") redirect("/settings");

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-4 pb-5 pt-8">
        <Link href="/settings" aria-label="กลับ" className="grid h-10 w-10 place-items-center rounded-full bg-surface">
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
