/**
 * DATEV Calculations Utility
 * Auto-calculation helpers for v6.0 fields
 */

import { LineItem } from '../models/DatevDocument.interface';

export interface TaxLine {
  rate: number;
  type: string; // VST, UST
  taxableAmount: number;
  taxAmount: number;
  taxKey: number;
}

/**
 * Calculate fiscal year from invoice date
 * @param date Invoice date in YYYY-MM-DD format
 * @returns Fiscal year as number
 */
export function calculateFiscalYear(date: string): number {
  return new Date(date).getFullYear();
}

/**
 * Calculate fiscal year start (January 1st)
 * @param date Invoice date in YYYY-MM-DD format
 * @returns Fiscal year start date in YYYY-MM-DD format
 */
export function calculateFiscalYearStart(date: string): string {
  const year = new Date(date).getFullYear();
  return `${year}-01-01`;
}

/**
 * Calculate period start (first day of invoice month)
 * @param date Invoice date in YYYY-MM-DD format
 * @returns Period start date in YYYY-MM-DD format
 */
export function calculatePeriodStart(date: string): string {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${month}-01`;
}

/**
 * Calculate period end (last day of invoice month)
 * @param date Invoice date in YYYY-MM-DD format
 * @returns Period end date in YYYY-MM-DD format
 */
export function calculatePeriodEnd(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthStr = String(month + 1).padStart(2, '0');
  return `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Generate tax lines from line items
 * Groups line items by tax rate and creates tax breakdown
 * @param lineItems Array of line items
 * @returns Array of tax lines
 */
export function generateTaxLines(lineItems: LineItem[]): TaxLine[] {
  if (!lineItems || lineItems.length === 0) {
    return [];
  }

  // Group by tax rate
  const taxMap = new Map<number, { taxableAmount: number; taxAmount: number; taxKey: string }>();

  lineItems.forEach(item => {
    const key = item.vatRate;
    const existing = taxMap.get(key) || {
      taxableAmount: 0,
      taxAmount: 0,
      taxKey: item.buKey
    };

    existing.taxableAmount += item.lineNetAmount;
    existing.taxAmount += item.lineTaxAmount || 0;

    taxMap.set(key, existing);
  });

  // Convert to TaxLine array
  return Array.from(taxMap.entries()).map(([rate, data]) => ({
    rate,
    type: 'VST', // Vorsteuer (input tax) for incoming invoices
    taxableAmount: data.taxableAmount,
    taxAmount: data.taxAmount,
    taxKey: Number(data.taxKey)
  }));
}

/**
 * Extract skonto (cash discount) from payment terms text
 * Matches patterns like "2% 14 Tage" or "14 Tage 2% Skonto"
 * @param paymentTermsText Payment terms text from invoice
 * @returns Skonto object with percent and days, or null if not found
 */
export function extractSkonto(paymentTermsText: string): { percent: number; days: number } | null {
  if (!paymentTermsText) {
    return null;
  }

  // Match patterns:
  // - "2% 14 Tage"
  // - "14 Tage 2% Skonto"
  // - "2 % bei Zahlung innerhalb 14 Tagen"
  const match = paymentTermsText.match(
    /(\d+)\s*%.*?(\d+)\s*(Tag|Days?)|(\d+)\s*(Tag|Days?).*?(\d+)\s*%/i
  );

  if (match) {
    const percent = Number(match[1] || match[6]);
    const days = Number(match[2] || match[4]);

    // Sanity check
    if (percent > 0 && percent < 100 && days > 0 && days < 365) {
      return { percent, days };
    }
  }

  return null;
}

/**
 * Calculate payment deadline from invoice date and due date
 * @param invoiceDate Invoice date in YYYY-MM-DD format
 * @param dueDate Due date in YYYY-MM-DD format
 * @returns Payment deadline date in YYYY-MM-DD format
 */
export function calculatePaymentDeadline(invoiceDate: string, dueDate?: string): string | undefined {
  if (!dueDate) {
    return undefined;
  }

  // If due date is provided, use it as payment deadline
  return dueDate;
}

/**
 * Calculate gross amount from net amount and tax amount
 * @param netAmount Net amount
 * @param taxAmount Tax amount
 * @returns Gross amount (net + tax)
 */
export function calculateGrossAmount(netAmount: number, taxAmount: number): number {
  return netAmount + taxAmount;
}
