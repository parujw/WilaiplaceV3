import { redirect } from "next/navigation";
import { PropertyImage } from "@/components/ui";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { getSessionUser, isDemoLoginAllowed } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/select");

  return (
    <div className="app-frame flex flex-col">
      <div className="relative h-64 shrink-0 overflow-hidden">
        <PropertyImage name="Wilai Communities" />
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/45 to-transparent px-6 pb-14 pt-10">
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/80">Wilai Communities</p>
          <p className="mt-1 text-[15px] text-white/85">หอพักในเครือวิไล</p>
        </div>
      </div>

      <div className="relative -mt-12 flex flex-1 flex-col px-4 pb-8">
        <div className="card px-6 py-7">
          <h1 className="text-[26px] font-bold leading-[1.25] tracking-tight">
            จัดการหอพักทุกอาคาร
            <br />
            ในแอปเดียว
          </h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-muted">
            จดมิเตอร์ ออกบิล รับชำระ และดูแลผู้เช่า — ข้อมูลเดิมจากวิไลเพลส V2 ย้ายมาครบแล้ว
          </p>
          <div className="mt-6">
            <LoginForm serverReady={isFirebaseConfigured()} demoAllowed={isDemoLoginAllowed()} />
          </div>
        </div>

        <p className="mt-auto pt-10 text-center text-[12px] leading-relaxed text-muted">
          วิไลเพลส 1 · 17 ห้อง
          <br />
          ข้อมูลเดิมทั้งหมดจาก V2 อยู่ในระบบแล้ว
        </p>
      </div>
    </div>
  );
}
