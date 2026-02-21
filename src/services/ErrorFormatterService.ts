/**
 * Error Formatter Service
 * 
 * Transforms technical validation errors into user-friendly messages
 * with bilingual support (German/English).
 */

import {
  ErrorCode,
  ErrorMessageDefinition,
  UserFriendlyError,
  SupportedLanguage,
  ErrorSeverity,
  ERROR_MESSAGES,
  getErrorDefinition,
} from '../constants/errorMessages';
import { ValidationError, ValidationStage } from '../models/ValidationResult.interface';
import { isTestMode } from '../config/datevConfig';

/**
 * Default language for error messages
 */
const DEFAULT_LANGUAGE: SupportedLanguage = 'de';

/**
 * Mapping from technical error patterns to error codes
 */
const ERROR_PATTERN_MAP: Array<{ pattern: RegExp; code: ErrorCode; fieldExtractor?: (match: RegExpMatchArray) => string }> = [
  // Required field patterns
  { pattern: /REQUIRED:.*Document Number.*missing/i, code: ErrorCode.MISSING_INVOICE_NUMBER },
  { pattern: /REQUIRED:.*Belegnummer.*missing/i, code: ErrorCode.MISSING_INVOICE_NUMBER },
  { pattern: /REQUIRED:.*Document Date.*missing/i, code: ErrorCode.MISSING_INVOICE_DATE },
  { pattern: /REQUIRED:.*Belegdatum.*missing/i, code: ErrorCode.MISSING_INVOICE_DATE },
  { pattern: /REQUIRED:.*Supplier Name.*missing/i, code: ErrorCode.MISSING_SUPPLIER_NAME },
  { pattern: /REQUIRED:.*Supplier Street.*missing/i, code: ErrorCode.MISSING_SUPPLIER_STREET },
  { pattern: /REQUIRED:.*Straße.*missing/i, code: ErrorCode.MISSING_SUPPLIER_STREET },
  { pattern: /REQUIRED:.*Supplier Postal.*missing/i, code: ErrorCode.MISSING_SUPPLIER_POSTAL_CODE },
  { pattern: /REQUIRED:.*PLZ.*missing/i, code: ErrorCode.MISSING_SUPPLIER_POSTAL_CODE },
  { pattern: /REQUIRED:.*Supplier City.*missing/i, code: ErrorCode.MISSING_SUPPLIER_CITY },
  { pattern: /REQUIRED:.*Ort.*missing/i, code: ErrorCode.MISSING_SUPPLIER_CITY },
  { pattern: /REQUIRED:.*Supplier Country.*missing/i, code: ErrorCode.MISSING_SUPPLIER_COUNTRY },
  { pattern: /REQUIRED:.*Land.*missing/i, code: ErrorCode.MISSING_SUPPLIER_COUNTRY },
  { pattern: /REQUIRED:.*Gross Amount.*missing/i, code: ErrorCode.MISSING_GROSS_AMOUNT },
  { pattern: /REQUIRED:.*BetragBrutto.*missing/i, code: ErrorCode.MISSING_GROSS_AMOUNT },
  { pattern: /REQUIRED:.*Net Amount.*missing/i, code: ErrorCode.MISSING_NET_AMOUNT },
  { pattern: /REQUIRED:.*BetragNetto.*missing/i, code: ErrorCode.MISSING_NET_AMOUNT },
  { pattern: /REQUIRED:.*Currency.*missing/i, code: ErrorCode.MISSING_CURRENCY },
  { pattern: /REQUIRED:.*Währung.*missing/i, code: ErrorCode.MISSING_CURRENCY },
  { pattern: /REQUIRED:.*VAT Case.*missing/i, code: ErrorCode.MISSING_VAT_CASE },
  { pattern: /REQUIRED:.*Steuerfall.*missing/i, code: ErrorCode.MISSING_VAT_CASE },
  { pattern: /REQUIRED:.*Tax Rate.*missing/i, code: ErrorCode.MISSING_TAX_RATE },
  { pattern: /REQUIRED:.*Steuersatz.*missing/i, code: ErrorCode.MISSING_TAX_RATE },
  { pattern: /REQUIRED:.*Primary PDF.*missing/i, code: ErrorCode.MISSING_PDF },
  { pattern: /REQUIRED:.*HauptbelegPDF.*missing/i, code: ErrorCode.MISSING_PDF },
  { pattern: /REQUIRED:.*Exchange Rate.*required/i, code: ErrorCode.MISSING_EXCHANGE_RATE },
  { pattern: /REQUIRED:.*Wechselkurs.*required/i, code: ErrorCode.MISSING_EXCHANGE_RATE },
  { pattern: /At least 1 line item required/i, code: ErrorCode.MISSING_LINE_ITEMS },
  { pattern: /Gross Amount must be > 0/i, code: ErrorCode.INVALID_GROSS_AMOUNT },
  { pattern: /Credit Note:.*Gross Amount must be < 0/i, code: ErrorCode.CREDIT_NOTE_POSITIVE_AMOUNT },

  // Format validation patterns
  { pattern: /Invalid.*date format/i, code: ErrorCode.INVALID_DATE_FORMAT },
  { pattern: /Invalid.*VAT ID format/i, code: ErrorCode.INVALID_VAT_ID_FORMAT },
  { pattern: /Invalid postal code/i, code: ErrorCode.INVALID_POSTAL_CODE },
  { pattern: /Invalid country code/i, code: ErrorCode.INVALID_COUNTRY_CODE },
  { pattern: /Invalid currency code/i, code: ErrorCode.INVALID_CURRENCY_CODE },
  { pattern: /Invalid BU Key/i, code: ErrorCode.INVALID_BU_KEY },

  // Business rule patterns
  { pattern: /Totals mismatch/i, code: ErrorCode.TOTALS_MISMATCH },
  { pattern: /Line items net sum.*does not match/i, code: ErrorCode.LINE_ITEMS_SUM_MISMATCH },
  { pattern: /Line items VAT sum.*does not match/i, code: ErrorCode.VAT_SUM_MISMATCH },
  { pattern: /BU Key.*does not match VAT rate/i, code: ErrorCode.BU_KEY_VAT_RATE_MISMATCH },
  { pattern: /IGE.*Reverse Charge.*VAT/i, code: ErrorCode.IGE_RC_NON_ZERO_VAT },
  { pattern: /EU supplier.*requires VAT ID/i, code: ErrorCode.EU_MISSING_VAT_ID },
  { pattern: /EU transaction requires.*VAT ID/i, code: ErrorCode.EU_MISSING_VAT_ID },

  // System error patterns
  { pattern: /PDF.*failed/i, code: ErrorCode.PDF_ACQUISITION_FAILED },
  { pattern: /ZIP.*failed/i, code: ErrorCode.ZIP_PACKAGING_FAILED },
  { pattern: /XML.*failed/i, code: ErrorCode.XML_GENERATION_FAILED },
];

/**
 * Error Formatter Service
 * Converts technical errors to user-friendly format
 */
export class ErrorFormatterService {
  private language: SupportedLanguage;

  constructor(language: SupportedLanguage = DEFAULT_LANGUAGE) {
    this.language = language;
  }

  /**
   * Set the output language
   */
  public setLanguage(language: SupportedLanguage): void {
    this.language = language;
  }

  /**
   * Format a single technical error message to user-friendly format
   */
  public formatError(
    technicalMessage: string,
    field?: string,
    severity?: ErrorSeverity
  ): UserFriendlyError {
    // Try to match the technical message to a known error code
    const errorCode = this.matchErrorCode(technicalMessage);

    if (errorCode) {
      const definition = getErrorDefinition(errorCode);
      if (definition) {
        const primaryMessages = definition.messages[this.language];
        return {
          code: definition.code,
          field,
          severity: severity || definition.severity,
          category: definition.category,
          // Primary language (for backwards compatibility)
          title: primaryMessages.title,
          detail: primaryMessages.detail,
          suggestion: primaryMessages.suggestion,
          // Bilingual messages
          messages: {
            en: {
              title: definition.messages.en.title,
              detail: definition.messages.en.detail,
              suggestion: definition.messages.en.suggestion,
            },
            de: {
              title: definition.messages.de.title,
              detail: definition.messages.de.detail,
              suggestion: definition.messages.de.suggestion,
            },
          },
          technicalMessage,
        };
      }
    }

    // Fallback for unrecognized errors
    return this.createFallbackError(technicalMessage, field, severity);
  }

  /**
   * Format multiple validation errors
   */
  public formatErrors(
    errors: string[],
    defaultSeverity: ErrorSeverity = 'error'
  ): UserFriendlyError[] {
    return errors.map(error => this.formatError(error, undefined, defaultSeverity));
  }

  /**
   * Format ValidationError objects from the validator service
   */
  public formatValidationErrors(validationErrors: ValidationError[]): UserFriendlyError[] {
    return validationErrors.map(error =>
      this.formatError(error.message, error.field, error.severity)
    );
  }

  /**
   * Create a structured error response for the API
   */
  public createErrorResponse(
    errors: UserFriendlyError[],
    warnings: UserFriendlyError[] = []
  ): FormattedErrorResponse {
    const errorsByCategory = this.groupByCategory(errors);
    const warningsByCategory = this.groupByCategory(warnings);

    // Create summary message
    const summaryMessage = this.createSummaryMessage(errors, warnings);

    return {
      success: false,
      summary: summaryMessage,
      mode: isTestMode() ? 'test' : 'prod',
      errors: {
        count: errors.length,
        items: errors,
        byCategory: errorsByCategory,
      },
      warnings: {
        count: warnings.length,
        items: warnings,
        byCategory: warningsByCategory,
      },
    };
  }

  /**
   * Create a simple error message string for backwards compatibility
   */
  public createSimpleErrorMessage(errors: UserFriendlyError[]): string {
    if (errors.length === 0) {
      return '';
    }

    if (errors.length === 1) {
      return `${errors[0].title}: ${errors[0].detail}`;
    }

    const titles = errors.map(e => e.title).join(', ');
    return `${errors.length} validation errors: ${titles}`;
  }

  /**
   * Match a technical error message to an error code
   */
  private matchErrorCode(technicalMessage: string): ErrorCode | undefined {
    for (const { pattern, code } of ERROR_PATTERN_MAP) {
      if (pattern.test(technicalMessage)) {
        return code;
      }
    }
    return undefined;
  }

  /**
   * Create a fallback error for unrecognized messages
   */
  private createFallbackError(
    technicalMessage: string,
    field?: string,
    severity?: ErrorSeverity
  ): UserFriendlyError {
    const isGerman = this.language === 'de';
    const fallbackEn = {
      title: 'Validation error',
      detail: technicalMessage,
      suggestion: 'Please check the input data and try again.',
    };
    const fallbackDe = {
      title: 'Validierungsfehler',
      detail: technicalMessage,
      suggestion: 'Bitte prüfen Sie die Eingabedaten und versuchen Sie es erneut.',
    };

    return {
      code: ErrorCode.UNEXPECTED_ERROR,
      field,
      severity: severity || 'error',
      category: 'system',
      // Primary language (for backwards compatibility)
      title: isGerman ? fallbackDe.title : fallbackEn.title,
      detail: technicalMessage,
      suggestion: isGerman ? fallbackDe.suggestion : fallbackEn.suggestion,
      // Bilingual messages
      messages: {
        en: fallbackEn,
        de: fallbackDe,
      },
      technicalMessage,
    };
  }

  /**
   * Group errors by category
   */
  private groupByCategory(
    errors: UserFriendlyError[]
  ): Record<string, UserFriendlyError[]> {
    return errors.reduce((acc, error) => {
      const category = error.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(error);
      return acc;
    }, {} as Record<string, UserFriendlyError[]>);
  }

  /**
   * Create a summary message
   */
  private createSummaryMessage(
    errors: UserFriendlyError[],
    warnings: UserFriendlyError[]
  ): string {
    const isGerman = this.language === 'de';
    const parts: string[] = [];

    if (errors.length > 0) {
      parts.push(
        isGerman
          ? `${errors.length} Fehler gefunden`
          : `${errors.length} error(s) found`
      );
    }

    if (warnings.length > 0) {
      parts.push(
        isGerman
          ? `${warnings.length} Warnung(en)`
          : `${warnings.length} warning(s)`
      );
    }

    if (parts.length === 0) {
      return isGerman ? 'Keine Probleme gefunden' : 'No issues found';
    }

    return parts.join(', ');
  }
}

/**
 * Formatted error response structure
 */
export interface FormattedErrorResponse {
  success: false;
  summary: string;
  mode: 'test' | 'prod';
  errors: {
    count: number;
    items: UserFriendlyError[];
    byCategory: Record<string, UserFriendlyError[]>;
  };
  warnings: {
    count: number;
    items: UserFriendlyError[];
    byCategory: Record<string, UserFriendlyError[]>;
  };
}

/**
 * Helper function to create formatter with default language
 */
export function createErrorFormatter(language?: SupportedLanguage): ErrorFormatterService {
  return new ErrorFormatterService(language || DEFAULT_LANGUAGE);
}

/**
 * Quick format function for simple use cases
 */
export function formatValidationErrors(
  errors: string[],
  language: SupportedLanguage = 'de'
): UserFriendlyError[] {
  const formatter = new ErrorFormatterService(language);
  return formatter.formatErrors(errors);
}
