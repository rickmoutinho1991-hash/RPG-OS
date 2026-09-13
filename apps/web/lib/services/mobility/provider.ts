/**
 * RPG-OS Mobility Provider - Web Service Layer
 * 
 * Service abstraction for Portuguese mobility providers (Via Verde, CTT/Portagens).
 * Follows the Health module pattern.
 * 
 * All integrations classified as PREPARED_ONLY - official onboarding required for LIVE access.
 */

import {
  MobilityIntegrationProvider,
  MobilityProviderMetadata,
  MobilityCapability,
  MobilityProviderType,
  MobilityEnvironment,
  MobilityConnectionConfig,
  MobilityConnectionStatus,
  MobilityVehicle,
  MobilityTollTransaction,
  MobilityTollDebt,
  MobilityPayment,
  Invoice,
  MobilityDocument,
  MobilityNotification,
  MobilityResult,
  MobilityErrorCode,
  MobilityProviderId
} from "@rpg/core";

/** Mobility provider interface extending core interface */
export interface MobilityProvider extends MobilityIntegrationProvider {
  readonly metadata: MobilityProviderMetadata;
}

/** Mobility provider registry implementation */
export class MobilityProviderRegistryImpl {
  private providers = new Map<MobilityProviderId, MobilityIntegrationProvider>();

  register(provider: MobilityIntegrationProvider): void {
    this.providers.set(provider.metadata.providerId, provider);
  }

  unregister(providerId: MobilityProviderId): void {
    this.providers.delete(providerId);
  }

  get(providerId: MobilityProviderId): MobilityIntegrationProvider | undefined {
    return this.providers.get(providerId);
  }

  getAll(): MobilityIntegrationProvider[] {
    return Array.from(this.providers.values());
  }

  getByCapability(capability: string): any[] {
    return this.getAll().filter(p => p.supports(capability as any).supported);
  }

  getByType(type: string): any[] {
    return this.getAll().filter(p => p.metadata.providerType === type);
  }

  clear(): void {
    this.providers.clear();
  }
}

/** SNS24-like factory for mobility providers */
export class MobilityProviderFactory {
  create(providerId: string, type: string, config?: Record<string, unknown>): any {
    throw new Error("MobilityProviderFactory not implemented - use specific provider factories");
  }
}

/** Export singleton registry */
export const mobilityProviderRegistry = new MobilityProviderRegistryImpl();

/** Register default mobility providers */
export function registerDefaultMobilityProviders(): void {
  if (process.env.NODE_ENV === 'production') {
    // In production, NO fake providers are registered automatically
    // Real providers must be explicitly configured and registered
    return;
  }

  // Development/test: register fake providers
  // This is handled by the fake provider factories
  // import { registerFakeViaVerdeProvider, registerFakeCTTPortagensProvider } from "@rpg/core/services/mobility";
  // registerFakeViaVerdeProvider(mobilityProviderRegistry);
  // registerFakeCTTPortagensProvider(mobilityProviderRegistry);
}