"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
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
import { PASSWORD_REQUIREMENTS } from "@/lib/password";
import { ArrowLeft, KeyRound, Monitor, Moon, Palette, Save, Sun } from "lucide-react";

const THEME_OPTIONS = [
  { value: "light", label: "Chiaro", icon: Sun },
  { value: "dark", label: "Scuro", icon: Moon },
  { value: "system", label: "Automatico", icon: Monitor },
] as const;

export default function ChangePasswordPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
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
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Indietro
        </Button>
      </div>

      {/* Tema */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Tema
          </CardTitle>
          <CardDescription>
            Scegli il tema dell&apos;interfaccia
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
            &ldquo;Automatico&rdquo; segue le impostazioni del sistema operativo.
          </p>
        </CardContent>
      </Card>

      {/* Cambio password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Cambia Password
          </CardTitle>
          <CardDescription>
            Inserisci la password attuale e scegli una nuova password
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
              <Label htmlFor="currentPassword">Password Attuale</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nuova Password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
              />
              <p className="text-xs text-muted-foreground">
                {PASSWORD_REQUIREMENTS}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma Nuova Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "Aggiornamento..." : "Cambia Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
