/**
 * Number Formatter Utility
 * Handles German number formats and conversions
 */

/**
 * Parse German number format to JavaScript number
 * Examples:
 *   "1.234,56" → 1234.56
 *   "1234,56" → 1234.56
 *   "1,234.56" → 1234.56
 *   1234.56 → 1234.56
 */
export function parseGermanNumber(value: any): number {
  // If already a number, return it
  if (typeof value === 'number') {
    return value;
  }

  // If null or undefined, return 0
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const strValue = String(value).trim();

  // If empty string, return 0
  if (strValue === '') {
    return 0;
  }

  // Detect German format (comma is decimal separator, period is thousands separator)
  // German: 1.234,56 or 1234,56
  // International: 1,234.56 or 1234.56

  // Count commas and periods
  const commaCount = (strValue.match(/,/g) || []).length;
  const periodCount = (strValue.match(/\./g) || []).length;

  let cleaned: string;

  if (commaCount > 0 && periodCount > 0) {
    // Both present - check which one appears last
    const lastCommaIndex = strValue.lastIndexOf(',');
    const lastPeriodIndex = strValue.lastIndexOf('.');

    if (lastCommaIndex > lastPeriodIndex) {
      // German format: 1.234,56
      cleaned = strValue.replace(/\./g, '').replace(',', '.');
    } else {
      // International format: 1,234.56
      cleaned = strValue.replace(/,/g, '');
    }
  } else if (commaCount > 0) {
    // Only comma present
    if (commaCount === 1) {
      // Likely decimal separator: 1234,56 → 1234.56
      cleaned = strValue.replace(',', '.');
    } else {
      // Multiple commas - treat as thousands separator and remove them
      cleaned = strValue.replace(/,/g, '');
    }
  } else if (periodCount > 0) {
    // Only period present
    if (periodCount === 1) {
      // Check if it's likely a decimal separator or thousands separator
      const parts = strValue.split('.');
      if (parts[1] && parts[1].length <= 2) {
        // Likely decimal: 1234.56
        cleaned = strValue;
      } else {
        // Likely thousands: 1.234 → 1234
        cleaned = strValue.replace(/\./g, '');
      }
    } else {
      // Multiple periods - treat as thousands separator: 1.234.567 → 1234567
      cleaned = strValue.replace(/\./g, '');
    }
  } else {
    // No separators
    cleaned = strValue;
  }

  // Parse to float
  const result = parseFloat(cleaned);

  // Return 0 if NaN
  return isNaN(result) ? 0 : result;
}

/**
 * Format number to German format for display
 * Example: 1234.56 → "1.234,56"
 */
export function formatToGermanNumber(value: number, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0,00';
  }

  const fixedValue = value.toFixed(decimals);
  const [integerPart, decimalPart] = fixedValue.split('.');

  // Add thousands separators (periods)
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // Combine with comma as decimal separator
  return decimalPart ? `${formattedInteger},${decimalPart}` : formattedInteger;
}

/**
 * Round to 2 decimal places (for currency)
 */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Check if two currency values are equal within tolerance (±0.02)
 */
export function currencyEquals(value1: number, value2: number, tolerance: number = 0.02): boolean {
  return Math.abs(value1 - value2) <= tolerance;
}

/**
 * Calculate VAT amount from net amount and VAT rate
 */
export function calculateVAT(netAmount: number, vatRate: number): number {
  return roundCurrency(netAmount * (vatRate / 100));
}

/**
 * Calculate gross amount from net amount and VAT rate
 */
export function calculateGross(netAmount: number, vatRate: number): number {
  return roundCurrency(netAmount + calculateVAT(netAmount, vatRate));
}

/**
 * Calculate net amount from gross amount and VAT rate
 */
export function calculateNet(grossAmount: number, vatRate: number): number {
  return roundCurrency(grossAmount / (1 + (vatRate / 100)));
}

/**
 * Validate if totals are consistent: net + vat = gross (within tolerance)
 */
export function validateTotals(
  netAmount: number,
  vatAmount: number,
  grossAmount: number,
  tolerance: number = 0.02
): { valid: boolean; calculatedGross: number; difference: number } {
  const calculatedGross = roundCurrency(netAmount + vatAmount);
  const difference = Math.abs(calculatedGross - grossAmount);

  return {
    valid: difference <= tolerance,
    calculatedGross,
    difference
  };
}
