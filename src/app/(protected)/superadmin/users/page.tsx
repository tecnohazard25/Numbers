"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UsersPageClient } from "./users-page-client";

export default function SuperadminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [authorized, setAuthorized] = useState(false);

  const loadData = useCallback(async () => {
    const dataRes = await fetch("/api/users");
    const data = await dataRes.json();
    setUsers(data.users ?? []);
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
    <UsersPageClient
      users={users}
      organizations={organizations}
      isSuperadmin={true}
      onRefresh={loadData}
    />
  );
}
