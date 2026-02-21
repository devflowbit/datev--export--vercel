/**
 * DATEV Validator Service
 * Comprehensive 3-layer validation: Required Fields → Format Validation → Business Rules
 * Based on DATEV XML Field List specification (Sheet L: Validation Rules)
 * 
 * NEW: Mode-aware validation (test/prod) and dual line item sum validation
 */

import { DatevDocument, LineItem } from '../models/DatevDocument.interface';
import { 
  ValidationResult, 
  ValidationReport, 
  ValidationStage, 
  ValidationError,
  LineItemSumValidation,
  LineItemSumStrategy
} from '../models/ValidationResult.interface';
import { validatePostalCode, validateCountryCode, validateAddress } from '../utils/addressParser';
import { validateTotals } from '../utils/numberFormatter';
import { validateBUKeyVATRate, isIGEKey, isRCKey, requiresZeroVATOnSupplierDoc, isEUCountry, getBUKeyInfo } from '../constants/buKeys';
import { DATEV_CONFIG, getValidationMode, isTestMode } from '../config/datevConfig';
import { 
  ValidationModeConfig, 
  shouldBlockOnFailure, 
  shouldSkipValidation 
} from '../models/ValidationMode.interface';
import { ErrorFormatterService } from './ErrorFormatterService';
import { VATValidationService } from './VATValidationService';

export class DatevValidatorService {
  private validationErrors: ValidationError[] = [];
  private modeConfig: ValidationModeConfig;
  private errorFormatter: ErrorFormatterService;

  constructor() {
    this.modeConfig = getValidationMode();
    this.errorFormatter = new ErrorFormatterService('de');
  }

  /**
   * Perform complete validation (all 3 layers) with mode awareness
   */
  public validate(datevDoc: DatevDocument): ValidationReport {
    this.validationErrors = [];

    // Layer 1: Required Fields Validation
    const requiredFieldsValidation = this.validateRequiredFields(datevDoc);

    // Layer 2: Format Validation
    const formatValidation = this.validateFormats(datevDoc);

    // Layer 3: Business Rules Validation (includes dual sum validation)
    const businessRulesValidation = this.validateBusinessRules(datevDoc);

    // Collect all errors and warnings based on mode
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    // Required fields - always errors (critical for DATEV)
    allErrors.push(...requiredFieldsValidation.missingFields.map(f => `REQUIRED: ${f} missing`));

    // Format validation - mode-aware
    formatValidation.errors.forEach(error => {
      if (this.shouldTreatAsWarning('format', error)) {
        allWarnings.push(error);
      } else {
        allErrors.push(error);
      }
    });

    // Business rules - separate errors and warnings
    allErrors.push(...businessRulesValidation.errors);
    allWarnings.push(...businessRulesValidation.warnings);

    // Format errors for user-friendly output
    const formattedErrors = this.errorFormatter.formatErrors(allErrors, 'error');
    const formattedWarnings = this.errorFormatter.formatErrors(allWarnings, 'warning');

    // Overall result - only errors block export, not warnings
    const overall: ValidationResult = {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      formattedErrors,
      formattedWarnings
    };

    return {
      requiredFieldsValidation,
      formatValidation,
      businessRulesValidation,
      overall,
      mode: this.modeConfig.mode
    };
  }

  /**
   * Determine if an error should be treated as warning based on mode
   */
  private shouldTreatAsWarning(category: string, error: string): boolean {
    if (isTestMode()) {
      // In test mode, VAT ID format errors become warnings
      if (error.toLowerCase().includes('vat id') || error.toLowerCase().includes('ust-idnr')) {
        return true;
      }
      // BU Key mismatches become warnings in test mode
      if (error.toLowerCase().includes('bu key')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Layer 1: Validate Required Fields (Sheet B-F from DATEV spec)
   */
  private validateRequiredFields(datevDoc: DatevDocument): {
    valid: boolean;
    missingFields: string[];
    presentFields: string[];
    fieldsChecked: Array<{ fieldName: string; required: boolean; present: boolean; value?: any; error?: string }>;
  } {
    const missingFields: string[] = [];
    const presentFields: string[] = [];
    const fieldsChecked: Array<{ fieldName: string; required: boolean; present: boolean; value?: any; error?: string }> = [];

    // Helper function to check field
    const checkField = (
      fieldName: string,
      value: any,
      required: boolean = true,
      customMessage?: string
    ) => {
      const present = value !== null && value !== undefined && value !== '';

      fieldsChecked.push({ fieldName, required, present, value });

      if (required && !present) {
        const message = customMessage || `${fieldName}`;
        missingFields.push(message);
        this.addError(ValidationStage.REQUIRED_FIELDS, fieldName, message, 'error');
      } else if (present) {
        presentFields.push(fieldName);
      }
    };

    // Sheet A: Envelope Fields
    checkField('Interface Type', datevDoc.interfaceType);
    checkField('Interface Version', datevDoc.interfaceVersion);

    // Sheet B: Header Fields (REQUIRED)
    checkField('Document Type (Belegtyp)', datevDoc.documentType);
    checkField('Document Number (Belegnummer)', datevDoc.documentNumber);
    checkField('Document Date (Belegdatum)', datevDoc.documentDate);
    checkField('Gross Amount (BetragBrutto)', datevDoc.grossAmount);
    checkField('Net Amount (BetragNetto)', datevDoc.netAmount);
    checkField('Currency (Währung)', datevDoc.currency);

    // Check if gross amount is > 0 (skip for credit notes which are negative)
    const isCreditNote = datevDoc.documentDirection === 'creditNote';
    if (datevDoc.grossAmount !== undefined && datevDoc.grossAmount <= 0 && !isCreditNote) {
      missingFields.push('Gross Amount must be > 0');
      this.addError(ValidationStage.REQUIRED_FIELDS, 'grossAmount', 'Gross Amount must be > 0', 'error');
    }

    // For credit notes, check that gross amount is < 0
    if (isCreditNote && datevDoc.grossAmount !== undefined && datevDoc.grossAmount >= 0) {
      missingFields.push('Credit Note: Gross Amount must be < 0');
      this.addError(ValidationStage.REQUIRED_FIELDS, 'grossAmount', 'Credit Note: Gross Amount must be < 0', 'error');
    }

    // Check exchange rate if currency ≠ EUR (conditional)
    if (datevDoc.currency && datevDoc.currency !== 'EUR') {
      checkField('Exchange Rate (Wechselkurs)', datevDoc.exchangeRate, true, 'Exchange Rate required for non-EUR currency');
    }

    // Sheet C: Counterparty Fields (CONDITIONAL based on document direction)
    // INCOMING: Full supplier address required (name, street, postal, city, country)
    // OUTGOING: Only customer name+city required (our supplier = their customer)
    const isOutgoing = datevDoc.documentDirection === 'outgoing';

    if (isOutgoing) {
      // For outgoing invoices: Only name and city required
      checkField('Customer Name', datevDoc.supplier?.name);
      checkField('Customer City', datevDoc.supplier?.city);
      // Street, postal, country are optional for outgoing
      checkField('Customer Street (Straße)', datevDoc.supplier?.street, false);
      checkField('Customer Postal Code (PLZ)', datevDoc.supplier?.postalCode, false);
      checkField('Customer Country (Land)', datevDoc.supplier?.country, false);
    } else {
      // For incoming invoices: Full supplier address required
      checkField('Supplier Name', datevDoc.supplier?.name);
      checkField('Supplier Street (Straße)', datevDoc.supplier?.street);
      checkField('Supplier Postal Code (PLZ)', datevDoc.supplier?.postalCode);
      checkField('Supplier City (Ort)', datevDoc.supplier?.city);
      checkField('Supplier Country (Land)', datevDoc.supplier?.country);
    }

    // Sheet E: VAT Fields (REQUIRED)
    checkField('VAT Case (Steuerfall)', datevDoc.vatCase);
    checkField('Tax Rate (Steuersatz)', datevDoc.taxRate);

    // Sheet F: Line Items (REQUIRED)
    if (!datevDoc.lineItems || datevDoc.lineItems.length === 0) {
      missingFields.push('At least 1 line item required');
      this.addError(ValidationStage.REQUIRED_FIELDS, 'lineItems', 'At least 1 line item required', 'error');
    } else {
      // Validate each line item
      datevDoc.lineItems.forEach((line, idx) => {
        const linePrefix = `Line ${idx + 1}`;
        checkField(`${linePrefix}: Description (Beschreibung)`, line.description);
        checkField(`${linePrefix}: Unit Price (EinzelpreisNetto)`, line.unitPriceNet);
        checkField(`${linePrefix}: Net Amount (PositionsNetto)`, line.lineNetAmount);
        checkField(`${linePrefix}: VAT Rate (PositionsSteuersatz)`, line.vatRate);
        // BU Key is optional for outgoing invoices
        checkField(`${linePrefix}: BU Key (BU-Schlüssel)`, line.buKey, !isOutgoing);
      });
    }

    // Sheet K: Attachment (REQUIRED)
    checkField('Primary PDF (HauptbelegPDF)', datevDoc.primaryPDF);

    return {
      valid: missingFields.length === 0,
      missingFields,
      presentFields,
      fieldsChecked
    };
  }

  /**
   * Layer 2: Format Validation
   */
  private validateFormats(datevDoc: DatevDocument): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Date format: YYYY-MM-DD (ISO 8601)
    if (datevDoc.documentDate && !/^\d{4}-\d{2}-\d{2}$/.test(datevDoc.documentDate)) {
      errors.push(`Invalid document date format: ${datevDoc.documentDate}, must be YYYY-MM-DD`);
      this.addError(ValidationStage.FORMAT_VALIDATION, 'documentDate', `Invalid date format: ${datevDoc.documentDate}`, 'error');
    }

    if (datevDoc.serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(datevDoc.serviceDate)) {
      errors.push(`Invalid service date format: ${datevDoc.serviceDate}, must be YYYY-MM-DD`);
      this.addError(ValidationStage.FORMAT_VALIDATION, 'serviceDate', `Invalid date format: ${datevDoc.serviceDate}`, 'error');
    }

    // Postal Code: 5 digits (German format)
    if (datevDoc.supplier?.postalCode && !validatePostalCode(datevDoc.supplier.postalCode)) {
      errors.push(`Invalid postal code: ${datevDoc.supplier.postalCode}, must be 5 digits`);
      this.addError(ValidationStage.FORMAT_VALIDATION, 'supplier.postalCode', `Invalid postal code format`, 'error');
    }

    // Country code: ISO 3166-1 Alpha-2 (2 letters)
    if (datevDoc.supplier?.country && !validateCountryCode(datevDoc.supplier.country)) {
      errors.push(`Invalid country code: ${datevDoc.supplier.country}, must be 2-letter ISO code (e.g., DE, FR)`);
      this.addError(ValidationStage.FORMAT_VALIDATION, 'supplier.country', `Invalid country code format`, 'error');
    }

    // VAT ID format validation for EU countries
    if (datevDoc.supplier?.vatId) {
      const vatId = datevDoc.supplier.vatId.trim().replace(/[\s.-]/g, ''); // Remove spaces, dots, hyphens

      // EU VAT ID format patterns by country
      const vatPatterns: { [key: string]: { pattern: RegExp; description: string } } = {
        'AT': { pattern: /^ATU\d{8}$/, description: 'ATU + 8 digits' },
        'BE': { pattern: /^BE[0-1]\d{9}$/, description: 'BE + 10 digits' },
        'BG': { pattern: /^BG\d{9,10}$/, description: 'BG + 9-10 digits' },
        'HR': { pattern: /^HR\d{11}$/, description: 'HR + 11 digits' },
        'CY': { pattern: /^CY\d{8}[A-Z]$/, description: 'CY + 8 digits + 1 letter' },
        'CZ': { pattern: /^CZ\d{8,10}$/, description: 'CZ + 8-10 digits' },
        'DE': { pattern: /^DE\d{9}$/, description: 'DE + 9 digits' },
        'DK': { pattern: /^DK\d{8}$/, description: 'DK + 8 digits' },
        'EE': { pattern: /^EE\d{9}$/, description: 'EE + 9 digits' },
        'EL': { pattern: /^EL\d{9}$/, description: 'EL + 9 digits' },
        'GR': { pattern: /^GR\d{9}$/, description: 'GR + 9 digits' },
        'ES': { pattern: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, description: 'ES + alphanumeric + 7 digits + alphanumeric' },
        'FI': { pattern: /^FI\d{8}$/, description: 'FI + 8 digits' },
        'FR': { pattern: /^FR[A-Z0-9]{2}\d{9}$/, description: 'FR + 2 alphanumeric + 9 digits' },
        'GB': { pattern: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/, description: 'GB + 9 or 12 digits, or GD/HA + 3 digits' },
        'HU': { pattern: /^HU\d{8}$/, description: 'HU + 8 digits' },
        'IE': { pattern: /^IE\d[A-Z0-9]\d{5}[A-Z]$/, description: 'IE + digit + alphanumeric + 5 digits + letter' },
        'IT': { pattern: /^IT\d{11}$/, description: 'IT + 11 digits' },
        'LT': { pattern: /^LT(\d{9}|\d{12})$/, description: 'LT + 9 or 12 digits' },
        'LU': { pattern: /^LU\d{8}$/, description: 'LU + 8 digits' },
        'LV': { pattern: /^LV\d{11}$/, description: 'LV + 11 digits' },
        'MT': { pattern: /^MT\d{8}$/, description: 'MT + 8 digits' },
        'NL': { pattern: /^NL\d{9}B\d{2}$/, description: 'NL + 9 digits + B + 2 digits' },
        'PL': { pattern: /^PL\d{10}$/, description: 'PL + 10 digits' },
        'PT': { pattern: /^PT\d{9}$/, description: 'PT + 9 digits' },
        'RO': { pattern: /^RO\d{2,10}$/, description: 'RO + 2-10 digits' },
        'SE': { pattern: /^SE\d{12}$/, description: 'SE + 12 digits' },
        'SI': { pattern: /^SI\d{8}$/, description: 'SI + 8 digits' },
        'SK': { pattern: /^SK\d{10}$/, description: 'SK + 10 digits' }
      };

      // Extract country code (first 2 letters)
      const countryCode = vatId.substring(0, 2).toUpperCase();

      // Check if country pattern exists and validate
      if (vatPatterns[countryCode]) {
        const { pattern, description } = vatPatterns[countryCode];
        if (!pattern.test(vatId)) {
          errors.push(
            `Invalid ${countryCode} VAT ID format: ${datevDoc.supplier.vatId}, must be ${description} (e.g., ${this.getVatExample(countryCode)})`
          );
          this.addError(ValidationStage.FORMAT_VALIDATION, 'supplier.vatId', `Invalid VAT ID format for ${countryCode}`, 'error');
        } else if (!isTestMode()) {
          // PROD Mode: Perform algorithmic check digit validation for VAT ID
          if (!VATValidationService.validateVATNumber(datevDoc.supplier.vatId)) {
            errors.push(
              `Invalid ${countryCode} VAT ID: ${datevDoc.supplier.vatId}, failed algorithmic check digit validation (PROD mode)`
            );
            this.addError(ValidationStage.FORMAT_VALIDATION, 'supplier.vatId', `Invalid VAT ID - check digit validation failed (PROD mode)`, 'error');
          }
        }
      } else {
        // For non-EU or unknown countries, check basic format (2 letters + alphanumeric)
        if (!/^[A-Z]{2}[A-Z0-9]+$/.test(vatId)) {
          errors.push(
            `Invalid VAT ID format: ${datevDoc.supplier.vatId}, must start with 2-letter country code followed by alphanumeric characters`
          );
          this.addError(ValidationStage.FORMAT_VALIDATION, 'supplier.vatId', `Invalid VAT ID format`, 'error');
        }
      }
    }

    // Currency: ISO 4217 (3 letters)
    if (datevDoc.currency && !/^[A-Z]{3}$/.test(datevDoc.currency)) {
      errors.push(`Invalid currency code: ${datevDoc.currency}, must be 3-letter ISO code (e.g., EUR, USD)`);
      this.addError(ValidationStage.FORMAT_VALIDATION, 'currency', `Invalid currency format`, 'error');
    }

    // BU Keys: Validate each line item has valid BU key
    if (datevDoc.lineItems) {
      const validBUKeys = ['0', '1', '2', '3', '8', '9', '18', '19', '91', '92', '94', '95'];
      datevDoc.lineItems.forEach((line, idx) => {
        if (!validBUKeys.includes(line.buKey)) {
          errors.push(
            `Line ${idx + 1}: Invalid BU Key '${line.buKey}', must be one of: ${validBUKeys.join(', ')}`
          );
          this.addError(ValidationStage.FORMAT_VALIDATION, `lineItems[${idx}].buKey`, `Invalid BU Key`, 'error');
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Layer 3: Business Rules Validation (Sheet L from DATEV spec)
   * Now includes dual line item sum validation strategy
   */
  private validateBusinessRules(datevDoc: DatevDocument): {
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
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const checks = {
      totalsMatch: true,
      lineItemsSum: true,
      lineItemSumDetails: undefined as LineItemSumValidation | undefined,
      vatSum: true,
      buKeyConsistency: true,
      igeRcVatZero: true,
      euVatIdsPresent: true
    };

    // Helper for safe toFixed
    const safeToFixed = (val: number | undefined | null, decimals: number = 2): string => {
      return typeof val === 'number' && !isNaN(val) ? val.toFixed(decimals) : '0.00';
    };

    // Rule 1: Net + VAT = Gross (±0.02 tolerance)
    const totalsValidation = validateTotals(
      datevDoc.netAmount,
      datevDoc.totalTax,
      datevDoc.grossAmount,
      DATEV_CONFIG.allowedGrossTolerance
    );

    if (!totalsValidation.valid) {
      checks.totalsMatch = false;
      errors.push(
        `Totals mismatch: Net (${safeToFixed(datevDoc.netAmount)}) + VAT (${safeToFixed(datevDoc.totalTax)}) ` +
        `= ${safeToFixed(totalsValidation.calculatedGross)}, but Gross = ${safeToFixed(datevDoc.grossAmount)} ` +
        `(difference: ${safeToFixed(totalsValidation.difference)})`
      );
      this.addError(ValidationStage.BUSINESS_RULES, 'totals', 'Totals mismatch', 'error');
    }

    // Rule 2: Dual Line Item Sum Validation (NEW)
    // Try multiple strategies: net-based, gross-based, total-based
    if (datevDoc.lineItems && datevDoc.lineItems.length > 0) {
      const lineItemSumResult = this.validateLineItemSums(datevDoc);
      checks.lineItemSumDetails = lineItemSumResult;
      checks.lineItemsSum = lineItemSumResult.valid;

      if (!lineItemSumResult.valid) {
        // Line item sum mismatch is a WARNING, not error (allows export to continue)
        warnings.push(
          `Line items sum check: None of the validation strategies matched. ` +
          `Net sum (${safeToFixed(lineItemSumResult.netSum)}) vs Header Net (${safeToFixed(lineItemSumResult.headerNet)}), ` +
          `Gross sum (${safeToFixed(lineItemSumResult.grossSum)}) vs Header Gross (${safeToFixed(lineItemSumResult.headerGross)}). ` +
          `Export will continue with header values.`
        );
        this.addError(ValidationStage.BUSINESS_RULES, 'lineItemsSum', 'Line items sum mismatch (using header values)', 'warning');
      }

      // Rule 3: Sum of line VAT amounts = header VAT amount
      const lineVATSum = datevDoc.lineItems.reduce((sum, line) => sum + (line.lineTaxAmount || 0), 0);
      const vatDifference = Math.abs(lineVATSum - datevDoc.totalTax);

      if (vatDifference > DATEV_CONFIG.allowedGrossTolerance) {
        checks.vatSum = false;
        // VAT sum mismatch is also a warning (due to rounding in different invoice formats)
        warnings.push(
          `Line items VAT sum (${safeToFixed(lineVATSum)}) does not match header VAT amount (${safeToFixed(datevDoc.totalTax)}), ` +
          `difference: ${safeToFixed(vatDifference)}. Using header values.`
        );
        this.addError(ValidationStage.BUSINESS_RULES, 'vatSum', 'VAT sum mismatch', 'warning');
      }

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
      checks
    };
  }

  /**
   * Dual Line Item Sum Validation
   * 
   * Tries multiple strategies to match line items to header totals:
   * 1. Net-based: Sum(lineNetAmount) ≈ headerNet (VAT excluded from line items)
   * 2. Gross-based: Sum(lineNetAmount + lineTaxAmount) ≈ headerGross (VAT included)
   * 3. Total-based: Sum(lineGrossAmount) ≈ headerGross (line totals are gross amounts)
   * 
   * Returns valid=true if ANY strategy matches within tolerance.
   */
  private validateLineItemSums(datevDoc: DatevDocument): LineItemSumValidation {
    const tolerance = DATEV_CONFIG.allowedGrossTolerance;
    const lines = datevDoc.lineItems || [];

    // Calculate sums using different strategies
    const netSum = lines.reduce((sum, line) => sum + (line.lineNetAmount || 0), 0);
    const grossSum = lines.reduce((sum, line) => {
      const net = line.lineNetAmount || 0;
      const tax = line.lineTaxAmount || 0;
      return sum + net + tax;
    }, 0);
    const totalSum = lines.reduce((sum, line) => {
      // lineGrossAmount might be the gross value, or we calculate from net + tax
      return sum + (line.lineGrossAmount || (line.lineNetAmount || 0) + (line.lineTaxAmount || 0));
    }, 0);

    const headerNet = datevDoc.netAmount || 0;
    const headerGross = datevDoc.grossAmount || 0;

    // Calculate differences
    const netDifference = Math.abs(netSum - headerNet);
    const grossDifference = Math.abs(grossSum - headerGross);
    const totalDifference = Math.abs(totalSum - headerGross);

    // Strategy 1: Net-based (line items contain net amounts, VAT is separate)
    if (netDifference <= tolerance) {
      return {
        valid: true,
        strategy: 'net-based',
        netSum,
        grossSum,
        totalSum,
        headerNet,
        headerGross,
        netDifference,
        grossDifference,
        errors: []
      };
    }

    // Strategy 2: Gross-based (line items contain net + calculated VAT)
    if (grossDifference <= tolerance) {
      return {
        valid: true,
        strategy: 'gross-based',
        netSum,
        grossSum,
        totalSum,
        headerNet,
        headerGross,
        netDifference,
        grossDifference,
        errors: []
      };
    }

    // Strategy 3: Total-based (lineGrossAmount field contains gross amounts)
    if (totalDifference <= tolerance) {
      return {
        valid: true,
        strategy: 'total-based',
        netSum,
        grossSum,
        totalSum,
        headerNet,
        headerGross,
        netDifference,
        grossDifference,
        errors: []
      };
    }

    // None of the strategies matched - this is a WARNING case
    return {
      valid: false,
      strategy: 'none',
      netSum,
      grossSum,
      totalSum,
      headerNet,
      headerGross,
      netDifference,
      grossDifference,
      errors: [
        `Line item sum validation failed: ` +
        `Net strategy diff: ${netDifference.toFixed(2)}, ` +
        `Gross strategy diff: ${grossDifference.toFixed(2)}, ` +
        `Total strategy diff: ${totalDifference.toFixed(2)}`
      ]
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
      severity
    });
  }

  /**
   * Get example VAT ID for a given country code
   */
  private getVatExample(countryCode: string): string {
    const examples: { [key: string]: string } = {
      'AT': 'ATU12345678',
      'BE': 'BE0123456789',
      'BG': 'BG123456789',
      'HR': 'HR12345678901',
      'CY': 'CY12345678A',
      'CZ': 'CZ12345678',
      'DE': 'DE123456789',
      'DK': 'DK12345678',
      'EE': 'EE123456789',
      'EL': 'EL123456789',
      'GR': 'GR123456789',
      'ES': 'ESX1234567X',
      'FI': 'FI12345678',
      'FR': 'FRXX123456789',
      'GB': 'GB123456789',
      'HU': 'HU12345678',
      'IE': 'IE1A12345A',
      'IT': 'IT12345678901',
      'LT': 'LT123456789',
      'LU': 'LU12345678',
      'LV': 'LV12345678901',
      'MT': 'MT12345678',
      'NL': 'NL123456789B01',
      'PL': 'PL1234567890',
      'PT': 'PT123456789',
      'RO': 'RO1234567890',
      'SE': 'SE123456789012',
      'SI': 'SI12345678',
      'SK': 'SK1234567890'
    };
    return examples[countryCode] || `${countryCode}123456789`;
  }

  /**
   * Quick validation check - returns only valid/invalid with error list
   */
  public quickValidate(datevDoc: DatevDocument): ValidationResult {
    const fullReport = this.validate(datevDoc);
    return fullReport.overall;
  }
}
