/**
 * Interfaces para integrações oficiais portuguesas.
 * Nenhuma integração deve alegar estar em funcionamento sem estar devidamente credenciada.
 */

export interface ChaveMovelDigitalAuthRequest {
  citizenId?: string;
  phoneNumber?: string;
  callbackUrl: string;
}

export interface ChaveMovelDigitalAuthResponse {
  authenticated: boolean;
  nif?: string;
  fullName?: string;
  citizenCardNumber?: string;
  verificationToken?: string;
  error?: string;
}

export interface CartaoCidadaoAuthPayload {
  certificate: string;
  signature: string;
}

export interface AtTaxValidationRequest {
  taxNumber: string;
  checkVatVies?: boolean;
}

export interface AtTaxValidationResponse {
  valid: boolean;
  taxNumber: string;
  name?: string;
  activityCode?: string; // CAE
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  verifiedAt: string;
  /**
   * Proveniência da verificação. Sem consulta à AT, é sempre LOCAL_FORMAT_CHECK
   * (checksum local) — nunca interpretar como confirmação oficial.
   */
  verificationSource?: "LOCAL_FORMAT_CHECK" | "AT";
}

export interface EFaturaCommunicationPayload {
  invoiceId: string;
  invoiceNumber: string;
  atcud: string;
  hash: string;
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
}

export interface EFaturaCommunicationResult {
  success: boolean;
  registrationNumber?: string;
  submittedAt: string;
  status: "REGISTERED" | "QUEUED_OFFLINE" | "ERROR";
  errorMessage?: string;
}

export interface SibsMbWayPaymentRequest {
  paymentId: string;
  phoneNumber: string;
  amount: number;
  description: string;
}

export interface SibsMultibancoReferenceResponse {
  entity: string; // e.g. "12345"
  reference: string; // e.g. "123 456 789"
  amount: number;
  expiresAt: string;
}


// DISPOSITIVOS, SMARTWATCHES E SINCRONIZAÇÃO
export type DevicePlatform =
  | "APPLE_WATCH_OS"
  | "WEAR_OS"
  | "ANDROID"
  | "IOS"
  | "WEB_PWA"
  | "DESKTOP";

export type DeviceType =
  | "SMARTWATCH"
  | "MOBILE_PHONE"
  | "TABLET"
  | "DESKTOP"
  | "PWA";

export interface RegisteredDevice {
  id: string;
  userId: string;
  deviceName: string;
  platform: DevicePlatform;
  deviceType: DeviceType;
  pushSubscription?: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  pushToken?: string;
  lastSyncAt: string;
  isPaired: boolean;
  appVersion?: string;
  createdAt: string;
}

export interface DeviceSyncRequest {
  deviceId: string;
  userId: string;
  platform: DevicePlatform;
  lastSyncTimestamp?: string;
  includeAgenda?: boolean;
  includeReminders?: boolean;
  includeTasks?: boolean;
  includeNotifications?: boolean;
}

export interface DeviceSyncResponse {
  success: boolean;
  serverTimestamp: string;
  agendaEvents: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime?: string;
    location?: string;
    type: string;
    priority: string;
  }>;
  medicationReminders: Array<{
    id: string;
    title: string;
    scheduledTime?: string;
    dosage?: string;
    category: string;
    isCompletedToday: boolean;
  }>;
  urgentTasks: Array<{
    id: string;
    title: string;
    projectName?: string;
    priority: string;
    status: string;
  }>;
  unreadNotificationsCount: number;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

export interface SmsDispatchPayload {
  recipientPhone: string;
  messageText: string;
  senderName?: string;
  referenceId?: string;
}

export interface SmsDispatchResult {
  success: boolean;
  messageId?: string;
  sentAt: string;
  status: "SENT" | "DELIVERED" | "FAILED" | "MOCK_DISPATCHED";
  errorMessage?: string;
}
