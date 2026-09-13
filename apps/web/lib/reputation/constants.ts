// RPG-OS — Constantes partilhadas dos anexos de reputação (server + client-safe).
// Sem imports de Node/BD — pode ser importado por componentes client.

export const REPUTATION_ATTACHMENTS_BUCKET = "reputation-attachments";
export const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];