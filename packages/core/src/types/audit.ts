export interface AuditLogEntry {
  id: string;
  userId: string;
  userName?: string;
  companyId?: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  ip?: string;
  device?: string;
  metadata?: Record<string, unknown>;
}

export interface RgpdConsentRecord {
  id: string;
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  marketingConsent: boolean;
  communicationConsent: boolean;
  acceptedAt: string;
  ipAddress?: string;
  userAgent?: string;
}
