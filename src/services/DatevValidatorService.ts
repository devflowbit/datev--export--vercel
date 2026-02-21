/**
 * DATEV Validator Service
 * Business Rules Validation only (Layer 3, Rules 4–6)
 *
 * Layer 1 (Required Fields) and Layer 2 (Format Validation) have been moved
 * to the application side (flowbit-idp-staging/src/lib/datev-pre-validation.ts)
 * and run before the export is triggered, avoiding an Azure round-trip.
 *
 * Rules that remain here require the fully parsed DatevDocument structure:
 *   Rule 4: BU Key ↔ VAT rate consistency
 *   Rule 5: IGE/Reverse Charge requires 0% VAT on supplier document
 *   Rule 6: EU transactions require VAT IDs for both parties
 */

import { DatevDocument, LineItem } from '../models/DatevDocument.interface';
import {
  ValidationResult,
  ValidationReport,
  ValidationStage,
  ValidationError,
} from '../models/ValidationResult.interface';
import { validateBUKeyVATRate, isIGEKey, isRCKey, requiresZeroVATOnSupplierDoc, isEUCountry, getBUKeyInfo } from '../constants/buKeys';
import { getValidationMode, isTestMode } from '../config/datevConfig';
import { ValidationModeConfig } from '../models/ValidationMode.interface';
import { ErrorFormatterService } from './ErrorFormatterService';

export class DatevValidatorService {
  private validationErrors: ValidationError[] = [];
  private modeConfig: ValidationModeConfig;
  private errorFormatter: ErrorFormatterService;

  constructor() {
    this.modeConfig = getValidationMode();
    this.errorFormatter = new ErrorFormatterService('de');
  }

  /**
   * Perform business rules validation (Rules 4–6).
   *
   * Layer 1 (required fields) and Layer 2 (format) are checked on the
   * application side before the export is triggered and are not repeated here.
   */
  public validate(datevDoc: DatevDocument): ValidationReport {
    this.validationErrors = [];

    // Business rules only
    const businessRulesValidation = this.validateBusinessRules(datevDoc);

    const allErrors: string[] = [...businessRulesValidation.errors];
    const allWarnings: string[] = [...businessRulesValidation.warnings];

    const formattedErrors = this.errorFormatter.formatErrors(allErrors, 'error');
    const formattedWarnings = this.errorFormatter.formatErrors(allWarnings, 'warning');

    const overall: ValidationResult = {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      formattedErrors,
      formattedWarnings,
    };

    return {
      // Stub results for removed layers — always valid (checked on app side before export)
      requiredFieldsValidation: { valid: true, missingFields: [], presentFields: [], fieldsChecked: [] },
      formatValidation: { valid: true, errors: [] },
      businessRulesValidation,
      overall,
      mode: this.modeConfig.mode,
    };
  }

  /**
   * Business Rules Validation — Rules 4, 5, 6
   *
   * Rule 4: BU Key consistency with VAT rate
   * Rule 5: IGE/RC must have 0 VAT on supplier document
   * Rule 6: EU transactions require VAT IDs for both parties
   */
  private validateBusinessRules(datevDoc: DatevDocument): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    checks: {
      totalsMatch: boolean;
      lineItemsSum: boolean;
      lineItemSumDetails?: undefined;
      vatSum: boolean;
      buKeyConsistency: boolean;
      igeRcVatZero?: boolean;
      euVatIdsPresent?: boolean;
    };
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const checks = {
      totalsMatch: true,           // removed — checked on app side
      lineItemsSum: true,          // removed — checked on app side
      lineItemSumDetails: undefined as undefined,
      vatSum: true,                // removed — checked on app side
      buKeyConsistency: true,
      igeRcVatZero: true,
      euVatIdsPresent: true,
    };

    if (datevDoc.lineItems && datevDoc.lineItems.length > 0) {
      // Rule 4: BU Key consistency with VAT rate
      // For credit notes with foreign VAT rates, skip strict BU Key validation
      const isCreditNote = datevDoc.documentDirection === 'creditNote';

      datevDoc.lineItems.forEach((line, idx) => {
        const buKeyValid = validateBUKeyVATRate(line.buKey, line.vatRate);

        // Skip BU Key validation for credit notes (they may have foreign VAT rates)
        if (!buKeyValid && !isCreditNote) {
          checks.buKeyConsistency = false;
          errors.push(
            `Line ${idx + 1}: BU Key '${line.buKey}' does not match VAT rate ${line.vatRate}%`
          );
          this.addError(ValidationStage.BUSINESS_RULES, `lineItems[${idx}].buKey`, 'BU Key/VAT rate mismatch', 'error');
        }

        // For credit notes, issue a warning instead of error
        if (!buKeyValid && isCreditNote) {
          const buKeyInfo = getBUKeyInfo(line.buKey);
          this.addError(
            ValidationStage.BUSINESS_RULES,
            `lineItems[${idx}].buKey`,
            `Credit Note: BU Key '${line.buKey}' expects ${buKeyInfo?.vatRate}% but document shows ${line.vatRate}%`,
            'warning'
          );
        }
      });

      // Rule 5: IGE/RC must have 0 VAT on supplier document
      const hasIGEOrRC = datevDoc.lineItems.some(line => requiresZeroVATOnSupplierDoc(line.buKey));

      if (hasIGEOrRC && datevDoc.totalTax > 0.01) {
        checks.igeRcVatZero = false;
        const igeKeys = datevDoc.lineItems.filter(line => isIGEKey(line.buKey)).map(l => l.buKey);
        const rcKeys = datevDoc.lineItems.filter(line => isRCKey(line.buKey)).map(l => l.buKey);
        const detectedKeys = [...igeKeys, ...rcKeys].join(', ');

        errors.push(
          `IGE/Reverse Charge detected (BU keys: ${detectedKeys}) but total VAT is ${datevDoc.totalTax.toFixed(2)}. ` +
          `Supplier document must show 0% VAT for IGE/RC cases (buyer self-assesses VAT).`
        );
        this.addError(ValidationStage.BUSINESS_RULES, 'totalTax', 'IGE/RC requires 0 VAT', 'error');
      }
    }

    // Rule 6: EU transactions require VAT IDs for both parties
    if (datevDoc.supplier?.country && isEUCountry(datevDoc.supplier.country) && datevDoc.supplier.country !== 'DE') {
      // In test mode, EU VAT ID requirements are warnings
      const euVatSeverity = isTestMode() ? 'warning' : 'error';
      const euVatList = isTestMode() ? warnings : errors;

      if (!datevDoc.supplier.vatId) {
        checks.euVatIdsPresent = false;
        euVatList.push(`EU supplier (${datevDoc.supplier.country}) requires VAT ID (USt-IdNr)`);
        this.addError(ValidationStage.BUSINESS_RULES, 'supplier.vatId', 'EU supplier requires VAT ID', euVatSeverity);
      }

      if (!datevDoc.customerVatId) {
        checks.euVatIdsPresent = false;
        euVatList.push(`EU transaction requires your German VAT ID (UStIdNrKunde) to be configured`);
        this.addError(ValidationStage.BUSINESS_RULES, 'customerVatId', 'Your VAT ID required for EU', euVatSeverity);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      checks,
    };
  }

  /**
   * Get all validation errors
   */
  public getValidationErrors(): ValidationError[] {
    return this.validationErrors;
  }

  /**
   * Add validation error
   */
  private addError(stage: ValidationStage, field: string | undefined, message: string, severity: 'error' | 'warning'): void {
    this.validationErrors.push({
      stage,
      field,
      message,
      severity,
    });
  }

  /**
   * Quick validation check - returns only valid/invalid with error list
   */
  public quickValidate(datevDoc: DatevDocument): ValidationResult {
    const fullReport = this.validate(datevDoc);
    return fullReport.overall;
  }
}
