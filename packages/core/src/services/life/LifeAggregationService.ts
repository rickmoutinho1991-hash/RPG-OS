/**
 * RPG-OS — Life Aggregation Service (A Minha Vida)
 *
 * Agrega LifeItem[] + LifeEvent[] a partir de collectors por domínio.
 * - Collectors independentes correm em paralelo (Promise.allSettled).
 * - Falha parcial nunca derruba a agregação (error isolation).
 * - Sem event bus, sem Kafka/Redis: implementação síncrona.
 * - Sem dados fake: collectors devolvem [] ou UNAVAILABLE quando não há dados reais.
 */
import type {
  LifeDomain,
  LifeEvent,
  LifeItem,
  LifeItemStatus,
} from "../../types/vida";
import { sortLifeItems } from "./LifePriority";

export type LifeDomainState = LifeItemStatus | "ERROR";

export interface LifeDomainStatusEntry {
  domain: LifeDomain;
  /** Estado honesto derivado da capacidade real. */
  state: LifeDomainState;
  /** Texto curto compreensível (ex.: "Dados disponíveis", "Preparado para ligação"). */
  label: string;
  detail?: string;
}

export interface LifeCollectorError {
  domain: LifeDomain;
  message: string;
}

export interface LifeAggregationResult {
  items: LifeItem[];
  events: LifeEvent[];
  domainStatuses: LifeDomainStatusEntry[];
  errors: LifeCollectorError[];
  generatedAt: string;
}

export interface LifeCollectorContext {
  today: string;
  nowIso: string;
}

export interface LifeCollector {
  readonly domain: LifeDomain;
  collectItems(ctx: LifeCollectorContext): Promise<LifeItem[]> | LifeItem[];
  collectEvents(ctx: LifeCollectorContext): Promise<LifeEvent[]> | LifeEvent[];
  /** Estado honesto do domínio (derivado da capacidade real). */
  status(): Promise<LifeDomainStatusEntry> | LifeDomainStatusEntry;
}

function sanitizedErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 180);
  return "Falha temporária do serviço.";
}

function errorStatus(domain: LifeDomain, err: unknown): LifeDomainStatusEntry {
  void err;
  return {
    domain,
    state: "ERROR",
    label: "Temporariamente indisponível",
    detail: "Este serviço falhou nesta consulta. Os restantes continuam disponíveis.",
  };
}

/**
 * Agrega collectors com isolamento de falhas.
 * Nunca lança por falha de um domínio individual.
 */
export async function aggregateLife(
  collectors: LifeCollector[],
  ctx?: Partial<LifeCollectorContext>,
): Promise<LifeAggregationResult> {
  const now = new Date();
  const full: LifeCollectorContext = {
    today: ctx?.today ?? now.toISOString().slice(0, 10),
    nowIso: ctx?.nowIso ?? now.toISOString(),
  };

  const settled = await Promise.allSettled(
    collectors.map(async (c) => {
      const [items, events, status] = await Promise.all([
        c.collectItems(full),
        c.collectEvents(full),
        c.status(),
      ]);
      return { domain: c.domain, items, events, status };
    }),
  );

  const items: LifeItem[] = [];
  const events: LifeEvent[] = [];
  const domainStatuses: LifeDomainStatusEntry[] = [];
  const errors: LifeCollectorError[] = [];

  settled.forEach((r, i) => {
    const domain = collectors[i].domain;
    if (r.status === "fulfilled") {
      items.push(...r.value.items);
      events.push(...r.value.events);
      domainStatuses.push(r.value.status);
    } else {
      domainStatuses.push(errorStatus(domain, r.reason));
      errors.push({ domain, message: sanitizedErrorMessage(r.reason) });
    }
  });

  const sortedItems = sortLifeItems(items, { today: full.today });
  const sortedEvents = [...events].sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
  );

  return {
    items: sortedItems,
    events: sortedEvents,
    domainStatuses,
    errors,
    generatedAt: full.nowIso,
  };
}
