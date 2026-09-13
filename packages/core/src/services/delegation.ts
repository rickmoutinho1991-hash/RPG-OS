import { hasPermission } from "../constants/permissions";
export interface Delegation { delegateUserId: string; permissions: string[]; startsAt: string; endsAt: string; revokedAt?: string | null; }
export function activeDelegation(delegation: Delegation, now = new Date()): boolean { const time = now.getTime(); return delegation.delegateUserId.length > 0 && !delegation.revokedAt && time >= new Date(delegation.startsAt).getTime() && time <= new Date(delegation.endsAt).getTime(); }
export function hasDelegatedPermission(delegations: Delegation[], userId: string, permission: string, now = new Date()): boolean { return delegations.some((delegation) => delegation.delegateUserId === userId && activeDelegation(delegation, now) && hasPermission(delegation.permissions, permission)); }
