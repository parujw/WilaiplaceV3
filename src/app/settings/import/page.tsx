import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { IconBack } from "@/components/icons";
import { isFirebaseConfigured } from "@/lib/db";
import { listProperties } from "@/lib/repo";
import { getSessionUser } from "@/lib/session";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

/**
 * นำเข้าอาคารใหม่จาก Excel
 * ไม่เรียก requireContext() — ต้องเข้าได้จากหน้าเลือกอาคาร แม้ยังไม่ได้เลือกอาคารไหน
 */
export default async function ImportPage() {
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
          <h1 className="text-[20px] font-bold leading-tight tracking-tight">นำเข้าอาคารใหม่จาก Excel</h1>
          <p className="text-[13px] text-muted">ห้อง ผู้เช่าปัจจุบัน สัญญา และเลขมิเตอร์ล่าสุด</p>
        </div>
      </header>

      <div className="px-4 pb-8">
        <ImportForm firestore={isFirebaseConfigured()} />
      </div>
    </AppShell>
  );
}
