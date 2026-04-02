"use client";

import { useEffect, useState } from "react";
import { Organization } from "@/types/supabase";
import { OrganizationsTable } from "./organizations-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function SuperadminPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => setOrganizations(data.organizations ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">Organizzazioni</h1>
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
