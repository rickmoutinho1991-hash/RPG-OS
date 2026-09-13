export type ProjectStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ProjectRole =
  | "MANAGER"
  | "ENGINEER"
  | "FOREMAN"
  | "WORKER"
  | "SUBCONTRACTOR";

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: ProjectRole;
  joinedAt: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeUserId?: string;
  assigneeName?: string;
  dueDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMaterial {
  id: string;
  projectId: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  supplier?: string;
  status: "REQUESTED" | "ORDERED" | "DELIVERED" | "USED";
  createdAt: string;
}

export interface ProjectPhoto {
  id: string;
  projectId: string;
  caption?: string;
  fileUrl: string;
  uploadedBy?: string;
  stage: "BEFORE" | "DURING" | "AFTER";
  createdAt: string;
}

export interface Project {
  id: string;
  code: string; // e.g. OBR-2025-001
  title: string;
  description?: string;
  clientId: string;
  clientName?: string;
  companyId?: string;
  addressId?: string;
  location?: string;
  status: ProjectStatus;
  startDate?: string;
  expectedEndDate?: string;
  actualEndDate?: string;
  budgetEstimated: number;
  budgetActual: number;
  progressPercentage: number;
  tasksCount?: number;
  completedTasksCount?: number;
  membersCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFilters {
  search?: string;
  clientId?: string;
  status?: ProjectStatus;
  page?: number;
  limit?: number;
}
