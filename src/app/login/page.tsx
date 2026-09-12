import { redirect } from "next/navigation";
import { PropertyImage } from "@/components/ui";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/select");

  return (
    <div className="app-frame flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <PropertyImage name="Wilai Communities" />
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/45 to-transparent px-6 pb-16 pt-12">
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/80">Wilai Communities</p>
          <p className="mt-1 text-[15px] text-white/85">หอพักในเครือวิไล</p>
        </div>
      </div>

      <div className="relative -mt-24 px-4 pb-8">
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
            <LoginForm serverReady={isFirebaseConfigured()} />
          </div>
        </div>
      </div>
    </div>
  );
}
