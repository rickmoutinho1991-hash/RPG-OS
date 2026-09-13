export type PortugalVatRegion = "CONTINENT" | "AZORES" | "MADEIRA";

export interface VatRateOption {
  code: string;
  name: string;
  percentage: number;
  region: PortugalVatRegion;
  description: string;
}

export const PORTUGAL_VAT_RATES: Record<PortugalVatRegion, VatRateOption[]> = {
  CONTINENT: [
    {
      code: "NOR",
      name: "Normal (23%)",
      percentage: 23,
      region: "CONTINENT",
      description: "Taxa normal em Portugal Continental",
    },
    {
      code: "INT",
      name: "Intermédia (13%)",
      percentage: 13,
      region: "CONTINENT",
      description: "Taxa intermédia em Portugal Continental",
    },
    {
      code: "RED",
      name: "Reduzida (6%)",
      percentage: 6,
      region: "CONTINENT",
      description: "Taxa reduzida em Portugal Continental",
    },
    {
      code: "ISE",
      name: "Isento (0%)",
      percentage: 0,
      region: "CONTINENT",
      description: "Isenção de IVA (Art. 9.º, Art. 53.º, Autoliquidação)",
    },
  ],
  AZORES: [
    {
      code: "NOR",
      name: "Normal (16%)",
      percentage: 16,
      region: "AZORES",
      description: "Taxa normal na Região Autónoma dos Açores",
    },
    {
      code: "INT",
      name: "Intermédia (9%)",
      percentage: 9,
      region: "AZORES",
      description: "Taxa intermédia na Região Autónoma dos Açores",
    },
    {
      code: "RED",
      name: "Reduzida (4%)",
      percentage: 4,
      region: "AZORES",
      description: "Taxa reduzida na Região Autónoma dos Açores",
    },
    {
      code: "ISE",
      name: "Isento (0%)",
      percentage: 0,
      region: "AZORES",
      description: "Isenção de IVA nos Açores",
    },
  ],
  MADEIRA: [
    {
      code: "NOR",
      name: "Normal (22%)",
      percentage: 22,
      region: "MADEIRA",
      description: "Taxa normal na Região Autónoma da Madeira",
    },
    {
      code: "INT",
      name: "Intermédia (12%)",
      percentage: 12,
      region: "MADEIRA",
      description: "Taxa intermédia na Região Autónoma da Madeira",
    },
    {
      code: "RED",
      name: "Reduzida (5%)",
      percentage: 5,
      region: "MADEIRA",
      description: "Taxa reduzida na Região Autónoma da Madeira",
    },
    {
      code: "ISE",
      name: "Isento (0%)",
      percentage: 0,
      region: "MADEIRA",
      description: "Isenção de IVA na Madeira",
    },
  ],
};

export const VAT_EXEMPTION_REASONS = [
  { code: "M01", label: "Artigo 16.º n.º 6 alínea c) do CIVA" },
  {
    code: "M02",
    label: "Artigo 6.º do Decreto-Lei n.º 198/90, de 19 de Junho",
  },
  { code: "M04", label: "Isento Artigo 13.º do CIVA" },
  { code: "M05", label: "Isento Artigo 14.º do CIVA" },
  { code: "M07", label: "Isento Artigo 9.º do CIVA" },
  {
    code: "M10",
    label: "Isento Artigo 53.º do CIVA (Regime especial de isenção)",
  },
  { code: "M11", label: "Regime particular do tabaco" },
  { code: "M12", label: "Regime da margem de lucro - Agências de viagens" },
  { code: "M13", label: "Regime da margem de lucro - Bens em segunda mão" },
  {
    code: "M15",
    label: "Regime da margem de lucro - Objetos de arte e de coleção",
  },
  { code: "M16", label: "Isento Artigo 14.º do RITI" },
  { code: "M99", label: "Não sujeito; não tributável" },
];
