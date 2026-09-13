"use client";

import { OrganizationProvider } from "@/lib/organization-context";

interface OrganizationProviderWrapperProps {
  children: React.ReactNode;
}

export function OrganizationProviderWrapper({ children }: { children: React.ReactNode }) {
  return <OrganizationProvider>{children}</OrganizationProvider>;
}