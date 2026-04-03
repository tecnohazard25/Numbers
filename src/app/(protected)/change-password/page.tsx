"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { forceChangePasswordAction, updateProfileSettingsAction } from "@/app/actions/auth";
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
import { PASSWORD_REQUIREMENTS_KEY } from "@/lib/password";
import {
  SUPPORTED_LOCALES,
  DATE_FORMATS,
  TIME_FORMATS,
  DECIMAL_SEPARATORS,
  THOUSANDS_SEPARATORS,
  getLocaleDefaults,
  detectBrowserLocale,
} from "@/lib/locale-defaults";
import { toast } from "sonner";
import { ArrowLeft, Globe, KeyRound, Monitor, Moon, Palette, Save, Sun } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";

const SEPARATOR_LABEL_MAP: Record<string, string> = {
  "Virgola (,)": "regional.comma",
  "Punto (.)": "regional.dot",
  "Spazio ( )": "regional.space",
  "Nessuno": "regional.none",
};

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const THEME_OPTIONS = [
    { value: "light", label: t("profile.light"), icon: Sun },
    { value: "dark", label: t("profile.dark"), icon: Moon },
    { value: "system", label: t("profile.auto"), icon: Monitor },
  ] as const;

  // Regional settings
  const [locale, setLocale] = useState("it-IT");
  const [dateFormat, setDateFormat] = useState("dd/MM/yyyy");
  const [timeFormat, setTimeFormat] = useState("HH:mm");
  const [decimalSep, setDecimalSep] = useState(",");
  const [thousandsSep, setThousandsSep] = useState(".");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const res = await fetch("/api/user-info");
      const data = await res.json();
      const p = data.profile;
      if (p) {
        setLocale(p.locale ?? "it-IT");
        setDateFormat(p.date_format ?? "dd/MM/yyyy");
        setTimeFormat(p.time_format ?? "HH:mm");
        setDecimalSep(p.decimal_separator ?? ",");
        setThousandsSep(p.thousands_separator ?? ".");
      }
    }
    loadProfile();
  }, []);

  function handleLocaleChange(newLocale: string) {
    setLocale(newLocale);
    const defaults = getLocaleDefaults(newLocale);
    setDateFormat(defaults.date_format);
    setTimeFormat(defaults.time_format);
    setDecimalSep(defaults.decimal_separator);
    setThousandsSep(defaults.thousands_separator);
  }

  function translateSeparatorLabel(label: string): string {
    return SEPARATOR_LABEL_MAP[label] ? t(SEPARATOR_LABEL_MAP[label]) : label;
  }

  async function handleSaveSettings() {
    setIsSavingSettings(true);
    const result = await updateProfileSettingsAction({
      locale,
      date_format: dateFormat,
      time_format: timeFormat,
      decimal_separator: decimalSep,
      thousands_separator: thousandsSep,
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(t("profile.settingsSaved"));
    }
    setIsSavingSettings(false);
  }

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
    <div className="max-w-md mx-auto space-y-6 overflow-auto flex-1">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("common.back")}
        </Button>
      </div>

      {/* Tema */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t("profile.theme")}
          </CardTitle>
          <CardDescription>
            {t("profile.themeDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <Icon className={`h-6 w-6 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-sm font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {t("profile.autoDesc")}
          </p>
        </CardContent>
      </Card>

      {/* Impostazioni regionali */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t("profile.regionalSettings")}
          </CardTitle>
          <CardDescription>
            {t("profile.regionalDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("profile.language")}</Label>
            <Select value={locale} onValueChange={(v) => v && handleLocaleChange(v)}>
              <SelectTrigger className="!w-full">
                <SelectValue>
                  {SUPPORTED_LOCALES.find((l) => l.value === locale)?.label ?? locale}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("profile.dateFormat")}</Label>
            <Select value={dateFormat} onValueChange={(v) => v && setDateFormat(v)}>
              <SelectTrigger className="!w-full">
                <SelectValue>
                  {DATE_FORMATS.find((f) => f.value === dateFormat)?.label ?? dateFormat}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("profile.timeFormat")}</Label>
            <Select value={timeFormat} onValueChange={(v) => v && setTimeFormat(v)}>
              <SelectTrigger className="!w-full">
                <SelectValue>
                  {TIME_FORMATS.find((f) => f.value === timeFormat)?.label ?? timeFormat}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIME_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("profile.decimalSeparator")}</Label>
            <Select value={decimalSep} onValueChange={(v) => v && setDecimalSep(v)}>
              <SelectTrigger className="!w-full">
                <SelectValue>
                  {translateSeparatorLabel(DECIMAL_SEPARATORS.find((s) => s.value === decimalSep)?.label ?? decimalSep)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DECIMAL_SEPARATORS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {translateSeparatorLabel(s.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("profile.thousandsSeparator")}</Label>
            <Select value={thousandsSep} onValueChange={(v) => v !== null && setThousandsSep(v)}>
              <SelectTrigger className="!w-full">
                <SelectValue>
                  {translateSeparatorLabel(THOUSANDS_SEPARATORS.find((s) => s.value === thousandsSep)?.label ?? thousandsSep)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {THOUSANDS_SEPARATORS.map((s) => (
                  <SelectItem key={s.value || "none"} value={s.value}>
                    {translateSeparatorLabel(s.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const detected = detectBrowserLocale();
                handleLocaleChange(detected);
                toast.success(t("profile.settingsLoaded", { locale: detected }));
              }}
            >
              <Globe className="h-4 w-4 mr-1" />
              {t("profile.detectFromBrowser")}
            </Button>
            <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
              <Save className="h-4 w-4 mr-1" />
              {isSavingSettings ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cambio password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("auth.changePassword")}
          </CardTitle>
          <CardDescription>
            {t("auth.enterCurrentAndNew")}
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
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? t("auth.updating") : t("auth.changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
