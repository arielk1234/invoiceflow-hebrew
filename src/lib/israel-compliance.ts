/**
 * Central Israeli tax/compliance rules used by the application.
 *
 * This module intentionally does not invent Tax Authority API endpoints or
 * field layouts. Integration code must follow the current official specs.
 */

export const UNIFORM_FORMAT_VERSION = "1.31";
export const UNIFORM_SIMULATOR_MIN_RECORDS = 2000;
export const UNIFORM_SIMULATOR_MAX_BYTES = 4 * 1024 * 1024;

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
