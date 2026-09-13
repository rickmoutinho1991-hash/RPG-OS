export interface PortugalDistrict {
  id: string;
  name: string;
  region: "CONTINENT" | "AZORES" | "MADEIRA";
}

export const PORTUGUESE_DISTRICTS: PortugalDistrict[] = [
  { id: "AV", name: "Aveiro", region: "CONTINENT" },
  { id: "BE", name: "Beja", region: "CONTINENT" },
  { id: "BR", name: "Braga", region: "CONTINENT" },
  { id: "BG", name: "Bragança", region: "CONTINENT" },
  { id: "CB", name: "Castelo Branco", region: "CONTINENT" },
  { id: "CO", name: "Coimbra", region: "CONTINENT" },
  { id: "EV", name: "Évora", region: "CONTINENT" },
  { id: "FA", name: "Faro", region: "CONTINENT" },
  { id: "GU", name: "Guarda", region: "CONTINENT" },
  { id: "LE", name: "Leiria", region: "CONTINENT" },
  { id: "LI", name: "Lisboa", region: "CONTINENT" },
  { id: "PA", name: "Portalegre", region: "CONTINENT" },
  { id: "PO", name: "Porto", region: "CONTINENT" },
  { id: "SA", name: "Santarém", region: "CONTINENT" },
  { id: "SE", name: "Setúbal", region: "CONTINENT" },
  { id: "VC", name: "Viana do Castelo", region: "CONTINENT" },
  { id: "VR", name: "Vila Real", region: "CONTINENT" },
  { id: "VI", name: "Viseu", region: "CONTINENT" },
  { id: "AC", name: "Região Autónoma dos Açores", region: "AZORES" },
  { id: "MA", name: "Região Autónoma da Madeira", region: "MADEIRA" },
];
