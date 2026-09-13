/**
 * RPG-OS — Contract & Signature State Machines
 *
 * Contract lifecycle + signature assurance evaluation.
 * NEVER claims legal qualification (eIDAS or otherwise).
 */

import type { ContractStatus, SignatureStatus, SignatureType } from "../../types/contract";

export class ContractStatusStateMachine {
  private static readonly VALID_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
    DRAFT: ["PENDING_REVIEW", "SUSPENDED", "TERMINATED"],
    PENDING_REVIEW: ["DRAFT", "PENDING_SIGNATURE", "TERMINATED"],
    PENDING_SIGNATURE: ["SIGNED", "TERMINATED"],
    SIGNED: ["ACTIVE", "TERMINATED"],
    ACTIVE: ["SUSPENDED", "TERMINATED", "EXPIRED", "DISPUTED"],
    SUSPENDED: ["ACTIVE", "TERMINATED"],
    TERMINATED: ["ARCHIVED"],
    EXPIRED: ["ARCHIVED"],
    DISPUTED: ["ACTIVE", "TERMINATED", "SUSPENDED"],
    ARCHIVED: [],
  };

  private static readonly TERMINAL_STATES: ContractStatus[] = ["ARCHIVED"];

  static canTransition(from: ContractStatus, to: ContractStatus): boolean {
    if (from === to) return true;
    return (this.VALID_TRANSITIONS[from] ?? []).includes(to);
  }

  static isTerminal(status: ContractStatus): boolean {
    return this.TERMINAL_STATES.includes(status);
  }

  static getNextValidStates(current: ContractStatus): ContractStatus[] {
    return [...(this.VALID_TRANSITIONS[current] ?? [])];
  }

  static validateTransition(from: ContractStatus, to: ContractStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid contract state transition: ${from} -> ${to}. ` +
          `Valid transitions from ${from}: ${this.getNextValidStates(from).join(", ")}`,
      );
    }
  }
}

export class ContractSignatureStateMachine {
  private static readonly VALID_TRANSITIONS: Record<SignatureStatus, SignatureStatus[]> = {
    PENDING: ["SENT", "EXPIRED", "REVOKED"],
    SENT: ["VIEWED", "SIGNED", "DECLINED", "EXPIRED", "REVOKED"],
    VIEWED: ["SIGNED", "DECLINED", "EXPIRED", "REVOKED"],
    SIGNED: ["REVOKED"],
    DECLINED: [],
    EXPIRED: [],
    REVOKED: [],
  };

  private static readonly TERMINAL_STATES: SignatureStatus[] = ["DECLINED", "EXPIRED", "REVOKED"];

  static canTransition(from: SignatureStatus, to: SignatureStatus): boolean {
    if (from === to) return true;
    return (this.VALID_TRANSITIONS[from] ?? []).includes(to);
  }

  static isTerminal(status: SignatureStatus): boolean {
    return this.TERMINAL_STATES.includes(status);
  }

  static validateTransition(from: SignatureStatus, to: SignatureStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid signature state transition: ${from} -> ${to}. ` +
          `Valid transitions from ${from}: ${this.getNextValidStates(from).join(", ")}`,
      );
    }
  }

  static getNextValidStates(current: SignatureStatus): SignatureStatus[] {
    return [...(this.VALID_TRANSITIONS[current] ?? [])];
  }
}

export type SignatureAssuranceLevel = "LOW" | "MEDIUM" | "HIGH" | "QUALIFIED" | "REJECT";

export interface SignatureAssuranceInput {
  emailConfirmed?: boolean;
  identityVerifiedEvent?: { provider: string; verifiedAt?: string };
  signatureData?: string;
  certificate?: {
    issuer: string;
    serialNumber: string;
    subject: string;
    validFrom: string;
    validTo: string;
    fingerprint: string;
  };
  signedAt?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SignatureAssuranceResult {
  valid: boolean;
  level: SignatureAssuranceLevel;
  reasons: string[];
}

export function evaluateSignatureAssurance(
  type: SignatureType,
  input: SignatureAssuranceInput,
): SignatureAssuranceResult {
  switch (type) {
    case "SIMPLE": {
      const valid = input.emailConfirmed === true;
      return {
        valid,
        level: valid ? "MEDIUM" : "REJECT",
        reasons: valid ? [] : ["email confirmation required for SIMPLE signature"],
      };
    }
    case "ELECTRONIC": {
      const event = input.identityVerifiedEvent;
      const valid = Boolean(event?.provider);
      return {
        valid,
        level: valid ? "MEDIUM" : "REJECT",
        reasons: valid
          ? []
          : ["identity verified event required for ELECTRONIC signature (eIDAS SES)"],
      };
    }
    case "ADVANCED": {
      const event = input.identityVerifiedEvent;
      const sigData = input.signatureData?.trim();
      const valid = Boolean(event?.provider && sigData);
      return {
        valid,
        level: valid ? "HIGH" : "REJECT",
        reasons: valid
          ? []
          : ["ADVANCED signature requires verified identity and signature data"],
      };
    }
    case "QUALIFIED": {
      const cert = input.certificate;
      const signedAt = input.signedAt ? new Date(input.signedAt).getTime() : NaN;
      if (!cert) {
        return { valid: false, level: "REJECT", reasons: ["QUALIFIED signature requires a certificate"] };
      }
      const now = Date.now();
      const certValidFrom = new Date(cert.validFrom).getTime();
      const certValidTo = new Date(cert.validTo).getTime();
      const certWindowValid =
        !Number.isNaN(certValidFrom) &&
        !Number.isNaN(certValidTo) &&
        now >= certValidFrom &&
        now <= certValidTo;
      const timestampValid =
        !Number.isNaN(signedAt) && signedAt >= certValidFrom && signedAt <= certValidTo;
      const reasons: string[] = [];
      if (!certWindowValid) reasons.push("certificate is outside its validity window");
      if (!timestampValid) reasons.push("signedAt must be within certificate validity window");
      if (!cert.fingerprint) reasons.push("certificate fingerprint is required");
      const valid = certWindowValid && timestampValid && Boolean(cert.fingerprint);
      return { valid, level: valid ? "QUALIFIED" : "REJECT", reasons };
    }
    case "DIGITAL": {
      const cert = input.certificate;
      const event = input.identityVerifiedEvent;
      const valid = Boolean(cert && cert.fingerprint && event?.provider);
      return {
        valid,
        level: valid ? "QUALIFIED" : "REJECT",
        reasons: valid
          ? []
          : ["DIGITAL signature requires a verified identity event and a valid certificate"],
      };
    }
    case "HANDWRITTEN": {
      return { valid: true, level: "LOW", reasons: ["HANDWRITTEN: external process; not validated online"] };
    }
    case "WITNESSED": {
      return { valid: true, level: "MEDIUM", reasons: ["WITNESSED: external witness process; not validated online"] };
    }
  }
}