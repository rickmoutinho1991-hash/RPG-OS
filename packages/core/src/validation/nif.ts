export type PortugueseNifType =
  | "INDIVIDUAL" // 1, 2, 3 (Pessoas Singulares)
  | "SOLE_TRADER" // 1, 2 (Empresários em Nome Individual / Profissionais)
  | "COMPANY" // 5 (Sociedades Comerciais / Pessoas Coletivas)
  | "PUBLIC_ENTITY" // 6 (Organismos da Administração Pública)
  | "HERITAGE" // 70, 71, 72 (Heranças Indivisas)
  | "NON_PROFIT" // 50, 51, 90, 91 (Associações, Condomínios, etc.)
  | "OTHER"
  | "INVALID";

export function isValidPortugueseNif(value: string): boolean {
  if (!value) return false;
  const nif = value.replace(/\s/g, "");

  if (!/^\d{9}$/.test(nif)) {
    return false;
  }

  const firstDigit = Number(nif[0]);

  if (![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(firstDigit)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(nif[i]) * (9 - i);
  }

  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;

  return checkDigit === Number(nif[8]);
}

export function isValidPortugueseIndividualNif(value: string): boolean {
  if (!isValidPortugueseNif(value)) return false;
  const clean = value.replace(/\s/g, "");
  const first = Number(clean[0]);
  return [1, 2, 3].includes(first);
}

export function isValidPortugueseCompanyNipc(value: string): boolean {
  if (!isValidPortugueseNif(value)) return false;
  const clean = value.replace(/\s/g, "");
  const first = Number(clean[0]);
  return [5, 6].includes(first);
}

export function classifyPortugueseNif(value: string): PortugueseNifType {
  if (!isValidPortugueseNif(value)) return "INVALID";
  const clean = value.replace(/\s/g, "");
  const first = clean[0];
  const firstTwo = clean.slice(0, 2);

  if (first === "5") return "COMPANY";
  if (first === "6") return "PUBLIC_ENTITY";
  if (["70", "71", "72"].includes(firstTwo)) return "HERITAGE";
  if (["90", "91", "98", "99"].includes(firstTwo)) return "NON_PROFIT";
  if (first === "4") return "SOLE_TRADER";
  if (["1", "2", "3"].includes(first)) return "INDIVIDUAL";

  return "OTHER";
}

export function formatPortugueseNif(value: string): string {
  const clean = value.replace(/\D/g, "");
  if (clean.length === 9) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return value;
}
