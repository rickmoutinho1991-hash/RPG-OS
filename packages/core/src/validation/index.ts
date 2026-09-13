export type { PortugueseNifType } from "./nif";
export {
  isValidPortugueseNif,
  isValidPortugueseIndividualNif,
  isValidPortugueseCompanyNipc,
  classifyPortugueseNif,
  formatPortugueseNif,
} from "./nif";

export {
  isValidPortuguesePostalCode,
  formatPortuguesePostalCode,
} from "./postalCode";

export {
  isValidPortuguesePhone,
  formatPortuguesePhone,
} from "./phone";

export {
  isValidPortugueseIban,
  formatPortugueseIban,
} from "./iban";
