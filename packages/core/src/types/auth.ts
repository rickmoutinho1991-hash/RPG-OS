import { SystemRole } from "../constants/roles";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  permissions: string[];
  companyId?: string;
  companyName?: string;
  avatarUrl?: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  taxNumber?: string;
  addressId?: string;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
