/**
 * Validador de Código Postal Português (formato XXXX-XXX)
 */
export function isValidPortuguesePostalCode(postalCode: string): boolean {
  if (!postalCode) return false;
  const clean = postalCode.trim();
  const regex = /^[1-9]\d{3}-\d{3}$/;
  return regex.test(clean);
}

export function formatPortuguesePostalCode(postalCode: string): string {
  const digits = postalCode.replace(/\D/g, "");
  if (digits.length === 7) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return postalCode;
}
