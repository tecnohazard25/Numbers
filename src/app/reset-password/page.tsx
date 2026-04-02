"use client";

import { useState } from "react";
import { resetPasswordAction } from "@/app/actions/auth";
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

export default function ResetPasswordPage() {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError("");
    const result = await resetPasswordAction(formData);
    if (result?.error) {
      setError(result.error);
    }
    setIsLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Nuova Password</CardTitle>
          <CardDescription>Inserisci la tua nuova password</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nuova Password</Label>
              <Input id="password" name="password" type="password" required />
              <p className="text-xs text-muted-foreground">
                {PASSWORD_REQUIREMENTS}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Conferma Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Aggiornamento..." : "Aggiorna Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
