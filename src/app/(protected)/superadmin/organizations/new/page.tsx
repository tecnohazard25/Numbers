"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createOrganizationAction } from "@/app/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { X, Building2 } from "lucide-react";
import { CURRENCIES } from "@/lib/locale-defaults";
import { useTranslation } from "@/lib/i18n/context";

export default function NewOrganizationPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [authorized, setAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currency, setCurrency] = useState("EUR");

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-roles");
      const { roles } = await res.json();
      if (!roles?.includes("superadmin")) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
    }
    init();
  }, [router]);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    formData.set("currency", currency);

    const result = await createOrganizationAction(formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("orgs.created"));
      router.push("/superadmin");
    }
    setIsLoading(false);
  }

  if (!authorized) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{t("orgs.newOrg")}</CardTitle>
          <CardDescription>
            {t("orgs.afterCreationNote")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">{t("common.name")}</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="Centro Medico Rossi"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>{t("orgs.currency")}</Label>
              <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/superadmin")}
              >
                <X className="h-4 w-4 mr-1" />
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isLoading}>
                <Building2 className="h-4 w-4 mr-1" />
                {isLoading ? t("common.creating") : t("orgs.createOrganization")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
