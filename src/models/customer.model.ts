// Customer and configuration data models (Cosmos DB schema)

export type Status = "ACTIVE" | "INACTIVE";

export interface Customer {
  id: string;
  partitionKey: "customers";
  customerName: string;
  aliases: string[];
  primaryDomain: string;
  additionalDomains: string[];
  status: Status;
  updatedAt: string;
}

export interface Advisor {
  id: string;
  partitionKey: "advisors";
  advisorName: string;
  emailDomain: string;
  linkedCustomers: string[];
  status: Status;
  updatedAt?: string;
}

export type ExemptionType =
  | "ALL_CHECKS"
  | "CHECK_1_ONLY"
  | "CHECK_2_BYPASS"
  | "CHECK_3_BYPASS"
  | "BYPASS_WARNING";

export interface Exemption {
  id: string;
  partitionKey: "exemptions";
  userEmail: string;
  fullName: string;
  exemptionType: ExemptionType;
  scope: string;
  expiryDate: string | null;
}

export interface Exclusion {
  id: string;
  partitionKey: "exclusions";
  emailAddress: string | null;
  domainPattern: string | null;
  allowUnencrypted: boolean;
  reason: string;
  expiryDate: string | null;
}

export interface DLPConfig {
  customers: Customer[];
  advisors: Advisor[];
  exemptions: Exemption[];
  exclusions: Exclusion[];
}
