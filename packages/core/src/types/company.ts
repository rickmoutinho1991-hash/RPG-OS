export type CompanyLegalForm =
  | "ENI"
  | "EMPRESARIO_INDIVIDUAL"
  | "SOCIEDADE_UNIPESSOAL"
  | "LDA"
  | "SA"
  | "OUTRA";

export interface CompanyRegistration {
  id: string;
  profileId: string;
  legalName: string;
  tradeName?: string;
  nif: string;
  legalForm: CompanyLegalForm;
  registrationNumber?: string;
  activityCode?: string;
  activityDescription?: string;
  registeredAddress: string;
  postalCode: string;
  city: string;
  country: string;
  representativeName: string;
  representativeNif: string;
  representativeRole: string;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
}
