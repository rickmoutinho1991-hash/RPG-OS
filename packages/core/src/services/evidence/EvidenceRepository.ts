/**
 * RPG-OS — Evidence Repository Abstraction
 *
 * Minimal interface for evidence record persistence.
 * NOT a DB implementation — just the contract.
 * In production, maps to a Postgres evidence table.
 */

import type { Evidence, EvidenceSearchFilters, EvidenceSearchResult } from "../../types/evidence";

export interface EvidenceRepository {
  save(evidence: Evidence): Promise<void>;
  update(id: string, patch: Partial<Evidence>): Promise<Evidence>;
  getById(id: string): Promise<Evidence | null>;
  search(filters: EvidenceSearchFilters): Promise<EvidenceSearchResult>;
  delete(id: string): Promise<boolean>;
}

/**
 * In-memory repository for tests. NOT for production.
 */
export class InMemoryEvidenceRepository implements EvidenceRepository {
  private records = new Map<string, Evidence>();

  async save(evidence: Evidence): Promise<void> {
    this.records.set(evidence.id, { ...evidence });
  }

  async update(id: string, patch: Partial<Evidence>): Promise<Evidence> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Evidence ${id} not found`);
    const updated = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    return updated;
  }

  async getById(id: string): Promise<Evidence | null> {
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  async search(filters: EvidenceSearchFilters): Promise<EvidenceSearchResult> {
    let items = Array.from(this.records.values());

    if (filters.ownerId) items = items.filter((e) => e.ownerId === filters.ownerId);
    if (filters.type) items = items.filter((e) => e.type === filters.type);
    if (filters.category) items = items.filter((e) => e.category === filters.category);
    if (filters.status) items = items.filter((e) => e.status === filters.status);
    if (filters.visibility) items = items.filter((e) => e.visibility === filters.visibility);
    if (filters.tags && filters.tags.length > 0) {
      items = items.filter((e) => filters.tags!.some((t) => e.tags.includes(t)));
    }
    if (filters.relatedEntityType) {
      items = items.filter((e) =>
        e.relatedEntities.some((r) => r.entityType === filters.relatedEntityType),
      );
    }
    if (filters.relatedEntityId) {
      items = items.filter((e) =>
        e.relatedEntities.some((r) => r.entityId === filters.relatedEntityId),
      );
    }
    if (filters.legalHold !== undefined) {
      items = items.filter((e) => e.retention.legalHold === filters.legalHold);
    }

    const total = items.length;
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);

    return {
      items: paged,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      facets: {
        types: [],
        categories: [],
        statuses: [],
        tags: [],
      },
    };
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}
