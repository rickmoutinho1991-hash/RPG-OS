/**
 * Validador de IBAN Português (PT50 + 21 dígitos numéricos com verificação MOD 97-10)
 */
export function isValidPortugueseIban(iban: string): boolean {
  if (!iban) return false;
  const clean = iban.replace(/\s+/g, "").toUpperCase();

  if (!/^PT50\d{21}$/.test(clean)) {
    return false;
  }

  // Mover os primeiros 4 caracteres para o fim
  const rearranged = clean.slice(4) + clean.slice(0, 4);

  // Converter letras para dígitos (P=25, T=29)
  let numericString = "";
  for (let i = 0; i < rearranged.length; i++) {
    const char = rearranged[i];
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numericString += (code - 55).toString();
    } else {
      numericString += char;
    }
  }

  // Algoritmo MOD 97 em chunks para evitar overflow
  let remainder = 0;
  for (let i = 0; i < numericString.length; i += 7) {
    const chunk = remainder.toString() + numericString.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }

  return remainder === 1;
}

export function formatPortugueseIban(iban: string): string {
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  if (clean.length === 25 && clean.startsWith("PT50")) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)} ${clean.slice(12, 16)} ${clean.slice(16, 20)} ${clean.slice(20, 24)} ${clean.slice(24)}`;
  }
  return iban;
}
