/**
 * Validation Mode Configuration
 * Defines behavior differences between TEST and PROD environments
 */

export type DatevMode = 'test' | 'prod';

/**
 * Validation strictness levels for different checks
 */
export type ValidationStrictness = 'error' | 'warning' | 'skip';

/**
 * Mode-specific validation behavior configuration
 */
export interface ValidationModeConfig {
  /** Current mode (test or prod) */
  mode: DatevMode;

  /** VAT ID format validation strictness */
  vatIdFormat: ValidationStrictness;

  /** External VAT ID verification (VIES) */
  vatIdVerification: ValidationStrictness;

  /** Supplier address completeness */
  supplierAddressCompleteness: ValidationStrictness;

  /** BU Key / VAT Rate consistency */
  buKeyVatRateConsistency: ValidationStrictness;

  /** Line item sum validation */
  lineItemSumValidation: ValidationStrictness;

  /** Document number format enforcement */
  documentNumberFormat: ValidationStrictness;

  /** Currency validation (EUR only vs any) */
  currencyValidation: ValidationStrictness;

  /** Allow placeholder/test VAT IDs (e.g., DEXXXXXXXXX) */
  allowPlaceholderVatIds: boolean;

  /** Minimum required fields for each mode */
  requiredFieldsLevel: 'minimal' | 'standard' | 'strict';
}

/**
 * Test mode configuration - relaxed validation for development/testing
 */
export const TEST_MODE_CONFIG: ValidationModeConfig = {
  mode: 'test',
  vatIdFormat: 'warning',
  vatIdVerification: 'skip',
  supplierAddressCompleteness: 'warning',
  buKeyVatRateConsistency: 'warning',
  lineItemSumValidation: 'warning',
  documentNumberFormat: 'warning',
  currencyValidation: 'warning',
  allowPlaceholderVatIds: true,
  requiredFieldsLevel: 'minimal',
};

/**
 * Production mode configuration - strict validation for compliance
 */
export const PROD_MODE_CONFIG: ValidationModeConfig = {
  mode: 'prod',
  vatIdFormat: 'error',
  vatIdVerification: 'warning', // External service may be unavailable
  supplierAddressCompleteness: 'error',
  buKeyVatRateConsistency: 'error',
  lineItemSumValidation: 'warning', // Allow with warning due to invoice variations
  documentNumberFormat: 'warning',
  currencyValidation: 'warning',
  allowPlaceholderVatIds: false,
  requiredFieldsLevel: 'standard',
};

/**
 * Get validation mode configuration based on environment
 */
export function getValidationModeConfig(mode: DatevMode): ValidationModeConfig {
  return mode === 'test' ? TEST_MODE_CONFIG : PROD_MODE_CONFIG;
}

/**
 * Check if a validation result should block the export
 * @param strictness - The configured strictness level
 * @returns true if validation failure should block export
 */
export function shouldBlockOnFailure(strictness: ValidationStrictness): boolean {
  return strictness === 'error';
}

/**
 * Check if validation should be skipped entirely
 * @param strictness - The configured strictness level
 * @returns true if validation should be skipped
 */
export function shouldSkipValidation(strictness: ValidationStrictness): boolean {
  return strictness === 'skip';
}
