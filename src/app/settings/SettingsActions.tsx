"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
      className="w-full rounded-2xl bg-surface py-3.5 text-[15px] font-bold text-danger shadow-[0_1px_2px_rgb(23_23_27/0.06)]"
    >
      ออกจากระบบ
    </button>
  );
}
