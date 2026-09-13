export interface AiQuoteSuggestionPrompt {
  projectTitle: string;
  projectDescription: string;
  areaSquareMeters?: number;
  location?: string;
  category?:
    | "CONSTRUCTION"
    | "RENOVATION"
    | "PAINTING"
    | "PLUMBING"
    | "ELECTRICAL"
    | "CARPENTRY"
    | "GENERAL";
}

export interface AiSuggestedQuoteItem {
  description: string;
  itemType: "LABOR" | "MATERIAL" | "EQUIPMENT" | "SERVICE";
  unit: string;
  suggestedQuantity: number;
  estimatedUnitPrice: number;
  vatRate: number;
  notes?: string;
}

export interface AiDocumentAnalysisResult {
  documentTypeDetected: string;
  extractedNif?: string;
  extractedName?: string;
  extractedDate?: string;
  confidenceScore: number;
  detectedFields: Record<string, string>;
  warnings: string[];
}

export interface AiBusinessInsight {
  id: string;
  category: "FINANCIAL" | "PROJECTS" | "CLIENTS" | "COMPLIANCE";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  suggestedAction?: string;
  createdAt: string;
}
