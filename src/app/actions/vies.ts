"use server";

interface ViesResult {
  valid: boolean;
  name?: string;
  address?: string;
  error?: string;
}

export async function verifyVatAction(
  vatNumber: string,
  countryCode: string = "IT"
): Promise<ViesResult> {
  if (!vatNumber || vatNumber.trim().length === 0) {
    return { valid: false, error: "Partita IVA non fornita" };
  }

  let cleanVat = vatNumber.trim().replace(/\s/g, "");
  if (cleanVat.toUpperCase().startsWith(countryCode.toUpperCase())) {
    cleanVat = cleanVat.slice(countryCode.length);
  }

  try {
    const response = await fetch(
      "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: countryCode.toUpperCase(),
          vatNumber: cleanVat,
        }),
      }
    );

    if (!response.ok) {
      return { valid: false, error: "Servizio VIES non disponibile" };
    }

    const data = await response.json();

    return {
      valid: data.valid === true,
      name: data.name && data.name !== "---" ? data.name : undefined,
      address: data.address && data.address !== "---" ? data.address : undefined,
    };
  } catch {
    return { valid: false, error: "Errore nella verifica VIES" };
  }
}
