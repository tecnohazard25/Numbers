"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateRandomSubjectsAction } from "@/app/actions/generate-data";
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
import { toast } from "sonner";
import { ArrowLeft, Database, Loader2 } from "lucide-react";

export default function GenerateDataPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;

  const [orgName, setOrgName] = useState("");
  const [count, setCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function init() {
      const rolesRes = await fetch("/api/user-roles");
      const { roles } = await rolesRes.json();
      if (!roles?.includes("superadmin")) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);

      const orgRes = await fetch(`/api/organizations/${orgId}`);
      const data = await orgRes.json();
      setOrgName(data.organization?.name ?? "");
    }
    init();
  }, [orgId, router]);

  async function handleGenerate() {
    setIsGenerating(true);
    setResult(null);
    const res = await generateRandomSubjectsAction(orgId, count);
    if (res.error) {
      toast.error(res.error);
    } else {
      setResult({ created: res.created ?? 0 });
      toast.success(`${res.created} soggetti creati con successo`);
    }
    setIsGenerating(false);
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/superadmin/organizations/${orgId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Genera dati</h1>
          <p className="text-sm text-muted-foreground">{orgName}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Soggetti random
          </CardTitle>
          <CardDescription>
            Genera soggetti casuali (persone e aziende) con indirizzi e contatti
            per testare il sistema. I dati generati includono codice fiscale,
            P.IVA, IBAN, indirizzi e contatti realistici.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="count">Quanti soggetti generare?</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            />
            <p className="text-xs text-muted-foreground">
              Massimo 500. Circa 60% persone fisiche, 40% aziende.
            </p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || count < 1 || count > 500}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generazione in corso...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Genera {count} soggetti
              </>
            )}
          </Button>

          {result && (
            <div className="rounded-md bg-green-500/10 text-green-400 p-3 text-sm">
              Creati {result.created} soggetti con successo.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
