/**
 * Central Israeli tax/compliance rules used by the application.
 *
 * Important: this module deliberately does not invent a Tax Authority API
 * endpoint or a Uniform Format file schema. Those integrations must follow
 * the current official specifications published by the Israel Tax Authority.
 */

export const UNIFORM_FORMAT_VERSION = "1.31" as const;
export const UNIFORM_SIMULATOR_MIN_RECORDS = 2000 as const;
export const UNIFORM_SIMULATOR_MAX_BYTES = 4 * 1024 * 1024 as const;

export type AllocationRuleInput = {
  issueDate: string;
  subtotalBeforeVat: number;
  vatRate: number;
  clientIsVatRegistered: boolean;
  clientRequestedAllocation: boolean;
};

export function allocationThresholdForDate(issueDate: string): number {
  if (issueDate >= "2026-06-01") return 5000;
  if (issueDate >= "2026-01-01") return 10000;
  return 20000;
}

/**
 * Returns true only when the statutory conditions for a mandatory allocation
 * number are all represented in the application's data.
 */
export function requiresAllocationNumber(input: AllocationRuleInput): boolean {
  return (
    input.subtotalBeforeVat > allocationThresholdForDate(input.issueDate) &&
    input.vatRate > 0 &&
    input.clientIsVatRegistered &&
    input.clientRequestedAllocation
  );
}

export function validateAllocationNumber(value: string | undefined): boolean {
  return Boolean(value && /^\d{9}$/.test(value));
}

export function validateUniformSimulatorFile(bytes: number, records: number): string[] {
  const errors: string[] = [];
  if (records < UNIFORM_SIMULATOR_MIN_RECORDS) errors.push("UNIFORM_FORMAT_MIN_RECORDS");
  if (bytes > UNIFORM_SIMULATOR_MAX_BYTES) errors.push("UNIFORM_FORMAT_MAX_SIZE");
  return errors;
}
