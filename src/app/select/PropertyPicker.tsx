"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PropertyPicker({
  propertyId, children,
}: { propertyId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function choose() {
    setBusy(true);
    const res = await fetch("/api/property/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={choose}
      disabled={busy}
      className="w-full text-left transition active:scale-[0.99] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

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
      className="text-[13px] font-medium text-muted underline underline-offset-4"
    >
      ออกจากระบบ
    </button>
  );
}
