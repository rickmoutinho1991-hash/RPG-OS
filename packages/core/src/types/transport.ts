export type TransportDocType =
  | "GT" // Guia de Transporte
  | "GR" // Guia de Remessa
  | "GD" // Guia de Devolução
  | "GA"; // Guia de Movimentação de Ativos Próprios

export type TransportDocStatus =
  | "DRAFT"
  | "COMMUNICATED" // Comunicada à AT com código gerado
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED";

export interface TransportItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
}

export interface TransportDocument {
  id: string;
  documentNumber: string; // ex: GT 2025/001
  documentType: TransportDocType;
  status: TransportDocStatus;
  companyId?: string;
  clientId?: string;
  clientName: string;
  clientTaxNumber: string;
  vehicleRegistrationPlate: string; // Matrícula da viatura PT (ex: 00-AA-00 ou AA-00-AA)
  loadAddress: string;
  loadPostalCode: string;
  loadCity: string;
  loadDateTime: string; // Data e hora de início do transporte
  unloadAddress: string;
  unloadPostalCode: string;
  unloadCity: string;
  unloadDateTime?: string; // Data e hora prevista de descarga
  atDocCode?: string; // Código de comunicação fornecido pela Autoridade Tributária
  atcud?: string;
  hash?: string;
  items: TransportItem[];
  notes?: string;
  createdAt: string;
}
