/**
 * Validador de número de telefone português
 * Suporta formatos móveis (91, 92, 93, 96), fixos (21, 22, 2xx) e prefixo internacional (+351 / 00351).
 */
export function isValidPortuguesePhone(phone: string): boolean {
  if (!phone) return false;
  // Remove espaços, traços, pontos e parênteses
  let clean = phone.replace(/[\s\-\.\(\)]/g, "");

  // Trata prefixos internacionais
  if (clean.startsWith("+351")) {
    clean = clean.slice(4);
  } else if (clean.startsWith("00351")) {
    clean = clean.slice(5);
  }

  // Deve ter 9 dígitos e começar por 2, 30, 70, 80, 91, 92, 93, 96
  const regex = /^(?:2\d{8}|30\d{7}|70\d{7}|80\d{7}|9[1236]\d{7})$/;
  return regex.test(clean);
}

export function formatPortuguesePhone(phone: string): string {
  let clean = phone.replace(/[\s\-\.\(\)]/g, "");
  let prefix = "";

  if (clean.startsWith("+351")) {
    prefix = "+351 ";
    clean = clean.slice(4);
  } else if (clean.startsWith("00351")) {
    prefix = "+351 ";
    clean = clean.slice(5);
  }

  if (clean.length === 9) {
    return `${prefix}${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }

  return phone;
}
