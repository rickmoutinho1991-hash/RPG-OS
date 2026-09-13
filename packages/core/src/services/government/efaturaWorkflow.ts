/**
 * RPG-OS e-Fatura Workflow Service (FASE 12)
 *
 * Complete local/fake/manual e-Fatura workflow implementation.
 * Reuses existing government abstractions and fiscal types.
 * Never claims official AT integration - clearly marked as FAKE/MANUAL/PREPARED.
 */

import {
  EFaturaDocument,
  EFaturaDocumentStatus,
  EFaturaFingerprint,
  EFaturaValidationResult,
  EFaturaImportResult,
  EFaturaBatchImportResult,
  EFaturaImportConfig,
  EFaturaSubmissionResult,
  EFaturaSyncResult,
  EFaturaWebhookEvent,
  EFaturaSyncConfig,
  EFaturaProviderStatus,
  EFaturaService,
  EFaturaTransition,
  validateEFaturaTransition,
  generateEFaturaFingerprint,
} from "./efaturaDomain";
import {
  GovernmentIntegrationProvider,
  GovernmentProviderId,
  GovernmentProviderType,
  GovernmentEnvironment,
  GovernmentConnectionConfig,
  GovernmentDocumentSubmission,
  GovernmentCapability,
  CapabilityCheckResult,
  GovernmentProviderHealth,
  governmentProviderRegistry,
} from "./governmentIntegration";
import { FiscalDocumentWorkflow, FiscalDocumentState, createFiscalDocumentWorkflow } from "./fiscalDocumentWorkflow";
import { FiscalInboxService, createFiscalInboxService, FiscalInboxItemType } from "./fiscalInbox";
import { governmentAuditService, GovernmentAuditAction, GovernmentAuditSource } from "./governmentAudit";
import { FakeATProvider } from "./atProvider";
import { FakePortugueseTaxAuthorityProvider } from "../revenue/taxAuthority";
import type { Invoice, InvoiceType } from "../../types/invoice";
import { isValidPortugueseNif, classifyPortugueseNif } from "../../validation/nif";

/** Configuração padrão de sincronização */
const DEFAULT_SYNC_CONFIG: EFaturaSyncConfig = {
  pollIntervalMs: 5 * 60 * 1000, // 5 min
  maxRetries: 3,
  retryDelayMs: 1000,
};

/** Armazenamento em memória para desenvolvimento (em produção usar banco) */
interface EFaturaStorage {
  documents: Map<string, EFaturaDocument>;
  idempotencyKeys: Map<string, string>; // idempotencyKey -> documentId
  webhookEvents: Map<string, EFaturaWebhookEvent>;
}

function createStorage(): EFaturaStorage {
  return {
    documents: new Map(),
    idempotencyKeys: new Map(),
    webhookEvents: new Map(),
  };
}

/**
 * e-Fatura Workflow Service
 * Implementa EFaturaService usando provedores Fake/Manual
 * NÃO conecta à AT real - apenas FAKE/MANUAL/PREPARED
 */
export class EFaturaWorkflowService implements EFaturaService {
  private storage: EFaturaStorage;
  private fakeATProvider: FakeATProvider;
  private fakeTaxAuthority: FakePortugueseTaxAuthorityProvider;
  private fiscalWorkflow: FiscalDocumentWorkflow;
  private fiscalInbox: FiscalInboxService;
  private syncConfig: EFaturaSyncConfig;

  constructor(syncConfig?: Partial<EFaturaSyncConfig>) {
    this.storage = createStorage();
    this.fakeATProvider = new FakeATProvider({ organizationNif: "501234560" });
    this.fakeTaxAuthority = new FakePortugueseTaxAuthorityProvider({ deterministic: true, organizationNif: "501234560" });
    this.fiscalWorkflow = createFiscalDocumentWorkflow();
    this.fiscalInbox = createFiscalInboxService();
    this.syncConfig = { ...DEFAULT_SYNC_CONFIG, ...syncConfig };

    // Registra provedores padrão se não existirem
    if (!governmentProviderRegistry.get("AT")) {
      governmentProviderRegistry.register(this.fakeATProvider);
    }
  }

  /**
   * Valida documento e-Fatura
   * Verifica: NIF, totais, VAT, séries, datas, fingerprint
   */
  async validate(doc: Partial<EFaturaDocument>): Promise<EFaturaValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Valida campos obrigatórios
    if (!doc.organizationId) errors.push("organizationId é obrigatório");
    if (!doc.invoiceType) errors.push("invoiceType é obrigatório");
    if (!doc.series) errors.push("series é obrigatório");
    if (!doc.documentNumber) errors.push("documentNumber é obrigatório");
    if (!doc.issueDate) errors.push("issueDate é obrigatório");
    if (!doc.customerNif) errors.push("customerNif é obrigatório");
    if (!doc.customerName) errors.push("customerName é obrigatório");
    if (!doc.totalCents || doc.totalCents <= 0) errors.push("totalCents deve ser > 0");

    // 2. Valida NIF do cliente
    if (doc.customerNif) {
      if (!isValidPortugueseNif(doc.customerNif)) {
        errors.push("NIF do cliente inválido: formato inválido");
      } else if (classifyPortugueseNif(doc.customerNif) === "INVALID") {
        errors.push("NIF do cliente tem formato inválido");
      }
    }

    // 3. Valida NIF do fornecedor (se presente)
    if (doc.supplierNif) {
      if (!isValidPortugueseNif(doc.supplierNif)) {
        warnings.push("NIF do fornecedor inválido: formato inválido");
      }
    }

    // 4. Valida totais (bruto = líquido + IVA)
    if (doc.netCents !== undefined && doc.vatCents !== undefined && doc.totalCents !== undefined) {
      const calculatedTotal = doc.netCents + doc.vatCents;
      if (doc.totalCents !== calculatedTotal) {
        errors.push(`Total inválido: ${doc.totalCents} != líquido (${doc.netCents}) + IVA (${doc.vatCents})`);
      }
    }

    // 5. Valida VAT breakdown
    if (doc.vatBreakdown && doc.vatBreakdown.length > 0) {
      const vatBreakdownTotal = doc.vatBreakdown.reduce((sum, v) => sum + v.amountCents, 0);
      if (doc.vatCents !== undefined && vatBreakdownTotal !== doc.vatCents) {
        errors.push(`VAT breakdown total (${vatBreakdownTotal}) != VAT total (${doc.vatCents})`);
      }
      for (const v of doc.vatBreakdown) {
        if (!["23", "13", "6", "0", "22"].includes(v.rate)) {
          warnings.push(`VAT rate não padrão: ${v.rate}`);
        }
      }
    }

    // 6. Valida formato de série (deve ser numérico ou ano)
    if (doc.series && !/^\d{4}$/.test(doc.series)) {
      warnings.push("Série deve ser ano de 4 dígitos (ex: 2025)");
    }

    // 6. Valida número do documento
    if (doc.documentNumber && !/^\d{1,8}$/.test(doc.documentNumber)) {
      warnings.push("Número do documento deve ser numérico");
    }

    // 7. Gera fingerprint se documento for válido
    let fingerprint: EFaturaFingerprint | undefined;
    if (errors.length === 0 && doc.organizationId && doc.invoiceType && doc.series && doc.documentNumber && doc.issueDate && doc.customerNif && doc.totalCents) {
      fingerprint = generateEFaturaFingerprint({
        organizationId: doc.organizationId,
        invoiceType: doc.invoiceType,
        series: doc.series,
        documentNumber: doc.documentNumber,
        issueDate: doc.issueDate,
        customerNif: doc.customerNif,
        totalCents: doc.totalCents,
        supplierNif: doc.supplierNif,
      });
    }

    return {
      valid: errors.length === 0,
      documentId: doc.id ?? `doc_${Date.now()}`,
      errors: errors.length > 0 ? errors : [],
      warnings: warnings.length > 0 ? warnings : [],
      fingerprint,
    };
  }

  /**
   * Importa documento manualmente (JSON)
   * Valida, gera fingerprint, verifica duplicatas
   */
  async import(doc: Partial<EFaturaDocument>, config?: EFaturaImportConfig): Promise<EFaturaImportResult> {
    const validation = await this.validate(doc);

    if (!validation.valid) {
      return {
        documentId: validation.documentId,
        status: "REJECTED",
        validation,
        error: validation.errors?.join("; "),
      };
    }

    // Gera ID se não existir
    const documentId = doc.id ?? `efat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Verifica duplicata por fingerprint
    if (validation.fingerprint) {
      const existing = await this.checkDuplicate(validation.fingerprint.hash);
      if (existing && !config?.allowOverwrite) {
        return {
          documentId: existing.id,
          status: "DUPLICATE",
          fingerprint: validation.fingerprint,
          error: `Duplicata detectada: documento ${existing.series}/${existing.documentNumber} já existe`,
        };
      }
    }

    const now = new Date().toISOString();

    // Cria documento completo
    const fullDoc: EFaturaDocument = {
      id: documentId,
      organizationId: doc.organizationId!,
      invoiceId: doc.invoiceId,
      status: "IMPORTED",
      invoiceType: doc.invoiceType!,
      series: doc.series!,
      documentNumber: doc.documentNumber!,
      issueDate: doc.issueDate!,
      customerNif: doc.customerNif!,
      customerName: doc.customerName!,
      supplierNif: doc.supplierNif,
      supplierName: doc.supplierName,
      totalCents: doc.totalCents!,
      netCents: doc.netCents ?? 0,
      vatCents: doc.vatCents ?? 0,
      vatBreakdown: doc.vatBreakdown ?? [],
      fingerprint: validation.fingerprint!,
      fingerprintHash: validation.fingerprint!.hash,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: doc.metadata,
    };

    // Persiste
    this.storage.documents.set(documentId, fullDoc);

    // Cria evento na fiscal inbox
    this.fiscalInbox.createRejectedSubmissionItem({
      organization_id: doc.organizationId!,
      document_id: documentId,
      document_type: doc.invoiceType!,
      series: doc.series!,
      document_number: doc.documentNumber!,
      provider: "AT",
      error: "Documento importado - aguardando validação",
      submission_id: `IMP-${Date.now()}`,
    });

    return {
      documentId,
      status: "IMPORTED",
      fingerprint: validation.fingerprint,
      validation,
    };
  }

  /**
   * Importa múltiplos documentos em lote
   */
  async importBatch(docs: Partial<EFaturaDocument>[], config?: EFaturaImportConfig): Promise<EFaturaBatchImportResult> {
    const results: EFaturaImportResult[] = [];
    let imported = 0, validated = 0, duplicates = 0, rejected = 0;

    for (const doc of docs) {
      const result = await this.import(doc, config);
      results.push(result);

      switch (result.status) {
        case "IMPORTED": imported++; break;
        case "VALIDATED": validated++; break;
        case "DUPLICATE": duplicates++; break;
        case "REJECTED": rejected++; break;
      }
    }

    return {
      total: docs.length,
      processed: results.length,
      imported,
      validated,
      duplicates,
      rejected,
      results,
    };
  }

  /**
   * Submete documento ao provedor (via GovernmentIntegrationProvider)
   * Usa idempotencyKey para evitar duplicatas
   */
  async submit(doc: EFaturaDocument, idempotencyKey: string): Promise<EFaturaSubmissionResult> {
    // Verifica idempotência
    const existingId = this.storage.idempotencyKeys.get(idempotencyKey);
    if (existingId) {
      const existing = this.storage.documents.get(existingId);
      if (existing) {
        return {
          documentId: existing.id,
          submissionId: existing.submissionId ?? `SUB-${Date.now()}`,
          status: existing.status as "SUBMITTED" | "PENDING" | "ACCEPTED" | "REJECTED" | "ERROR",
          externalReference: existing.externalReference,
          atcud: existing.atcud,
        };
      }
    }

    // Verifica capacidade do provedor
    const provider = governmentProviderRegistry.get("AT");
    if (!provider) {
      return {
        documentId: doc.id,
        submissionId: `SUB-${Date.now()}`,
        status: "ERROR",
        error: "Provedor AT não configurado",
        errorCode: "PROVIDER_UNAVAILABLE",
      };
    }

    const capability = provider.supports("SUBMIT_INVOICE");
    if (!capability.supported) {
      return {
        documentId: doc.id,
        submissionId: `SUB-${Date.now()}`,
        status: "ERROR",
        error: "Provedor não suporta SUBMIT_INVOICE",
        errorCode: "CAPABILITY_UNSUPPORTED",
      };
    }

    // Verifica conexão
    if (!doc.connectionId) {
      return {
        documentId: doc.id,
        submissionId: `SUB-${Date.now()}`,
        status: "ERROR",
        error: "Conexão não configurada",
        errorCode: "CONNECTION_MISSING",
      };
    }

    // Converte para Invoice para submissão
    const invoice: Invoice = {
      invoiceId: doc.invoiceId ?? doc.id,
      organizationId: doc.organizationId,
      invoiceType: doc.invoiceType,
      series: doc.series,
      documentNumber: doc.documentNumber,
      customer: {
        id: `cust_${doc.customerNif}`,
        name: doc.customerName,
        taxNumber: doc.customerNif,
        nifType: "INDIVIDUAL", // Simplificado
        address: "",
        postalCode: "",
        city: "",
        country: "PT",
      },
      subtotalCents: doc.netCents,
      discountCents: 0,
      feeCents: 0,
      taxCents: doc.vatCents,
      totalCents: doc.totalCents,
      paidCents: 0,
      amountDueCents: doc.totalCents,
      status: "open",
      createdAt: doc.createdAt,
      updatedAt: new Date().toISOString(),
      vatBreakdown: doc.vatBreakdown.map(v => ({
        rate: v.rate as any,
        ratePercent: v.ratePercent,
        amountCents: v.amountCents,
        baseCents: v.baseCents,
      })),
      issueDate: doc.issueDate,
      dueDate: doc.dueDate ?? doc.issueDate,
      billingPeriodStart: doc.issueDate,
      billingPeriodEnd: doc.issueDate,
      currency: "EUR",
    };

    // Submete via provedor
    const submission = await provider.submitDocument(doc.connectionId, invoice, idempotencyKey);

    // Registra idempotency key
    this.storage.idempotencyKeys.set(idempotencyKey, doc.id);

    // Atualiza documento
    const updatedDoc: EFaturaDocument = {
      ...doc,
      status: "SUBMITTED",
      submissionId: submission.submissionId,
      externalReference: submission.externalReference,
      atcud: submission.atcud,
      idempotencyKey,
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.storage.documents.set(doc.id, updatedDoc);

    // Cria item na fiscal inbox
    this.fiscalInbox.createPendingSubmissionItem({
      organization_id: doc.organizationId,
      document_id: doc.id,
      document_type: doc.invoiceType,
      series: doc.series,
      document_number: doc.documentNumber,
      provider: "AT",
      submitted_at: new Date().toISOString(),
    });

    return {
      documentId: doc.id,
      submissionId: submission.submissionId,
      status: submission.status,
      externalReference: submission.externalReference,
      atcud: submission.atcud,
      error: submission.error,
    };
  }

  /**
   * Submete múltiplos documentos em lote
   */
  async submitBatch(docs: EFaturaDocument[], idempotencyKeys: string[]): Promise<EFaturaSubmissionResult[]> {
    if (docs.length !== idempotencyKeys.length) {
      throw new Error("Número de documentos deve igualar número de chaves de idempotência");
    }

    const results: EFaturaSubmissionResult[] = [];
    for (let i = 0; i < docs.length; i++) {
      const result = await this.submit(docs[i], idempotencyKeys[i]);
      results.push(result);
    }
    return results;
  }

  /**
   * Sincroniza status com provedor
   */
  async sync(doc: EFaturaDocument): Promise<EFaturaSyncResult> {
    const provider = governmentProviderRegistry.get("AT");
    if (!provider || !doc.connectionId || !doc.submissionId) {
      return {
        documentId: doc.id,
        previousStatus: doc.status,
        newStatus: doc.status,
        error: "Provedor ou conexão não configurados",
        syncedAt: new Date().toISOString(),
      };
    }

    try {
      // Usa o fake provider para consultar status
      const statusQuery = await provider.getDocumentStatus(doc.connectionId, doc.submissionId);

      const previousStatus = doc.status;
      let newStatus = doc.status;

      if (statusQuery.result?.status) {
        const atStatus = statusQuery.result.status;

        // Mapeia status AT para status e-Fatura
        if (atStatus === "ACCEPTED") newStatus = "ACCEPTED";
        else if (atStatus === "REJECTED") newStatus = "REJECTED";
        else if (atStatus === "PENDING") newStatus = "PENDING";
        else if (atStatus === "ERROR") newStatus = "REJECTED";
      }

      const result: EFaturaSyncResult = {
        documentId: doc.id,
        previousStatus,
        newStatus,
        externalReference: doc.externalReference,
        atcud: doc.atcud,
        syncedAt: new Date().toISOString(),
      };

      // Atualiza documento se status mudou
      if (newStatus !== previousStatus) {
        const updatedDoc = {
          ...doc,
          status: newStatus,
          updatedAt: new Date().toISOString(),
          lastSyncAt: result.syncedAt,
        };
        this.storage.documents.set(doc.id, updatedDoc);

        // Cria evento na fiscal inbox
        if (newStatus === "ACCEPTED") {
          this.fiscalInbox.createRejectedSubmissionItem({
            organization_id: doc.organizationId,
            document_id: doc.id,
            document_type: doc.invoiceType,
            series: doc.series,
            document_number: doc.documentNumber,
            provider: "AT",
            error: "Documento aceite pela AT/e-Fatura",
            submission_id: doc.submissionId!,
          });
        } else if (newStatus === "REJECTED") {
          this.fiscalInbox.createRejectedSubmissionItem({
            organization_id: doc.organizationId,
            document_id: doc.id,
            document_type: doc.invoiceType,
            series: doc.series,
            document_number: doc.documentNumber,
            provider: "AT",
            error: "Documento rejeitado pela AT/e-Fatura",
            submission_id: doc.submissionId!,
          });
        }
      }

      return result;
    } catch (err) {
      return {
        documentId: doc.id,
        previousStatus: doc.status,
        newStatus: doc.status,
        error: err instanceof Error ? err.message : "Erro de sincronização",
        syncedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Sincroniza múltiplos documentos em lote
   */
  async syncBatch(docs: EFaturaDocument[]): Promise<EFaturaSyncResult[]> {
    const results: EFaturaSyncResult[] = [];
    for (const doc of docs) {
      const result = await this.sync(doc);
      results.push(result);
    }
    return results;
  }

  /**
   * Processa webhook do provedor
   */
  async processWebhook(event: EFaturaWebhookEvent): Promise<{ success: boolean; error?: string }> {
    // Verifica idempotência do webhook
    if (this.storage.webhookEvents.has(event.eventId)) {
      return { success: true }; // Já processado
    }

    // Encontra documento por externalReference
    let doc: EFaturaDocument | undefined;
    for (const d of this.storage.documents.values()) {
      if (d.externalReference === event.externalReference || d.submissionId === event.externalReference) {
        doc = d;
        break;
      }
    }

    if (!doc) {
      return { success: false, error: `Documento não encontrado para externalReference: ${event.externalReference}` };
    }

    // Atualiza status baseado no evento
    let newStatus = doc.status;
    switch (event.eventType) {
      case "DOCUMENT_ACCEPTED":
        newStatus = "ACCEPTED";
        break;
      case "DOCUMENT_REJECTED":
        newStatus = "REJECTED";
        break;
      case "DOCUMENT_CANCELLED":
        newStatus = "CANCELLED";
        break;
      case "STATUS_CHANGED":
        newStatus = event.status;
        break;
    }

    if (newStatus !== doc.status) {
      const updatedDoc = {
        ...doc,
        status: newStatus,
        atcud: event.atcud ?? doc.atcud,
        error: event.error,
        updatedAt: new Date().toISOString(),
        lastSyncAt: event.receivedAt,
      };
      this.storage.documents.set(doc.id, updatedDoc);

      // Fiscal inbox
      if (newStatus === "ACCEPTED") {
        this.fiscalInbox.createRejectedSubmissionItem({
          organization_id: doc.organizationId,
          document_id: doc.id,
          document_type: doc.invoiceType,
          series: doc.series,
          document_number: doc.documentNumber,
          provider: event.providerId,
          error: "Documento aceite via webhook",
          submission_id: doc.submissionId!,
        });
      } else if (newStatus === "REJECTED") {
        this.fiscalInbox.createRejectedSubmissionItem({
          organization_id: doc.organizationId,
          document_id: doc.id,
          document_type: doc.invoiceType,
          series: doc.series,
          document_number: doc.documentNumber,
          provider: event.providerId,
          error: event.error ?? "Rejeitado via webhook",
          submission_id: doc.submissionId!,
        });
      }
    }

    // Registra webhook como processado
    this.storage.webhookEvents.set(event.eventId, event);

    return { success: true };
  }

  /**
   * Reconcilia documento aceito
   */
  async reconcile(docId: string): Promise<{ success: boolean; error?: string }> {
    const doc = this.storage.documents.get(docId);
    if (!doc) return { success: false, error: "Documento não encontrado" };

    if (doc.status !== "ACCEPTED") {
      return { success: false, error: `Documento deve estar em ACCEPTED para reconciliação, está em ${doc.status}` };
    }

    // Atualiza para RECONCILED
    const updatedDoc: EFaturaDocument = {
      ...doc,
      status: "RECONCILED" as EFaturaDocumentStatus,
      reconciledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.storage.documents.set(docId, updatedDoc);

    // Fiscal inbox
    this.fiscalInbox.createReconciliationIssueItem({
      organization_id: doc.organizationId,
      document_id: docId,
      document_type: doc.invoiceType,
      series: doc.series,
      document_number: doc.documentNumber,
      differences: [],
      provider: "AT",
    });

    // Auditoria
    await governmentAuditService.log({
      source: "AUTOMATION",
      action: "GOV_RECONCILIATION_RESOLVED",
      organizationId: doc.organizationId,
      metadata: {
        organizationId: doc.organizationId,
        providerId: "AT",
        providerType: "FAKE" as any,
        providerEnvironment: "development" as any,
        documentId: docId,
        documentType: doc.invoiceType,
        documentSeries: doc.series,
        documentNumber: doc.documentNumber,
      },
    });

    return { success: true };
  }

  /**
   * Obtém status do provedor
   */
  async getProviderStatus(): Promise<EFaturaProviderStatus> {
    const provider = governmentProviderRegistry.get("AT");
    if (!provider) {
      return {
        providerId: "AT",
        connected: false,
        capabilities: [],
        lastError: "Provedor não configurado",
      };
    }

    const health = await provider.getHealth();
    return {
      providerId: "AT",
      connected: health.healthy,
      capabilities: AT_CAPABILITIES,
      lastSyncAt: new Date().toISOString(),
      lastError: health.healthy ? undefined : health.message,
    };
  }

  /**
   * Gera fingerprint canônico
   */
  generateFingerprint(doc: EFaturaDocument): EFaturaFingerprint {
    return generateEFaturaFingerprint({
      organizationId: doc.organizationId,
      invoiceType: doc.invoiceType,
      series: doc.series,
      documentNumber: doc.documentNumber,
      issueDate: doc.issueDate,
      customerNif: doc.customerNif,
      totalCents: doc.totalCents,
      supplierNif: doc.supplierNif,
    });
  }

  /**
   * Verifica duplicata por fingerprint
   */
  async checkDuplicate(fingerprintHash: string): Promise<EFaturaDocument | null> {
    for (const doc of this.storage.documents.values()) {
      if (doc.fingerprintHash === fingerprintHash) {
        return doc;
      }
    }
    return null;
  }

  /** Obtém documento por ID */
  getDocument(id: string): EFaturaDocument | undefined {
    return this.storage.documents.get(id);
  }

  /** Lista documentos por organização */
  listDocuments(organizationId: string, status?: EFaturaDocumentStatus): EFaturaDocument[] {
    const docs: EFaturaDocument[] = [];
    for (const doc of this.storage.documents.values()) {
      if (doc.organizationId === organizationId && (!status || doc.status === status)) {
        docs.push(doc);
      }
    }
    return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /** Limpa armazenamento (apenas para testes) */
  clearStorage(): void {
    this.storage.documents.clear();
    this.storage.idempotencyKeys.clear();
    this.storage.webhookEvents.clear();
  }
}

// Exporta capacidades AT para uso no service
const AT_CAPABILITIES: string[] = [
  "SUBMIT_INVOICE",
  "QUERY_INVOICE",
  "CANCEL_INVOICE",
  "VALIDATE_INVOICE",
  "SAFT_EXPORT",
  "REAL_TIME_STATUS",
  "WEBHOOK_NOTIFICATIONS",
];

/** Factory para criar instância do serviço e-Fatura */
export function createEFaturaWorkflowService(syncConfig?: Partial<EFaturaSyncConfig>): EFaturaWorkflowService {
  return new EFaturaWorkflowService(syncConfig);
}

/** Instância global para desenvolvimento */
export const efaturaWorkflowService = new EFaturaWorkflowService();