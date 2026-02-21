/**
 * DATEV BU Keys Reference (Sheet M from Excel)
 * Business posting keys that drive VAT treatment logic
 */

export interface BUKeyInfo {
  code: string;
  name: string;
  vatRate: number;
  vatCase: string;
  description: string;
}

export const BU_KEYS: Record<string, BUKeyInfo> = {
  '9': {
    code: '9',
    name: 'Inland 19% Input VAT',
    vatRate: 19,
    vatCase: 'Inland19',
    description: 'Incoming invoice with 19% input VAT (domestic German supplier)'
  },
  '8': {
    code: '8',
    name: 'Inland 7% Input VAT',
    vatRate: 7,
    vatCase: 'Inland7',
    description: 'Incoming invoice with 7% input VAT (domestic German supplier)'
  },
  '19': {
    code: '19',
    name: 'Intra-EU Goods Acquisition 19%',
    vatRate: 19,
    vatCase: 'IGE19',
    description: 'Intra-EU goods acquisition with 19% VAT (supplier shows 0%, buyer self-assesses)'
  },
  '18': {
    code: '18',
    name: 'Intra-EU Goods Acquisition 7%',
    vatRate: 7,
    vatCase: 'IGE7',
    description: 'Intra-EU goods acquisition with 7% VAT (supplier shows 0%, buyer self-assesses)'
  },
  '94': {
    code: '94',
    name: 'Reverse Charge 19% (with input VAT deduction)',
    vatRate: 19,
    vatCase: 'RC19',
    description: 'Reverse charge services 19% with input VAT deduction right'
  },
  '91': {
    code: '91',
    name: 'Reverse Charge 7% (with input VAT deduction)',
    vatRate: 7,
    vatCase: 'RC7',
    description: 'Reverse charge services 7% with input VAT deduction right'
  },
  '95': {
    code: '95',
    name: 'Reverse Charge 19% (no input VAT deduction)',
    vatRate: 19,
    vatCase: 'RC19_NoDeduct',
    description: 'Reverse charge 19% without input VAT deduction right'
  },
  '92': {
    code: '92',
    name: 'Reverse Charge 7% (no input VAT deduction)',
    vatRate: 7,
    vatCase: 'RC7_NoDeduct',
    description: 'Reverse charge 7% without input VAT deduction right'
  },
  '3': {
    code: '3',
    name: 'Domestic Sales 19%',
    vatRate: 19,
    vatCase: 'Inland19',
    description: 'Outgoing invoice (sales) with 19% VAT'
  },
  '2': {
    code: '2',
    name: 'Domestic Sales 7%',
    vatRate: 7,
    vatCase: 'Inland7',
    description: 'Outgoing invoice (sales) with 7% VAT'
  },
  '1': {
    code: '1',
    name: 'Tax-Exempt',
    vatRate: 0,
    vatCase: 'steuerfrei',
    description: 'Tax-exempt sales or acquisitions'
  }
};

/**
 * Get BU key information
 */
export function getBUKeyInfo(buKey: string): BUKeyInfo | undefined {
  return BU_KEYS[buKey];
}

/**
 * Validate if BU key is valid
 */
export function isValidBUKey(buKey: string): boolean {
  return buKey in BU_KEYS;
}

/**
 * Get all valid BU key codes
 */
export function getValidBUKeyCodes(): string[] {
  return Object.keys(BU_KEYS);
}

/**
 * Validate if BU key matches the expected VAT rate
 */
export function validateBUKeyVATRate(buKey: string, vatRate: number): boolean {
  const buKeyInfo = getBUKeyInfo(buKey);
  if (!buKeyInfo) {
    return false;
  }
  return buKeyInfo.vatRate === vatRate;
}

/**
 * Check if BU key is for Intra-EU Goods Acquisition (IGE)
 */
export function isIGEKey(buKey: string): boolean {
  return buKey === '18' || buKey === '19';
}

/**
 * Check if BU key is for Reverse Charge (RC)
 */
export function isRCKey(buKey: string): boolean {
  return ['91', '92', '94', '95'].includes(buKey);
}

/**
 * Check if BU key requires 0% VAT on supplier document
 */
export function requiresZeroVATOnSupplierDoc(buKey: string): boolean {
  return isIGEKey(buKey) || isRCKey(buKey);
}

/**
 * EU Country codes
 */
export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

/**
 * Check if country is in EU
 */
export function isEUCountry(countryCode: string): boolean {
  return EU_COUNTRIES.includes(countryCode.toUpperCase());
}
