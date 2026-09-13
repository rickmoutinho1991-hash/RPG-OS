/**
 * RPG-OS Billing Customer
 * 
 * Abstraction representing a billing customer associated with an organization.
 * Used for invoicing, payment method management, and tenant isolation.
 * 
 * All customer data is tenant-scoped - each organization has its own customers.
 */
export interface BillingCustomer {
  /** Unique identifier for the customer */
  customerId: string;
  /** Organization identifier */
  organizationId: string;
  /** Customer email address */
  email: string;
  /** Customer name */
  name: string;
  /** Tax identification number (if supported by architecture) */
  taxId?: string;
  /** Billing address */
  billingAddress?: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  /** Currency for billing (default: EUR) */
  currency: string;
  /** Provider-neutral metadata */
  metadata?: Record<string, unknown>;
  /** Created at (ISO string) */
  createdAt: string;
  /** Last updated at (ISO string) */
  updatedAt: string;
}

/** Default currency for billing */
export const DEFAULT_BILLING_CURRENCY = 'EUR';

/** Creates a new BillingCustomer with validated data */
export function createBillingCustomer(
  organizationId: string,
  email: string,
  name: string,
  options: {
    customerId?: string;
    taxId?: string;
    billingAddress?: {
      street: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
    currency?: string;
    metadata?: Record<string, unknown>;
  } = {}
): BillingCustomer {
  const customerId = options.customerId || `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    customerId,
    organizationId,
    email,
    name,
    taxId: options.taxId,
    billingAddress: options.billingAddress,
    currency: options.currency || DEFAULT_BILLING_CURRENCY,
    metadata: options.metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Validates a BillingCustomer's data */
export function isValidBillingCustomer(customer: BillingCustomer): boolean {
  return Boolean(
    customer.customerId &&
    customer.organizationId &&
    customer.email &&
    customer.name &&
    customer.createdAt &&
    customer.updatedAt
  );
}

/**
 * Ensures tenant isolation - verifies that the customer belongs to the specified organization
 * 
 * @param customer - The billing customer to validate
 * @param organizationId - The organization ID to check against
 * @returns True if the customer belongs to the organization
 */
export function verifyTenantIsolation(
  customer: BillingCustomer,
  organizationId: string
): boolean {
  return customer.organizationId === organizationId;
}

export default {
  createBillingCustomer,
  isValidBillingCustomer,
  verifyTenantIsolation,
};