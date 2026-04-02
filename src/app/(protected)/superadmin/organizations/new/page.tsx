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
import {
  SUPPORTED_LOCALES,
  CURRENCIES,
  getLocaleDefaults,
  detectBrowserLocale,
} from "@/lib/locale-defaults";

export default function NewOrganizationPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [locale, setLocale] = useState("it-IT");
  const [currency, setCurrency] = useState("EUR");
  const [dateFormat, setDateFormat] = useState("dd/MM/yyyy");
  const [timeFormat, setTimeFormat] = useState("HH:mm");
  const [decimalSep, setDecimalSep] = useState(",");
  const [thousandsSep, setThousandsSep] = useState(".");

  useEffect(() => {
    const detected = detectBrowserLocale();
    applyLocaleDefaults(detected);
  }, []);

  function applyLocaleDefaults(loc: string) {
    setLocale(loc);
    const defaults = getLocaleDefaults(loc);
    setCurrency(defaults.currency);
    setDateFormat(defaults.date_format);
    setTimeFormat(defaults.time_format);
    setDecimalSep(defaults.decimal_separator);
    setThousandsSep(defaults.thousands_separator);
  }

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    formData.set("locale", locale);
    formData.set("currency", currency);
    formData.set("date_format", dateFormat);
    formData.set("time_format", timeFormat);
    formData.set("decimal_separator", decimalSep);
    formData.set("thousands_separator", thousandsSep);

    const result = await createOrganizationAction(formData);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Organizzazione creata con successo");
      router.push("/superadmin");
    }
    setIsLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Nuova Organizzazione</CardTitle>
          <CardDescription>
            Dopo la creazione potrai aggiungere gli utenti dalla pagina Gestisci
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="Centro Medico Rossi"
              />
            </div>

            <Separator />

            <h3 className="font-medium">Impostazioni regionali</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Lingua</Label>
                <Select value={locale} onValueChange={(v) => v && applyLocaleDefaults(v)}>
                  <SelectTrigger>
                    <SelectValue />
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
                <Label>Valuta</Label>
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

              <div className="space-y-2">
                <Label>Formato data</Label>
                <Input
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Formato ora</Label>
                <Input
                  value={timeFormat}
                  onChange={(e) => setTimeFormat(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Separatore decimale</Label>
                <Input
                  value={decimalSep}
                  onChange={(e) => setDecimalSep(e.target.value)}
                  maxLength={1}
                />
              </div>

              <div className="space-y-2">
                <Label>Separatore migliaia</Label>
                <Input
                  value={thousandsSep}
                  onChange={(e) => setThousandsSep(e.target.value)}
                  maxLength={1}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/superadmin")}
              >
                <X className="h-4 w-4 mr-1" />
                Annulla
              </Button>
              <Button type="submit" disabled={isLoading}>
                <Building2 className="h-4 w-4 mr-1" />
                {isLoading ? "Creazione..." : "Crea Organizzazione"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
