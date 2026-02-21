/**
 * Validation Result Interface
 * Represents the result of DATEV validation checks
 */

import { UserFriendlyError } from '../constants/errorMessages';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** User-friendly formatted errors */
  formattedErrors?: UserFriendlyError[];
  /** User-friendly formatted warnings */
  formattedWarnings?: UserFriendlyError[];
}

export interface FieldValidation {
  fieldName: string;
  required: boolean;
  present: boolean;
  value?: any;
  error?: string;
}

/**
 * Line item sum validation strategy result
 */
export type LineItemSumStrategy = 'net-based' | 'gross-based' | 'total-based' | 'none';

export interface LineItemSumValidation {
  valid: boolean;
  strategy: LineItemSumStrategy;
  netSum: number;
  grossSum: number;
  totalSum: number;
  headerNet: number;
  headerGross: number;
  netDifference: number;
  grossDifference: number;
  errors: string[];
}

export interface ValidationReport {
  requiredFieldsValidation: {
    valid: boolean;
    missingFields: string[];
    presentFields: string[];
    fieldsChecked: FieldValidation[];
  };
  formatValidation: {
    valid: boolean;
    errors: string[];
  };
  businessRulesValidation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    checks: {
      totalsMatch: boolean;
      lineItemsSum: boolean;
      lineItemSumDetails?: LineItemSumValidation;
      vatSum: boolean;
      buKeyConsistency: boolean;
      igeRcVatZero?: boolean;
      euVatIdsPresent?: boolean;
    };
  };
  overall: ValidationResult;
  /** Validation mode used (test/prod) */
  mode?: 'test' | 'prod';
}

export enum ValidationStage {
  INPUT_VALIDATION = 'input_validation',
  REQUIRED_FIELDS = 'required_fields',
  FORMAT_VALIDATION = 'format_validation',
  BUSINESS_RULES = 'business_rules',
  XML_GENERATION = 'xml_generation',
  PDF_ACQUISITION = 'pdf_acquisition',
  ZIP_PACKAGING = 'zip_packaging'
}

export interface ValidationError {
  stage: ValidationStage;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}
