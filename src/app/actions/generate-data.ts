"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

const FIRST_NAMES = [
  "Marco", "Luca", "Andrea", "Giuseppe", "Giovanni", "Alessandro",
  "Francesco", "Matteo", "Lorenzo", "Davide", "Simone", "Federico",
  "Maria", "Anna", "Giulia", "Francesca", "Sara", "Elena",
  "Chiara", "Valentina", "Alessia", "Martina", "Giorgia", "Laura",
];

const LAST_NAMES = [
  "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano",
  "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo",
  "Conti", "De Luca", "Mancini", "Costa", "Giordano", "Rizzo",
  "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro", "Mariani",
];

const COMPANY_NAMES = [
  "Tecnologie Avanzate", "Servizi Globali", "Costruzioni Moderne",
  "Soluzioni Digitali", "Consulenza Italia", "Energia Verde",
  "Logistica Express", "Alimentari Bio", "Design Studio", "Meccanica Precision",
  "Farmacia Centrale", "Ottica Moderna", "Edilizia Futura", "Auto Service",
  "Clinica Salute", "Laboratorio Analisi", "Centro Benessere", "Impresa Pulizie",
  "Trasporti Rapidi", "Sicurezza Globale",
];

const PA_NAMES = [
  "Comune di", "Provincia di", "Regione", "Azienda Sanitaria Locale",
  "Istituto Comprensivo", "Agenzia delle Entrate - Ufficio di",
  "Camera di Commercio di", "Tribunale di", "Questura di",
  "INPS - Sede di", "INAIL - Sede di", "Università degli Studi di",
  "Ospedale Civile di", "Vigili del Fuoco - Comando di", "Prefettura di",
];

const CITIES = [
  { city: "Roma", province: "RM", zip: "001" },
  { city: "Milano", province: "MI", zip: "201" },
  { city: "Napoli", province: "NA", zip: "801" },
  { city: "Torino", province: "TO", zip: "101" },
  { city: "Firenze", province: "FI", zip: "501" },
  { city: "Bologna", province: "BO", zip: "401" },
  { city: "Genova", province: "GE", zip: "161" },
  { city: "Palermo", province: "PA", zip: "901" },
  { city: "Bari", province: "BA", zip: "701" },
  { city: "Verona", province: "VR", zip: "371" },
  { city: "Padova", province: "PD", zip: "351" },
  { city: "Brescia", province: "BS", zip: "251" },
];

const STREETS = [
  "Via Roma", "Via Garibaldi", "Via Mazzini", "Via Dante", "Via Verdi",
  "Corso Italia", "Via Vittorio Emanuele", "Via Cavour", "Viale della Repubblica",
  "Via San Francesco", "Via Nazionale", "Via della Libertà",
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateTaxCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[randInt(0, 25)];
  for (let i = 0; i < 2; i++) code += digits[randInt(0, 9)];
  code += chars[randInt(0, 25)];
  for (let i = 0; i < 2; i++) code += digits[randInt(0, 9)];
  code += chars[randInt(0, 25)];
  for (let i = 0; i < 3; i++) code += digits[randInt(0, 9)];
  code += chars[randInt(0, 25)];
  return code;
}

function generateVatNumber(): string {
  let vat = "";
  for (let i = 0; i < 11; i++) vat += randInt(0, 9).toString();
  return vat;
}

function generateIban(): string {
  const abi = randInt(10000, 99999).toString();
  const cab = randInt(10000, 99999).toString();
  let cc = "";
  for (let i = 0; i < 12; i++) cc += randInt(0, 9).toString();
  return `IT${randInt(10, 99)}${String.fromCharCode(65 + randInt(0, 25))}${abi}${cab}${cc}`;
}

function generatePhone(): string {
  const prefixes = ["02", "06", "011", "051", "055", "041", "010", "081"];
  return `${rand(prefixes)} ${randInt(1000000, 9999999)}`;
}

function generateMobile(): string {
  const prefixes = ["320", "328", "333", "339", "347", "348", "349", "366", "388", "392"];
  return `${rand(prefixes)} ${randInt(1000000, 9999999)}`;
}

function generateEmail(first: string, last: string, domain?: string): string {
  const d = domain ?? rand(["gmail.com", "outlook.it", "libero.it", "yahoo.it", "pec.it"]);
  return `${first.toLowerCase()}.${last.toLowerCase().replace(/ /g, "")}@${d}`;
}

export async function generateRandomSubjectsAction(
  organizationId: string,
  count: number
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.roles.includes("superadmin")) {
    return { error: "Non autorizzato" };
  }

  if (count < 1 || count > 500) {
    return { error: "Inserisci un numero tra 1 e 500" };
  }

  const admin = createAdminClient();
  let created = 0;

  for (let i = 0; i < count; i++) {
    // 50% person, 30% company, 10% sole_trader, 10% public_administration
    const r = Math.random();
    const type = r < 0.5 ? "person" : r < 0.8 ? "company" : r < 0.9 ? "sole_trader" : "public_administration";
    const isPerson = type === "person";

    const firstName = isPerson ? rand(FIRST_NAMES) : null;
    const lastName = isPerson ? rand(LAST_NAMES) : null;
    let businessName: string | null = null;
    if (type === "company") {
      businessName = `${rand(COMPANY_NAMES)} ${rand(["S.r.l.", "S.p.A.", "S.n.c.", "S.a.s."])}`;
    } else if (type === "sole_trader") {
      businessName = `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)} - ${rand(COMPANY_NAMES)}`;
    } else if (type === "public_administration") {
      const city = rand(CITIES);
      businessName = `${rand(PA_NAMES)} ${city.city}`;
    }

    const gender = isPerson
      ? (FIRST_NAMES.indexOf(firstName!) < 12 ? "M" : "F")
      : null;

    const birthDate = isPerson
      ? `${randInt(1950, 2000)}-${String(randInt(1, 12)).padStart(2, "0")}-${String(randInt(1, 28)).padStart(2, "0")}`
      : null;

    const birthPlace = isPerson ? rand(CITIES).city : null;

    // Insert subject
    const { data: subject, error: subjectError } = await admin
      .from("subjects")
      .insert({
        organization_id: organizationId,
        type,
        first_name: firstName,
        last_name: lastName,
        business_name: businessName,
        tax_code: generateTaxCode(),
        vat_number: !isPerson ? generateVatNumber() : (Math.random() > 0.7 ? generateVatNumber() : null),
        gender,
        birth_date: birthDate,
        birth_place: birthPlace,
        sdi_code: !isPerson ? String(randInt(1000000, 9999999)) : null,
        iban: Math.random() > 0.5 ? generateIban() : null,
        notes: Math.random() > 0.8 ? "Soggetto generato automaticamente" : null,
        is_active: Math.random() > 0.1,
        created_by: currentUser.user.id,
      })
      .select("id")
      .single();

    if (subjectError || !subject) continue;

    // Add 1-2 addresses
    const addrCount = randInt(1, 2);
    for (let a = 0; a < addrCount; a++) {
      const loc = rand(CITIES);
      await admin.from("subject_addresses").insert({
        subject_id: subject.id,
        label: a === 0 ? "Sede legale" : "Sede operativa",
        is_primary: a === 0,
        country_code: "IT",
        street: `${rand(STREETS)}, ${randInt(1, 200)}`,
        zip_code: `${loc.zip}${String(randInt(10, 99))}`,
        city: loc.city,
        province: loc.province,
        region: null,
      });
    }

    // Add 1-3 contacts
    const contactCount = randInt(1, 3);
    const name = firstName ?? businessName ?? "info";
    const surname = lastName ?? "";
    for (let c = 0; c < contactCount; c++) {
      const contactType = c === 0
        ? "email"
        : rand(["phone", "mobile", "pec"] as const);

      let value: string;
      if (contactType === "email") {
        value = generateEmail(name, surname);
      } else if (contactType === "pec") {
        value = generateEmail(name, surname, "pec.it");
      } else if (contactType === "mobile") {
        value = generateMobile();
      } else {
        value = generatePhone();
      }

      await admin.from("subject_contacts").insert({
        subject_id: subject.id,
        type: contactType,
        label: c === 0 ? "Principale" : null,
        value,
        is_primary: c === 0,
      });
    }

    created++;
  }

  return { success: true, created };
}

// --- Transaction descriptions ---

const IN_DESCRIPTIONS = [
  "Bonifico da paziente", "Pagamento visita specialistica", "Pagamento esame diagnostico",
  "Incasso prestazione ambulatoriale", "Bonifico da assicurazione", "Pagamento fisioterapia",
  "Incasso fattura", "Pagamento consulto medico", "Rimborso da fornitore",
  "Accredito convenzione ASL", "Incasso ticket sanitario", "Pagamento ecografia",
  "Bonifico da ente pubblico", "Incasso radiografia", "Pagamento analisi laboratorio",
  "Accredito stipendio medico convenzionato", "Incasso day hospital",
  "Pagamento intervento chirurgico ambulatoriale", "Bonifico da paziente privato",
  "Incasso prestazione infermieristica",
];

const OUT_DESCRIPTIONS = [
  "Pagamento fornitore materiale sanitario", "Stipendio personale medico",
  "Canone affitto locali", "Bolletta energia elettrica", "Bolletta gas",
  "Acquisto farmaci", "Manutenzione apparecchiature", "Assicurazione responsabilità civile",
  "Pagamento consulente fiscale", "Acquisto materiale di consumo", "Rata leasing attrezzature",
  "Pagamento servizio pulizie", "Abbonamento software gestionale", "Contributi INPS",
  "Pagamento laboratorio analisi esterno", "Acquisto dispositivi medici",
  "Spese postali e corriere", "Manutenzione impianti", "Pagamento utenze telefoniche",
  "Tassa rifiuti", "Formazione personale", "Riparazione strumenti diagnostici",
];

const REFERENCE_PREFIXES = [
  "BON-", "FAT-", "RIC-", "PAG-", "TRN-", "ACC-", "INC-",
];

export async function generateRandomTransactionsAction(
  organizationId: string,
  count: number
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.roles.includes("superadmin")) {
    return { error: "Non autorizzato" };
  }

  if (count < 1 || count > 1000) {
    return { error: "Inserisci un numero tra 1 e 1000" };
  }

  const admin = createAdminClient();

  // Fetch active collection resources for this org
  const { data: resources } = await admin
    .from("collection_resources")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (!resources || resources.length === 0) {
    return { error: "Nessuna risorsa di incasso attiva. Crea almeno una risorsa prima di generare movimenti." };
  }

  // Fetch subjects for this org (to randomly associate)
  const { data: subjects } = await admin
    .from("subjects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  const subjectIds = subjects?.map((s) => s.id) ?? [];

  let created = 0;

  // Generate transactions spread over the last 12 months
  const now = new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const startMs = twelveMonthsAgo.getTime();
  const rangeMs = now.getTime() - startMs;

  for (let i = 0; i < count; i++) {
    // 55% in, 45% out
    const direction = Math.random() < 0.55 ? "in" : "out";
    const descriptions = direction === "in" ? IN_DESCRIPTIONS : OUT_DESCRIPTIONS;
    const description = rand(descriptions);

    // Random amount: in = 50-5000, out = 20-8000
    const amount =
      direction === "in"
        ? parseFloat((randInt(5000, 500000) / 100).toFixed(2))
        : parseFloat((randInt(2000, 800000) / 100).toFixed(2));

    // Random date in last 12 months
    const txDate = new Date(startMs + Math.random() * rangeMs);
    const transactionDate = txDate.toISOString().split("T")[0];

    // Reference: 60% have one
    const reference =
      Math.random() < 0.6
        ? `${rand(REFERENCE_PREFIXES)}${randInt(100000, 999999)}`
        : null;

    // Subject: 70% linked, 30% no subject
    const subjectId =
      subjectIds.length > 0 && Math.random() < 0.7
        ? rand(subjectIds)
        : null;

    const { error } = await admin.from("transactions").insert({
      organization_id: organizationId,
      collection_resource_id: rand(resources).id,
      subject_id: subjectId,
      direction,
      amount,
      transaction_date: transactionDate,
      description,
      reference,
      created_by: currentUser.user.id,
    });

    if (!error) created++;
  }

  return { success: true, created };
}
