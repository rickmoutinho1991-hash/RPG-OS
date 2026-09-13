"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  taxNumber?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

interface Membership {
  id: string;
  organizationId: string;
  userId: string;
  roleKey: string;
  status: string;
}

interface OrganizationContextValue {
  organization: Organization | null;
  user: User | null;
  membership: Membership | null;
  permissions: string[];
  availableOrganizations: Array<{ id: string; name: string; slug: string; roleKey: string }>;
  isLoading: boolean;
  switchOrganization: (orgId: string) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

interface OrganizationProviderProps {
  children: ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [availableOrganizations, setAvailableOrganizations] = useState<
    Array<{ id: string; name: string; slug: string; roleKey: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const res = await fetch("/api/session-context");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setOrganization(data.organization);
            setUser(data.user);
            setMembership(data.membership);
            setPermissions(data.permissions || []);
            setAvailableOrganizations(data.availableOrganizations || []);
          }
        }
      } catch (err) {
        console.error("[OrganizationContext] Failed to load context:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadContext();
  }, []);

  const switchOrganization = async (orgId: string) => {
    const res = await fetch("/api/organizations/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    });
    if (res.ok) {
      window.location.reload();
    }
  };

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        user,
        membership,
        permissions,
        availableOrganizations,
        isLoading,
        switchOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizationContext(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganizationContext must be used within an OrganizationProvider");
  }
  return context;
}

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}