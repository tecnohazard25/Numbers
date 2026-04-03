"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import { LogIn, Mail, ArrowLeft, KeyRound } from "lucide-react";
import { I18nProvider, useTranslation } from "@/lib/i18n/context";
import { detectBrowserLocale } from "@/lib/locale-defaults";

function LoginFormContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const urlError = searchParams.get("error");
  const urlMessage = searchParams.get("message");

  const errorMessages: Record<string, string> = {
    account_disabled: t("auth.accountDeactivated"),
    organization_disabled: t("auth.orgDeactivated"),
    auth_error: t("auth.authError"),
  };

  const successMessages: Record<string, string> = {
    password_reset_success: t("auth.passwordResetSuccess"),
  };

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
      setError(t("auth.emailAndPasswordRequired"));
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(t("auth.invalidCredentials"));
      setIsLoading(false);
      return;
    }

    // Fetch role to determine redirect
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError(t("auth.loginError"));
      setIsLoading(false);
      return;
    }

    // Use API route to get roles (bypasses RLS)
    const res = await fetch("/api/user-roles");
    const { roles } = await res.json();

    if (roles?.includes("superadmin")) {
      router.push("/superadmin");
    } else if (roles?.includes("user_manager")) {
      router.push("/org/users");
    } else {
      router.push("/dashboard");
    }
  }

  async function handleResetRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    if (!email) {
      setError(t("auth.emailRequired"));
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (resetError) {
      setError(t("auth.resetEmailError"));
    } else {
      setSuccess(t("auth.resetEmailSent"));
    }
    setIsLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {showReset ? t("auth.resetPassword") : t("auth.login")}
          </CardTitle>
          <CardDescription>
            {showReset
              ? t("auth.sendResetLink")
              : t("auth.managementTitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {urlError && errorMessages[urlError] && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {errorMessages[urlError]}
            </div>
          )}
          {urlMessage && successMessages[urlMessage] && (
            <div className="mb-4 p-3 rounded-md bg-green-50 text-green-700 text-sm">
              {successMessages[urlMessage]}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-md bg-green-50 text-green-700 text-sm">
              {success}
            </div>
          )}

          {showReset ? (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder={t("auth.emailPlaceholder")}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                <Mail className="h-4 w-4 mr-2" />
                {isLoading ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setShowReset(false);
                  setError("");
                  setSuccess("");
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("auth.backToLogin")}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder={t("auth.emailPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                <LogIn className="h-4 w-4 mr-2" />
                {isLoading ? t("auth.loggingIn") : t("auth.login")}
              </Button>
              <Button
                type="button"
                variant="link"
                className="w-full"
                onClick={() => {
                  setShowReset(true);
                  setError("");
                  setSuccess("");
                }}
              >
                <KeyRound className="h-4 w-4 mr-2" />
                {t("auth.forgotPassword")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function LoginForm() {
  const [locale] = useState(() => detectBrowserLocale());
  return (
    <I18nProvider locale={locale}>
      <LoginFormContent />
    </I18nProvider>
  );
}
