"use client";

import { useEffect, useState } from "react";
import { UsersPageClient } from "./users-page-client";

export default function SuperadminUsersPage() {
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);

  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users ?? []);
        setOrganizations(data.organizations ?? []);
      });
  }, []);

  return (
    <UsersPageClient
      users={users}
      organizations={organizations}
      isSuperadmin={true}
    />
  );
}
