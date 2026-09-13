/**
 * Platform Fee (modelo de sucesso/transação RPG-OS).
 *
 * Funções PURAS de decisão/cálculo — sem acesso a BD. O servidor persiste os
 * valores calculados aqui; o cliente nunca fornece taxa nem valores finais.
 *
 * Princípios:
 *  - Todo o dinheiro em CENTAVOS inteiros (bigint na BD) — zero floating point;
 *  - Taxa em basis points (1/100 de %): configurável, nunca hardcoded;
 *  - Idempotência garantida pela BD (unique(source_type, source_id));
 *  - Snapshots imutáveis: histórico não é reescrito por mudanças posteriores.
 */

export interface FeeConfigSnapshot {
  /** company_id NULL = configuração global (fallback). */
  companyId: string | null;
  /** 0..10000 */
  basisPoints: number;
  isActive: boolean;
}

/**
 * Converte um valor monetário (EUR, 2 casas decimais) em centavos inteiros,
 * tratando a parte decimal como STRING para evitar erros de floating point
 * (ex.: 820.65 * 100 = 82064.99999…). Devolve null para entradas inválidas.
 */
export function parseEuroToCents(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  let s = String(value).trim().replace(",", ".");
  if (!s || s === "-" || s === "+") return null;
  // Aceita apenas dígitos, sinal e um separador decimal.
  if (!/^[+-]?\d*(\.\d*)?$/.test(s)) return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const [intPartRaw = "", decPartRaw = ""] = s.split(".");
  if (decPartRaw.length > 2) return null; // mais precisão do que a moeda tem
  const intPart = intPartRaw.padStart(1, "0");
  const decPart = decPartRaw.padEnd(2, "0").slice(0, 2);
  if (!/^\d+$/.test(intPart) || !/^\d{2}$/.test(decPart)) return null;
  const cents = Number(intPart + decPart);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/**
 * Resolve a taxa aplicável: config ativa da empresa prevalece sobre a
 * global; sem nenhuma → 0 bps (fee desligada é o default seguro).
 */
export function resolveApplicableBasisPoints(
  configs: FeeConfigSnapshot[] | null | undefined,
  companyId: string | null | undefined,
): number {
  const rows = configs ?? [];
  if (companyId) {
    const companyScoped = rows.find(
      (c) => c.isActive && c.companyId !== null && c.companyId === companyId,
    );
    if (companyScoped) return companyScoped.basisPoints;
  }
  const global = rows.find((c) => c.isActive && c.companyId === null);
  return global ? global.basisPoints : 0;
}

export interface PlatformFeeComputation {
  grossCents: number;
  basisPoints: number;
  feeCents: number;
  netCents: number;
}

/**
 * Calcula fee/líquido em inteiros exatos.
 *  - feeCents = round-half-up(gross × bps / 10000) — estável e determinístico;
 *  - netCents = gross − fee (nunca negativo dado que fee ≤ gross);
 *  - lança erro para entradas fora do domínio (o servidor não deve silenciar).
 */
export function computePlatformFee(input: {
  grossCents: number;
  basisPoints: number;
}): PlatformFeeComputation {
  const { grossCents, basisPoints } = input;
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) {
    throw new Error("grossCents deve ser um inteiro não-negativo.");
  }
  if (
    !Number.isSafeInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10000
  ) {
    throw new Error("basisPoints deve estar entre 0 e 10000.");
  }
  const feeCents = Math.round((grossCents * basisPoints) / 10000);
  const netCents = grossCents - feeCents;
  return { grossCents, basisPoints, feeCents, netCents };
}

/* ─── Agregação do ledger para o painel "Ganhos via RPG-OS" ───────────── */

/**
 * Entrada mínima do ledger (a partir de platform_fees persistidas).
 * Usa APENAS os snapshots históricos — nunca recalcula com a config atual.
 */
export interface FeeLedgerEntry {
  grossCents: number;
  feeCents: number;
  netCents: number;
  /** Snapshot histórico da taxa (não o valor atual da configuração). */
  basisPoints: number;
  /** ISO timestamp do accrual (created_at). */
  createdAt: string;
}

export interface FeePeriodTotals {
  grossCents: number;
  feeCents: number;
  netCents: number;
  paymentsCount: number;
  /** Ticket médio = round(gross / count); 0 sem entradas. */
  avgTicketCents: number;
  /**
   * Taxa efetiva do período = round(fee × 10000 / gross); 0 sem volume.
   * Derivada dos snapshots reais, não da configuração vigente.
   */
  effectiveBasisPoints: number;
}

export interface FeeMonthlyPoint {
  /** Chave YYYY-MM (ordenada ascendentemente). */
  month: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  count: number;
}

function monthKey(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(String(isoDate));
  return match ? `${match[1]}-${match[2]}` : null;
}

/**
 * Agrega entradas do ledger em totais de período + série mensal.
 * Soma em inteiros exatos (sem floats). Valores negativos ou não-inteiros
 * são inválidos por definição do schema (CHECK >= 0) e lançam erro —
 * indicam corrupção que não deve ser silenciada num painel financeiro.
 */
export function aggregateFeeLedger(entries: FeeLedgerEntry[] | null | undefined): {
  totals: FeePeriodTotals;
  monthly: FeeMonthlyPoint[];
} {
  const rows = entries ?? [];
  let grossTotal = 0;
  let feeTotal = 0;
  let netTotal = 0;
  const byMonth = new Map<string, FeeMonthlyPoint>();

  for (const entry of rows) {
    const { grossCents, feeCents, netCents } = entry;
    for (const [name, value] of [
      ["gross", grossCents],
      ["fee", feeCents],
      ["net", netCents],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Valor ${name} inválido no ledger (${String(value)}).`);
      }
    }
    grossTotal += grossCents;
    feeTotal += feeCents;
    netTotal += netCents;

    const key = monthKey(entry.createdAt);
    if (key) {
      const point = byMonth.get(key) ?? {
        month: key,
        grossCents: 0,
        feeCents: 0,
        netCents: 0,
        count: 0,
      };
      point.grossCents += grossCents;
      point.feeCents += feeCents;
      point.netCents += netCents;
      point.count += 1;
      byMonth.set(key, point);
    }
  }

  return {
    totals: {
      grossCents: grossTotal,
      feeCents: feeTotal,
      netCents: netTotal,
      paymentsCount: rows.length,
      avgTicketCents:
        rows.length > 0 ? Math.round(grossTotal / rows.length) : 0,
      effectiveBasisPoints:
        grossTotal > 0 ? Math.round((feeTotal * 10000) / grossTotal) : 0,
    },
    monthly: [...byMonth.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
  };
}

/** Formata centavos inteiros como EUR (exibição; cálculo permanece em inteiros). */
export function formatEurosFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("Centavos inválidos.");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const intPart = String(Math.floor(abs / 100));
  const decPart = String(abs % 100).padStart(2, "0");
  return `${sign}${intPart},${decPart} €`;
}

/* ─── Configuração da taxa (platform_fee_config) ──────────────────────── */

export const FEE_CONFIG_BPS_MIN = 0;
export const FEE_CONFIG_BPS_MAX = 10000;

/**
 * Converte um valor percentual fornecido por um administrador (ex.: "2,75%",
 * "0.5" ou o número 3) para basis points inteiros. Devolve null quando não é
 * um número finito com no máximo duas casas decimais exatas ou fora do range 0-100%.
 */
export function parsePercentToBasisPoints(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const raw =
    typeof value === "number" ? String(value) : String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace("%", "").replace(",", ".").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 100) return null; // Range 0-100%
  // Multiplicação inteira evita floats: "2.75" -> 275 bps exatos.
  const [intPart, decPart = ""] = normalized.split(".");
  const centis =
    Number.parseInt(intPart, 10) * 100 +
    Number.parseInt((decPart + "00").slice(0, 2), 10);
  return centis;
}

/** Formata basis points como percentagem legível (250 -> "2,50%"). */
export function formatBasisPoints(bps: number): string {
  if (
    !Number.isSafeInteger(bps) ||
    bps < FEE_CONFIG_BPS_MIN ||
    bps > FEE_CONFIG_BPS_MAX
  ) {
    throw new Error("Basis points inválidos.");
  }
  return formatEurosFromCents(bps).replace(" €", "%");
}

export interface FeeConfigChangeValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Valida uma alteração da taxa ANTES de criar o pedido de aprovação.
 * Regras: novo valor inteiro dentro dos limites; diferente do atual
 * (evita pedidos sem efeito e audit logs sem conteúdo).
 */
export function validateFeeConfigChange(input: {
  currentBps: number | null | undefined;
  newBps: number | null | undefined;
}): FeeConfigChangeValidation {
  const errors: string[] = [];
  const { currentBps, newBps } = input;
  if (
    !Number.isSafeInteger(newBps) ||
    (newBps as number) < FEE_CONFIG_BPS_MIN ||
    (newBps as number) > FEE_CONFIG_BPS_MAX
  ) {
    errors.push(
      `A taxa deve estar entre ${formatBasisPoints(FEE_CONFIG_BPS_MIN)} e ${formatBasisPoints(FEE_CONFIG_BPS_MAX)}.`,
    );
  }
  if (
    Number.isSafeInteger(currentBps) &&
    newBps === currentBps &&
    !errors.length
  ) {
    errors.push("A nova taxa é igual à taxa atual.");
  }
  return { valid: errors.length === 0, errors };
}

/** Texto de impacto apresentado ao administrador antes da confirmação. */
export const FEE_CONFIG_CHANGE_IMPACT_NOTICE =
  "Aplica-se apenas a novos pagamentos. Fees já registadas não serão alteradas.";

/* ─── Proposta de alteração (validação pura usada server-side) ─────────── */

export type FeeConfigScope = "GLOBAL" | "COMPANY";

const FEE_CONFIG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FeeConfigProposalInput {
  scope: FeeConfigScope;
  companyId: string | null | undefined;
  newBps: number | null | undefined;
  currentBps: number | null | undefined;
  reason: string | null | undefined;
  /**
   * IDs das empresas que o ator pode gerir — resolvidos NA BASE DE DADOS
   * (company_employees), nunca aceites do cliente. Base do isolamento
   * multi-tenant: um administrador de empresa A não pode propor override
   * para a empresa B.
   */
  managedCompanyIds: readonly string[] | null | undefined;
}

/**
 * Validação completa de uma proposta de alteração da taxa ANTES de criar o
 * pedido de aprovação (usada na Server Action; testável sem BD). Regras:
 *  - novo valor inteiro 0..10000 (0% e 100% permitidos) e != atual;
 *  - motivo obrigatório em AMBOS os âmbitos;
 *  - âmbito COMPANY exige companyId UUID válido E dentro do âmbito do ator;
 *  - âmbito GLOBAL ignora companyId.
 */
export function validateFeeConfigProposal(
  input: FeeConfigProposalInput,
): FeeConfigChangeValidation {
  const errors: string[] = [];
  const { scope, companyId, newBps, currentBps, reason, managedCompanyIds } =
    input;

  if (scope !== "GLOBAL" && scope !== "COMPANY") {
    errors.push("Âmbito inválido.");
  }

  // Regras numéricas partilhadas com a validação de alteração simples.
  errors.push(...validateFeeConfigChange({ currentBps, newBps }).errors);

  if (scope === "COMPANY") {
    if (!companyId || !FEE_CONFIG_UUID_RE.test(companyId)) {
      errors.push("Empresa em falta ou identificador inválido.");
    } else if (
      !managedCompanyIds?.some(
        (id) =>
          typeof id === "string" &&
          id.toLowerCase() === companyId.toLowerCase(),
      )
    ) {
      // Cross-tenant: empresa fora do âmbito autorizado do ator.
      errors.push("Sem autorização para gerir a taxa desta empresa.");
    }
  }

  if (!reason || !reason.trim()) {
    errors.push("Motivo é obrigatório.");
  }

  return { valid: errors.length === 0, errors };
}