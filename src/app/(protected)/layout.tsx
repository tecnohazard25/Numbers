"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { I18nProvider } from "@/lib/i18n/context";

interface ImpersonationInfo {
  userId: string;
  name: string;
  email: string;
  organizationId: string | null;
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>([]);
  const [userName, setUserName] = useState("");
  const [locale, setLocale] = useState("it-IT");
  const [impersonating, setImpersonating] = useState<ImpersonationInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const res = await fetch("/api/user-info");
      const data = await res.json();

      if (!data.profile) {
        router.push("/login");
        return;
      }

      setRoles(data.roles ?? []);
      setUserName(data.userName ?? "");
      setLocale(data.profile?.locale ?? "it-IT");
      setImpersonating(data.impersonating ?? null);
      setLoading(false);
    }

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <I18nProvider locale={locale}>
      {impersonating && (
        <ImpersonationBanner
          name={impersonating.name}
          email={impersonating.email}
        />
      )}
      <AppLayout roles={roles} userName={userName}>
        {children}
      </AppLayout>
    </I18nProvider>
  );
}
