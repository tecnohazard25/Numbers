"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Organization } from "@/types/supabase";
import { OrganizationsTable } from "./organizations-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Building2, Plus } from "lucide-react";

export default function SuperadminPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-roles");
      const { roles } = await res.json();
      if (!roles?.includes("superadmin")) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      const orgRes = await fetch("/api/organizations");
      const data = await orgRes.json();
      setOrganizations(data.organizations ?? []);
    }
    init();
  }, [router]);

  if (!authorized) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          Organizzazioni
        </h1>
        <Link href="/superadmin/organizations/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nuova Organizzazione
          </Button>
        </Link>
      </div>
      <OrganizationsTable organizations={organizations} />
    </div>
  );
}
