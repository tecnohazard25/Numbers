"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  generateRandomSubjectsAction,
  generateRandomTransactionsAction,
  generateRandomEntitiesAction,
} from "@/app/actions/generate-data";
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
import { ArrowLeft, ArrowLeftRight, Building2, Database, Loader2 } from "lucide-react";

export default function GenerateDataPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;

  const [orgName, setOrgName] = useState("");
  const [count, setCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ created: number } | null>(null);

  const [txCount, setTxCount] = useState(50);
  const [isTxGenerating, setIsTxGenerating] = useState(false);
  const [txResult, setTxResult] = useState<{ created: number } | null>(null);

  const [isEntGenerating, setIsEntGenerating] = useState(false);
  const [entResult, setEntResult] = useState<{ counts: { branches: number; workplaces: number; rooms: number; doctors: number; activities: number } } | null>(null);

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
          onClick={() => router.push("/superadmin")}
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
              value={count === 0 ? "" : count}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setCount(0);
                } else {
                  const n = parseInt(val);
                  if (!isNaN(n)) setCount(Math.min(n, 500));
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Massimo 500. Circa 50% persone fisiche, 30% aziende, 10% ditte individuali, 10% enti pubblici.
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Movimenti random
          </CardTitle>
          <CardDescription>
            Genera movimenti casuali (entrate e uscite) distribuiti negli ultimi
            12 mesi. Richiede almeno una risorsa di incasso attiva.
            I movimenti vengono associati casualmente alle risorse di incasso e ai soggetti esistenti.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="txCount">Quanti movimenti generare?</Label>
            <Input
              id="txCount"
              type="number"
              min={1}
              max={1000}
              value={txCount === 0 ? "" : txCount}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setTxCount(0);
                } else {
                  const n = parseInt(val);
                  if (!isNaN(n)) setTxCount(Math.min(n, 1000));
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Massimo 1000. Circa 55% entrate, 45% uscite. Importi tra €20 e €8.000.
            </p>
          </div>

          <Button
            onClick={async () => {
              setIsTxGenerating(true);
              setTxResult(null);
              const res = await generateRandomTransactionsAction(orgId, txCount);
              if (res.error) {
                toast.error(res.error);
              } else {
                setTxResult({ created: res.created ?? 0 });
                toast.success(`${res.created} movimenti creati con successo`);
              }
              setIsTxGenerating(false);
            }}
            disabled={isTxGenerating || txCount < 1 || txCount > 1000}
            className="w-full"
          >
            {isTxGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generazione in corso...
              </>
            ) : (
              <>
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Genera {txCount} movimenti
              </>
            )}
          </Button>

          {txResult && (
            <div className="rounded-md bg-green-500/10 text-green-400 p-3 text-sm">
              Creati {txResult.created} movimenti con successo.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Entità random
          </CardTitle>
          <CardDescription>
            Genera un set completo di entità per il centro medico: branche specialistiche,
            sedi, ambulatori, medici e prestazioni con relazioni tra loro.
            Vengono generati 8-15 branche, 3-6 sedi, 2-4 ambulatori per sede,
            8-15 medici e 12-20 prestazioni.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={async () => {
              setIsEntGenerating(true);
              setEntResult(null);
              const res = await generateRandomEntitiesAction(orgId);
              if (res.error) {
                toast.error(res.error);
              } else if (res.counts) {
                setEntResult({ counts: res.counts });
                const total = res.counts.branches + res.counts.workplaces + res.counts.rooms + res.counts.doctors + res.counts.activities;
                toast.success(`${total} entità create con successo`);
              }
              setIsEntGenerating(false);
            }}
            disabled={isEntGenerating}
            className="w-full cursor-pointer"
          >
            {isEntGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generazione in corso...
              </>
            ) : (
              <>
                <Building2 className="h-4 w-4 mr-2" />
                Genera entità
              </>
            )}
          </Button>

          {entResult && (
            <div className="rounded-md bg-green-500/10 text-green-400 p-3 text-sm space-y-1">
              <p>Entità create con successo:</p>
              <ul className="list-disc list-inside text-xs">
                <li>{entResult.counts.branches} branche</li>
                <li>{entResult.counts.workplaces} sedi</li>
                <li>{entResult.counts.rooms} ambulatori</li>
                <li>{entResult.counts.doctors} medici</li>
                <li>{entResult.counts.activities} prestazioni</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
