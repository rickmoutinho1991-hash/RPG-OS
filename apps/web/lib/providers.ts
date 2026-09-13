export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
export interface EmailProvider {
  send(
    message: EmailMessage,
  ): Promise<{
    accepted: boolean;
    providerMessageId?: string;
    reason?: string;
  }>;
}
export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  link?: string;
}
export interface PushProvider {
  send(message: PushMessage): Promise<{ accepted: boolean; reason?: string }>;
}
export interface AIContext {
  userId: string;
  organizationId?: string;
  permissions: string[];
}
export interface AIProvider {
  complete(prompt: string, context: AIContext): Promise<string>;
}

export class UnconfiguredEmailProvider implements EmailProvider {
  async send(): Promise<{ accepted: false; reason: string }> {
    return { accepted: false, reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }
}
export class UnconfiguredPushProvider implements PushProvider {
  async send(): Promise<{ accepted: false; reason: string }> {
    return { accepted: false, reason: "PUSH_PROVIDER_NOT_CONFIGURED" };
  }
}
export class UnconfiguredAIProvider implements AIProvider {
  async complete(): Promise<string> {
    throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  }
}
export function getEmailProvider(): EmailProvider {
  return new UnconfiguredEmailProvider();
}
export function getPushProvider(): PushProvider {
  return new UnconfiguredPushProvider();
}
export function getAIProvider(): AIProvider {
  return new UnconfiguredAIProvider();
}
