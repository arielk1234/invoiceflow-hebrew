/**
 * Central Israeli tax/compliance rules used by the application.
 *
 * This module intentionally does not invent Tax Authority API endpoints or
 * field layouts. Integration code must follow the current official specs.
 */

export const STANDARD_VAT_RATE = 18;

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

/**
 * Israeli ID, VAT (עוסק מורשה) and company numbers are 9 digits whose last digit
 * is a check digit: weights 1,2,1,2,… with two-digit products summed, total % 10 = 0.
 * Catches typos before the Tax Authority rejects them with error 431.
 */
export function isValidIsraeliTaxId(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const sum = [...value].reduce((acc, ch, i) => {
    const n = Number(ch) * (i % 2 === 0 ? 1 : 2);
    return acc + (n > 9 ? n - 9 : n);
  }, 0);
  return sum % 10 === 0;
}

/**
 * The Approval service returns a long confirmation number (26 digits in the
 * official examples). The full number is stored; a number typed in by hand may
 * be only the short 9-digit form.
 */
export function isValidAllocationNumber(value: string | undefined): boolean {
  return Boolean(value && /^\d{9,30}$/.test(value) && !/^0+$/.test(value));
}

/**
 * The invoice shows only the rightmost 9 digits under "מספר הקצאה:"
 * (Israel Invoice API document, edition 2.0, section 2.2.1).
 */
export function shortAllocationNumber(value: string): string {
  return value.slice(-9);
}

export function validateUniformSimulatorFile(bytes: number, records: number): string[] {
  const errors: string[] = [];
  if (records < UNIFORM_SIMULATOR_MIN_RECORDS) errors.push("UNIFORM_FORMAT_MIN_RECORDS");
  if (bytes > UNIFORM_SIMULATOR_MAX_BYTES) errors.push("UNIFORM_FORMAT_MAX_SIZE");
  return errors;
}
