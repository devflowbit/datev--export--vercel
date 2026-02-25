/**
 * DATEV Configuration
 * Application-wide configuration and defaults
 */

import { DatevMode, ValidationModeConfig, getValidationModeConfig } from '../models/ValidationMode.interface';

export interface DatevAppConfig {
  // Interface defaults
  interfaceType: string;
  interfaceVersion: string;
  documentType: string;
  generatingSystem: string;

  // Company information (REQUIRED for EU transactions)
  companyVatId: string;
  defaultCurrency: string;
  defaultCreditorAccount: string;
  defaultOffsetAccount: string;

  // Validation settings
  confidenceThreshold: number;
  allowedGrossTolerance: number;

  // PDF generation settings
  pdfTimeout: number;
  maxPDFSizeBytes: number;

  // ZIP compression settings
  compressionLevel: number;

  // NEW v6.0 Configuration
  advisorNumber: string; // Consultant/advisor number (BeraterNr)
  clientNumber: string; // Client number (MandantNr)
  consultantNumber?: string; // Consultant number (same as advisor)
  clientID?: string; // Optional client DB ID
  systemVersion: string; // System version
  defaultVendorAccountNumber: string; // Default vendor account (99999)
  defaultCustomerAccountNumber: string; // Default customer account (69999)
  defaultInvoiceTypeCode: string; // Default invoice type ("invoice")
  defaultDocumentCategory: string; // Default category ("B2B")
  defaultPostingKey: string; // Default posting key ("40" for vendor invoices)
  defaultTaxType: string; // Default tax type ("VST" for input tax)

  // Webhook Configuration
  webhook: {
    timeoutMs: number; // Webhook request timeout in milliseconds
    maxRetries: number; // Maximum retry attempts for failed webhooks
    allowHttp: boolean; // Allow HTTP URLs (false for production, true for dev/testing)
    apiKey: string; // API key for webhook authentication (x-api-key header)
    adminApiKey: string; // Admin API key for App-Secret header (time-based SHA256 hash)
  };

  // Validation Mode Configuration
  datevMode: DatevMode; // 'test' or 'prod'
}

export const DATEV_CONFIG: DatevAppConfig = {
  // Interface defaults
  interfaceType: 'XML-Online',
  interfaceVersion: '1.0',
  documentType: 'Eingangsrechnung', // Incoming invoice
  generatingSystem: 'Flowbit Invoice System',

  // Company information
  // ⚠️ IMPORTANT: Configure your company's German VAT ID here
  companyVatId: process.env.COMPANY_VAT_ID || 'DE123456789',
  defaultCurrency: 'EUR',
  defaultCreditorAccount: '16000', // Standard creditor account in SKR03/04
  defaultOffsetAccount: '4910', // Common expense account (matches test data)

  // Validation settings
  confidenceThreshold: 0.5, // Minimum confidence for LLM fields
  allowedGrossTolerance: 0.02, // ±2 cents tolerance for totals

  // PDF settings
  pdfTimeout: 30000, // 30 seconds
  maxPDFSizeBytes: 10 * 1024 * 1024, // 10 MB

  // ZIP settings
  compressionLevel: 6, // Standard compression (0-9)

  // NEW v6.0 Configuration
  advisorNumber: '23433', // Consultant/advisor number
  clientNumber: '4605', // Client number
  consultantNumber: '23433', // Consultant number (same as advisor)
  clientID: undefined, // Optional client DB ID
  systemVersion: '1.0.0', // System version
  defaultVendorAccountNumber: '10000', // Default vendor account (valid range: 10000-69999)
  defaultCustomerAccountNumber: '70000', // Default customer account (valid range: 70000-99999)
  defaultInvoiceTypeCode: 'invoice', // Default invoice type
  defaultDocumentCategory: 'B2B', // Default category
  defaultPostingKey: '31', // Default posting key for vendor invoices with input tax
  defaultTaxType: 'VST', // Vorsteuer (input tax)

  // Webhook Configuration
  webhook: {
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '60000', 10),
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    allowHttp: process.env.WEBHOOK_ALLOW_HTTP === 'true',
    apiKey: process.env.API_KEY || '', // API key for x-api-key header in webhook requests
    adminApiKey: process.env.ADMIN_API_KEY || '' // Admin API key for App-Secret header (time-based SHA256)
  },

  // Validation Mode: 'test' (relaxed) or 'prod' (strict)
  // Set via DATEV_MODE environment variable
  datevMode: (process.env.DATEV_MODE as DatevMode) || 'test'
};

/**
 * Get the current validation mode configuration
 * @returns ValidationModeConfig based on DATEV_MODE environment variable
 */
export function getValidationMode(): ValidationModeConfig {
  return getValidationModeConfig(DATEV_CONFIG.datevMode);
}

/**
 * Check if running in test mode
 */
export function isTestMode(): boolean {
  return DATEV_CONFIG.datevMode === 'test';
}

/**
 * Check if running in production mode
 */
export function isProdMode(): boolean {
  return DATEV_CONFIG.datevMode === 'prod';
}

/**
 * Get configuration value
 */
export function getConfig<K extends keyof DatevAppConfig>(key: K): DatevAppConfig[K] {
  return DATEV_CONFIG[key];
}

/**
 * Update configuration (for testing)
 */
export function updateConfig(updates: Partial<DatevAppConfig>): void {
  Object.assign(DATEV_CONFIG, updates);
}

/**
 * Validate configuration
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check company VAT ID format
  if (!DATEV_CONFIG.companyVatId || !/^DE\d{9}$/.test(DATEV_CONFIG.companyVatId)) {
    errors.push(
      'Invalid company VAT ID in configuration. Must be in format: DE + 9 digits (e.g., DE123456789). ' +
      'Set COMPANY_VAT_ID environment variable.'
    );
  }

  // Check currency code
  if (!/^[A-Z]{3}$/.test(DATEV_CONFIG.defaultCurrency)) {
    errors.push('Invalid default currency code. Must be 3-letter ISO 4217 code (e.g., EUR).');
  }

  // Check tolerance
  if (DATEV_CONFIG.allowedGrossTolerance < 0 || DATEV_CONFIG.allowedGrossTolerance > 1) {
    errors.push('Invalid gross tolerance. Must be between 0 and 1.');
  }

  // Check vendor account number range (10000-69999)
  const vendorAccount = parseInt(DATEV_CONFIG.defaultVendorAccountNumber, 10);
  if (isNaN(vendorAccount) || vendorAccount < 10000 || vendorAccount > 69999) {
    errors.push('Invalid vendor account number. Must be in range 10000-69999.');
  }

  // Check customer account number range (70000-99999)
  const customerAccount = parseInt(DATEV_CONFIG.defaultCustomerAccountNumber, 10);
  if (isNaN(customerAccount) || customerAccount < 70000 || customerAccount > 99999) {
    errors.push('Invalid customer account number. Must be in range 70000-99999.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Default values for fallbacks
 */
export const DEFAULT_VALUES = {
  serviceDate: (invoiceDate: string) => invoiceDate, // Use invoice date as fallback
  supplierInternalId: (vatId: string) => vatId || undefined, // Use VAT ID as fallback, undefined if not available
  creditorAccount: DATEV_CONFIG.defaultCreditorAccount,
  offsetAccount: DATEV_CONFIG.defaultOffsetAccount,
  country: 'DE', // Default to Germany
  currency: 'EUR'
};
