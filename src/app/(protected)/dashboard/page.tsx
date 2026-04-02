"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  const [userName, setUserName] = useState("");
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/user-info")
      .then((res) => res.json())
      .then((data) => {
        setUserName(data.userName ?? "");
        setRoles(data.roles ?? []);
      });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Benvenuto, {userName}</CardTitle>
          <CardDescription>Gestionale Centro Medico</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">I tuoi ruoli:</p>
            <div className="flex gap-2 flex-wrap">
              {roles.map((role) => (
                <Badge key={role} variant="outline">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
