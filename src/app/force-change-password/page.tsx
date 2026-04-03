"use client";

import { useState } from "react";
import { forceChangePasswordAction } from "@/app/actions/auth";
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
import { PASSWORD_REQUIREMENTS_KEY } from "@/lib/password";
import { I18nProvider, useTranslation } from "@/lib/i18n/context";
import { detectBrowserLocale } from "@/lib/locale-defaults";

function ForceChangePasswordContent() {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError("");
    const result = await forceChangePasswordAction(formData);
    if (result?.error) {
      setError(result.error);
    }
    setIsLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("auth.passwordExpired")}</CardTitle>
          <CardDescription>
            {t("auth.passwordExpiredDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t("auth.currentPassword")}</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("auth.newPassword")}</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
              />
              <p className="text-xs text-muted-foreground">
                {t(PASSWORD_REQUIREMENTS_KEY)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("auth.confirmNewPassword")}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t("auth.updating") : t("auth.changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ForceChangePasswordPage() {
  const [locale] = useState(() => detectBrowserLocale());
  return (
    <I18nProvider locale={locale}>
      <ForceChangePasswordContent />
    </I18nProvider>
  );
}
