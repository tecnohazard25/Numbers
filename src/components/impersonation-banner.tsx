"use client";

import { Button } from "@/components/ui/button";
import { EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n/context";

interface ImpersonationBannerProps {
  name: string;
  email: string;
}

export function ImpersonationBanner({ name, email }: ImpersonationBannerProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const { t } = useTranslation();

  async function handleStop() {
    setIsRestoring(true);

    const res = await fetch("/api/impersonate", { method: "DELETE" });
    const data = await res.json();

    if (data.error) {
      setIsRestoring(false);
      return;
    }

    // Exchange the token to restore the superadmin session
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.verifyOtp({
      token_hash: data.tokenHash,
      type: "magiclink",
    });

    window.location.href = "/superadmin";
  }

  return (
    <div className="bg-amber-600 text-white px-4 py-2 flex items-center justify-between gap-2 text-sm">
      <span>
        {t("impersonation.impersonating", { name: name || email })}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="border-white text-white hover:bg-amber-700 hover:text-white"
        onClick={handleStop}
        disabled={isRestoring}
      >
        <EyeOff className="h-4 w-4 mr-1" />
        {isRestoring ? t("impersonation.restoring") : t("impersonation.backToSuperadmin")}
      </Button>
    </div>
  );
}
