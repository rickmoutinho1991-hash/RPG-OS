/**
 * RPG-OS — Tipos transversais: tarefas universais, notificações,
 * comunicação (Comms), knowledge hub, pesquisa e alertas.
 */

// ─── Tarefas Universais ────────────────────────────────────────────────
export type PlatformTaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "CANCELLED";
export type PlatformTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface UniversalTask {
  id: string;
  title: string;
  description?: string;
  status: PlatformTaskStatus;
  priority: PlatformTaskPriority;
  dueDate?: string;
  assigneeId?: string;
  createdById: string;
  organizationId?: string;
  departmentId?: string;
  teamId?: string;
  clientId?: string;
  projectId?: string;
  parentTaskId?: string;
  recurrenceRule?: string; // RRULE RFC 5545
  completedAt?: string;
  createdAt: string;
}

// ─── Notificações ──────────────────────────────────────────────────────
export type NotificationCategory =
  | "INFO" | "SUCCESS" | "WARNING" | "URGENT" | "SYSTEM"
  | "TASK" | "APPROVAL" | "MESSAGE" | "SECURITY";

export interface AppNotification {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  link?: string;
  readAt?: string;
  createdAt: string;
}

// ─── Comunicação (RPG-OS Comms) ────────────────────────────────────────
export type ChannelType = "DIRECT" | "TEAM" | "DEPARTMENT" | "PROJECT" | "ANNOUNCEMENTS";
export type MessageKind = "MESSAGE" | "ANNOUNCEMENT" | "URGENT";

export interface CommsChannel {
  id: string;
  organizationId?: string;
  name: string;
  slug: string;
  type: ChannelType;
  description?: string;
  isPrivate: boolean;
  createdById: string;
}

export interface CommsMessage {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  kind: MessageKind;
  threadRootId?: string;
  mentionsUserIds?: string[];
  attachments?: Array<{ name: string; url: string }>;
  requiresReadConfirmation?: boolean;
  scheduledFor?: string;
  pinnedAt?: string;
  createdAt: string;
}

// ─── Knowledge Hub ─────────────────────────────────────────────────────
export type KnowledgeStatus = "DRAFT" | "PUBLISHED" | "UNDER_REVIEW" | "ARCHIVED";

export interface KnowledgeArticle {
  id: string;
  organizationId?: string;
  title: string;
  slug: string;
  category: string; // manual | procedimento | politica | faq | sop | formacao | wiki | legislacao
  content: string;
  status: KnowledgeStatus;
  ownerId: string;
  departmentId?: string;
  version: number;
  tags?: string[];
  verifiedAt?: string;
  reviewDueAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Pesquisa Universal ────────────────────────────────────────────────
export type SearchResultType =
  | "person" | "client" | "company" | "document" | "message"
  | "invoice" | "quote" | "project" | "task" | "knowledge" | "page"
  | "workflow" | "event" | "bill" | "document";

export interface SearchResultItem {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}
