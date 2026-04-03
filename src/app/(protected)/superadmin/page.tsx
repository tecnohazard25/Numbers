"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Organization } from "@/types/supabase";
import { OrganizationsTable } from "./organizations-table";
import { Building2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

export default function SuperadminPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [authorized, setAuthorized] = useState(false);

  const loadData = useCallback(async () => {
    const orgRes = await fetch("/api/organizations");
    const data = await orgRes.json();
    setOrganizations(data.organizations ?? []);
  }, []);

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-roles");
      const { roles } = await res.json();
      if (!roles?.includes("superadmin")) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      await loadData();
    }
    init();
  }, [router, loadData]);

  if (!authorized) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          {t("orgs.title")}
        </h1>
      </div>
      <OrganizationsTable
        organizations={organizations}
        onCreate={() => router.push("/superadmin/organizations/new")}
        onRefresh={loadData}
      />
    </div>
  );
}
