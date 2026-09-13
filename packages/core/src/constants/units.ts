export interface MeasurementUnit {
  code: string;
  name: string;
  category:
    | "TIME"
    | "AREA"
    | "VOLUME"
    | "LENGTH"
    | "WEIGHT"
    | "QUANTITY"
    | "GLOBAL";
  description: string;
}

export const MEASUREMENT_UNITS: MeasurementUnit[] = [
  {
    code: "un",
    name: "Unidade",
    category: "QUANTITY",
    description: "Unidades ou peças",
  },
  {
    code: "h",
    name: "Hora",
    category: "TIME",
    description: "Horas de mão-de-obra ou equipamento",
  },
  {
    code: "dia",
    name: "Dia",
    category: "TIME",
    description: "Diária de trabalho ou aluguer",
  },
  {
    code: "m2",
    name: "Metro quadrado (m²)",
    category: "AREA",
    description: "Área de pavimento, parede, pintura, isolamento",
  },
  {
    code: "m3",
    name: "Metro cúbico (m³)",
    category: "VOLUME",
    description: "Volume de betão, terraplanagem, inertes",
  },
  {
    code: "ml",
    name: "Metro linear (m)",
    category: "LENGTH",
    description: "Tubagens, rodapés, caleiras, cabos",
  },
  {
    code: "kg",
    name: "Quilograma (kg)",
    category: "WEIGHT",
    description: "Peso de ferro, argamassas, materiais",
  },
  {
    code: "ton",
    name: "Tonelada (t)",
    category: "WEIGHT",
    description: "Cargas pesadas de inertes, aço estrutural",
  },
  {
    code: "l",
    name: "Litro (L)",
    category: "VOLUME",
    description: "Tintas, vernizes, aditivos, combustíveis",
  },
  {
    code: "vg",
    name: "Verba Global",
    category: "GLOBAL",
    description: "Preço fechado para a totalidade do trabalho",
  },
  {
    code: "conj",
    name: "Conjunto",
    category: "QUANTITY",
    description: "Conjunto de equipamentos ou peças",
  },
];
