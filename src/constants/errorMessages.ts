/**
 * DATEV Error Messages Catalog
 * 
 * Bilingual (DE/EN) user-friendly error messages with suggestions.
 * Each error has a unique code for easy tracking and debugging.
 */

export type ErrorSeverity = 'error' | 'warning' | 'info';
export type SupportedLanguage = 'de' | 'en';

/**
 * Error message definition with bilingual support
 */
export interface ErrorMessageDefinition {
  code: string;
  severity: ErrorSeverity;
  category: 'input' | 'validation' | 'format' | 'business_rule' | 'system';
  messages: {
    en: {
      title: string;
      detail: string;
      suggestion: string;
    };
    de: {
      title: string;
      detail: string;
      suggestion: string;
    };
  };
}

/**
 * Bilingual error message content
 */
export interface BilingualErrorMessage {
  title: string;
  detail: string;
  suggestion: string;
}

/**
 * User-friendly error output with bilingual support
 */
export interface UserFriendlyError {
  code: string;
  field?: string;
  severity: ErrorSeverity;
  category: string;
  // Primary language messages (for backwards compatibility)
  title: string;
  detail: string;
  suggestion: string;
  // Bilingual messages
  messages: {
    en: BilingualErrorMessage;
    de: BilingualErrorMessage;
  };
  technicalMessage?: string;
}

/**
 * Error codes enum for type safety
 */
export enum ErrorCode {
  // Input Errors (1xx)
  MISSING_LLM_DATA = 'DATEV_100',
  MISSING_INVOICE_SECTION = 'DATEV_101',
  MISSING_VENDOR_SECTION = 'DATEV_102',
  MISSING_SUMMARY_SECTION = 'DATEV_103',
  MISSING_LINE_ITEMS = 'DATEV_104',

  // Required Field Errors (2xx)
  MISSING_INVOICE_NUMBER = 'DATEV_200',
  MISSING_INVOICE_DATE = 'DATEV_201',
  MISSING_SUPPLIER_NAME = 'DATEV_202',
  MISSING_SUPPLIER_STREET = 'DATEV_203',
  MISSING_SUPPLIER_POSTAL_CODE = 'DATEV_204',
  MISSING_SUPPLIER_CITY = 'DATEV_205',
  MISSING_SUPPLIER_COUNTRY = 'DATEV_206',
  MISSING_GROSS_AMOUNT = 'DATEV_207',
  MISSING_NET_AMOUNT = 'DATEV_208',
  MISSING_CURRENCY = 'DATEV_209',
  MISSING_VAT_CASE = 'DATEV_210',
  MISSING_TAX_RATE = 'DATEV_211',
  MISSING_PDF = 'DATEV_212',
  MISSING_EXCHANGE_RATE = 'DATEV_213',

  // Format Errors (3xx)
  INVALID_DATE_FORMAT = 'DATEV_300',
  INVALID_VAT_ID_FORMAT = 'DATEV_301',
  INVALID_POSTAL_CODE = 'DATEV_302',
  INVALID_COUNTRY_CODE = 'DATEV_303',
  INVALID_CURRENCY_CODE = 'DATEV_304',
  INVALID_BU_KEY = 'DATEV_305',

  // Business Rule Errors (4xx)
  TOTALS_MISMATCH = 'DATEV_400',
  LINE_ITEMS_SUM_MISMATCH = 'DATEV_401',
  VAT_SUM_MISMATCH = 'DATEV_402',
  BU_KEY_VAT_RATE_MISMATCH = 'DATEV_403',
  IGE_RC_NON_ZERO_VAT = 'DATEV_404',
  EU_MISSING_VAT_ID = 'DATEV_405',
  INVALID_GROSS_AMOUNT = 'DATEV_406',
  CREDIT_NOTE_POSITIVE_AMOUNT = 'DATEV_407',

  // System Errors (5xx)
  PDF_ACQUISITION_FAILED = 'DATEV_500',
  ZIP_PACKAGING_FAILED = 'DATEV_501',
  XML_GENERATION_FAILED = 'DATEV_502',
  UNEXPECTED_ERROR = 'DATEV_599',
}

/**
 * Complete error message catalog
 */
export const ERROR_MESSAGES: Record<ErrorCode, ErrorMessageDefinition> = {
  // === Input Errors (1xx) ===
  [ErrorCode.MISSING_LLM_DATA]: {
    code: ErrorCode.MISSING_LLM_DATA,
    severity: 'error',
    category: 'input',
    messages: {
      en: {
        title: 'Document data missing',
        detail: 'The document extraction data (llmData) is missing from the request.',
        suggestion: 'Ensure the document has been processed and extracted data is available.',
      },
      de: {
        title: 'Dokumentdaten fehlen',
        detail: 'Die extrahierten Dokumentdaten (llmData) fehlen in der Anfrage.',
        suggestion: 'Stellen Sie sicher, dass das Dokument verarbeitet wurde und Extraktionsdaten verfügbar sind.',
      },
    },
  },

  [ErrorCode.MISSING_INVOICE_SECTION]: {
    code: ErrorCode.MISSING_INVOICE_SECTION,
    severity: 'error',
    category: 'input',
    messages: {
      en: {
        title: 'Invoice information missing',
        detail: 'The invoice section could not be found in the extracted data.',
        suggestion: 'Check that the document contains invoice details (number, date).',
      },
      de: {
        title: 'Rechnungsinformationen fehlen',
        detail: 'Der Rechnungsabschnitt konnte in den extrahierten Daten nicht gefunden werden.',
        suggestion: 'Prüfen Sie, ob das Dokument Rechnungsdetails enthält (Nummer, Datum).',
      },
    },
  },

  [ErrorCode.MISSING_VENDOR_SECTION]: {
    code: ErrorCode.MISSING_VENDOR_SECTION,
    severity: 'error',
    category: 'input',
    messages: {
      en: {
        title: 'Vendor information missing',
        detail: 'The vendor/supplier section could not be found in the extracted data.',
        suggestion: 'Check that the document contains vendor information (name, address).',
      },
      de: {
        title: 'Lieferanteninformationen fehlen',
        detail: 'Der Lieferantenabschnitt konnte in den extrahierten Daten nicht gefunden werden.',
        suggestion: 'Prüfen Sie, ob das Dokument Lieferanteninformationen enthält (Name, Adresse).',
      },
    },
  },

  [ErrorCode.MISSING_SUMMARY_SECTION]: {
    code: ErrorCode.MISSING_SUMMARY_SECTION,
    severity: 'error',
    category: 'input',
    messages: {
      en: {
        title: 'Invoice totals missing',
        detail: 'The summary section with invoice totals could not be found.',
        suggestion: 'Check that the document contains total amounts (gross, net, VAT).',
      },
      de: {
        title: 'Rechnungssummen fehlen',
        detail: 'Der Zusammenfassungsabschnitt mit den Rechnungssummen konnte nicht gefunden werden.',
        suggestion: 'Prüfen Sie, ob das Dokument Gesamtbeträge enthält (Brutto, Netto, MwSt).',
      },
    },
  },

  [ErrorCode.MISSING_LINE_ITEMS]: {
    code: ErrorCode.MISSING_LINE_ITEMS,
    severity: 'error',
    category: 'input',
    messages: {
      en: {
        title: 'Line items missing',
        detail: 'At least one invoice line item is required for DATEV export.',
        suggestion: 'Ensure the document contains at least one line item with description and amount.',
      },
      de: {
        title: 'Rechnungspositionen fehlen',
        detail: 'Für den DATEV-Export ist mindestens eine Rechnungsposition erforderlich.',
        suggestion: 'Stellen Sie sicher, dass das Dokument mindestens eine Position mit Beschreibung und Betrag enthält.',
      },
    },
  },

  // === Required Field Errors (2xx) ===
  [ErrorCode.MISSING_INVOICE_NUMBER]: {
    code: ErrorCode.MISSING_INVOICE_NUMBER,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Invoice number missing',
        detail: 'The invoice number (Belegnummer) is required for DATEV export.',
        suggestion: 'Locate the invoice number on the document and ensure it was extracted correctly.',
      },
      de: {
        title: 'Rechnungsnummer fehlt',
        detail: 'Die Rechnungsnummer (Belegnummer) ist für den DATEV-Export erforderlich.',
        suggestion: 'Suchen Sie die Rechnungsnummer auf dem Dokument und stellen Sie sicher, dass sie korrekt extrahiert wurde.',
      },
    },
  },

  [ErrorCode.MISSING_INVOICE_DATE]: {
    code: ErrorCode.MISSING_INVOICE_DATE,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Invoice date missing',
        detail: 'The invoice date (Belegdatum) is required for DATEV export.',
        suggestion: 'Locate the invoice date on the document. Format should be YYYY-MM-DD.',
      },
      de: {
        title: 'Rechnungsdatum fehlt',
        detail: 'Das Rechnungsdatum (Belegdatum) ist für den DATEV-Export erforderlich.',
        suggestion: 'Suchen Sie das Rechnungsdatum auf dem Dokument. Format sollte JJJJ-MM-TT sein.',
      },
    },
  },

  [ErrorCode.MISSING_SUPPLIER_NAME]: {
    code: ErrorCode.MISSING_SUPPLIER_NAME,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Supplier name missing',
        detail: 'The supplier/vendor name is required for DATEV export.',
        suggestion: 'Ensure the supplier name is visible on the invoice and was extracted.',
      },
      de: {
        title: 'Lieferantenname fehlt',
        detail: 'Der Lieferantenname ist für den DATEV-Export erforderlich.',
        suggestion: 'Stellen Sie sicher, dass der Lieferantenname auf der Rechnung sichtbar und extrahiert wurde.',
      },
    },
  },

  [ErrorCode.MISSING_SUPPLIER_STREET]: {
    code: ErrorCode.MISSING_SUPPLIER_STREET,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Supplier street address missing',
        detail: 'The supplier street address is required for incoming invoices.',
        suggestion: 'Check that the supplier address on the document includes street information.',
      },
      de: {
        title: 'Lieferantenstraße fehlt',
        detail: 'Die Straßenadresse des Lieferanten ist für Eingangsrechnungen erforderlich.',
        suggestion: 'Prüfen Sie, ob die Lieferantenadresse auf dem Dokument Straßeninformationen enthält.',
      },
    },
  },

  [ErrorCode.MISSING_SUPPLIER_POSTAL_CODE]: {
    code: ErrorCode.MISSING_SUPPLIER_POSTAL_CODE,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Supplier postal code missing',
        detail: 'The supplier postal code (PLZ) is required for incoming invoices.',
        suggestion: 'Check that the supplier address includes a postal code (5 digits for Germany).',
      },
      de: {
        title: 'Lieferanten-PLZ fehlt',
        detail: 'Die Postleitzahl des Lieferanten ist für Eingangsrechnungen erforderlich.',
        suggestion: 'Prüfen Sie, ob die Lieferantenadresse eine Postleitzahl enthält (5 Ziffern für Deutschland).',
      },
    },
  },

  [ErrorCode.MISSING_SUPPLIER_CITY]: {
    code: ErrorCode.MISSING_SUPPLIER_CITY,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Supplier city missing',
        detail: 'The supplier city (Ort) is required for incoming invoices.',
        suggestion: 'Check that the supplier address includes a city name.',
      },
      de: {
        title: 'Lieferantenort fehlt',
        detail: 'Der Ort des Lieferanten ist für Eingangsrechnungen erforderlich.',
        suggestion: 'Prüfen Sie, ob die Lieferantenadresse einen Ortsnamen enthält.',
      },
    },
  },

  [ErrorCode.MISSING_SUPPLIER_COUNTRY]: {
    code: ErrorCode.MISSING_SUPPLIER_COUNTRY,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Supplier country missing',
        detail: 'The supplier country code is required for incoming invoices.',
        suggestion: 'Ensure the country is specified (2-letter ISO code, e.g., DE, AT, FR).',
      },
      de: {
        title: 'Lieferantenland fehlt',
        detail: 'Der Ländercode des Lieferanten ist für Eingangsrechnungen erforderlich.',
        suggestion: 'Stellen Sie sicher, dass das Land angegeben ist (2-Buchstaben ISO-Code, z.B. DE, AT, FR).',
      },
    },
  },

  [ErrorCode.MISSING_GROSS_AMOUNT]: {
    code: ErrorCode.MISSING_GROSS_AMOUNT,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Gross amount missing',
        detail: 'The gross amount (Bruttobetrag) is required for DATEV export.',
        suggestion: 'Locate the total/gross amount on the invoice including VAT.',
      },
      de: {
        title: 'Bruttobetrag fehlt',
        detail: 'Der Bruttobetrag ist für den DATEV-Export erforderlich.',
        suggestion: 'Suchen Sie den Gesamtbetrag inkl. MwSt auf der Rechnung.',
      },
    },
  },

  [ErrorCode.MISSING_NET_AMOUNT]: {
    code: ErrorCode.MISSING_NET_AMOUNT,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Net amount missing',
        detail: 'The net amount (Nettobetrag) is required for DATEV export.',
        suggestion: 'Locate the net amount on the invoice (before VAT).',
      },
      de: {
        title: 'Nettobetrag fehlt',
        detail: 'Der Nettobetrag ist für den DATEV-Export erforderlich.',
        suggestion: 'Suchen Sie den Nettobetrag auf der Rechnung (vor MwSt).',
      },
    },
  },

  [ErrorCode.MISSING_CURRENCY]: {
    code: ErrorCode.MISSING_CURRENCY,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Currency missing',
        detail: 'The currency code is required for DATEV export.',
        suggestion: 'Ensure the currency is specified (3-letter code, e.g., EUR, USD).',
      },
      de: {
        title: 'Währung fehlt',
        detail: 'Der Währungscode ist für den DATEV-Export erforderlich.',
        suggestion: 'Stellen Sie sicher, dass die Währung angegeben ist (3-Buchstaben-Code, z.B. EUR, USD).',
      },
    },
  },

  [ErrorCode.MISSING_VAT_CASE]: {
    code: ErrorCode.MISSING_VAT_CASE,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'VAT case missing',
        detail: 'The VAT case (Steuerfall) could not be determined.',
        suggestion: 'Ensure line items have valid BU keys for VAT determination.',
      },
      de: {
        title: 'Steuerfall fehlt',
        detail: 'Der Steuerfall konnte nicht ermittelt werden.',
        suggestion: 'Stellen Sie sicher, dass die Positionen gültige BU-Schlüssel für die MwSt-Ermittlung haben.',
      },
    },
  },

  [ErrorCode.MISSING_TAX_RATE]: {
    code: ErrorCode.MISSING_TAX_RATE,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Tax rate missing',
        detail: 'The tax rate (Steuersatz) is required for DATEV export.',
        suggestion: 'Ensure at least one line item has a valid VAT rate (0%, 7%, or 19%).',
      },
      de: {
        title: 'Steuersatz fehlt',
        detail: 'Der Steuersatz ist für den DATEV-Export erforderlich.',
        suggestion: 'Stellen Sie sicher, dass mindestens eine Position einen gültigen MwSt-Satz hat (0%, 7% oder 19%).',
      },
    },
  },

  [ErrorCode.MISSING_PDF]: {
    code: ErrorCode.MISSING_PDF,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'PDF document missing',
        detail: 'The PDF document is required for DATEV export as primary attachment.',
        suggestion: 'Ensure the document PDF is available and accessible.',
      },
      de: {
        title: 'PDF-Dokument fehlt',
        detail: 'Das PDF-Dokument ist als Hauptbeleg für den DATEV-Export erforderlich.',
        suggestion: 'Stellen Sie sicher, dass das PDF-Dokument verfügbar und zugänglich ist.',
      },
    },
  },

  [ErrorCode.MISSING_EXCHANGE_RATE]: {
    code: ErrorCode.MISSING_EXCHANGE_RATE,
    severity: 'error',
    category: 'validation',
    messages: {
      en: {
        title: 'Exchange rate required',
        detail: 'An exchange rate is required for non-EUR currencies.',
        suggestion: 'Provide the exchange rate to EUR for the invoice currency.',
      },
      de: {
        title: 'Wechselkurs erforderlich',
        detail: 'Für Nicht-EUR-Währungen ist ein Wechselkurs erforderlich.',
        suggestion: 'Geben Sie den Wechselkurs zu EUR für die Rechnungswährung an.',
      },
    },
  },

  // === Format Errors (3xx) ===
  [ErrorCode.INVALID_DATE_FORMAT]: {
    code: ErrorCode.INVALID_DATE_FORMAT,
    severity: 'error',
    category: 'format',
    messages: {
      en: {
        title: 'Invalid date format',
        detail: 'The date format is not valid. Expected format: YYYY-MM-DD.',
        suggestion: 'Ensure dates are in ISO format (e.g., 2024-12-25).',
      },
      de: {
        title: 'Ungültiges Datumsformat',
        detail: 'Das Datumsformat ist ungültig. Erwartetes Format: JJJJ-MM-TT.',
        suggestion: 'Stellen Sie sicher, dass Daten im ISO-Format sind (z.B. 2024-12-25).',
      },
    },
  },

  [ErrorCode.INVALID_VAT_ID_FORMAT]: {
    code: ErrorCode.INVALID_VAT_ID_FORMAT,
    severity: 'error',
    category: 'format',
    messages: {
      en: {
        title: 'Invalid VAT ID format',
        detail: 'The VAT ID (USt-IdNr) format is not valid for the specified country.',
        suggestion: 'German VAT IDs must be: DE + 9 digits (e.g., DE123456789).',
      },
      de: {
        title: 'Ungültiges USt-IdNr Format',
        detail: 'Das Format der USt-IdNr ist für das angegebene Land ungültig.',
        suggestion: 'Deutsche USt-IdNr müssen sein: DE + 9 Ziffern (z.B. DE123456789).',
      },
    },
  },

  [ErrorCode.INVALID_POSTAL_CODE]: {
    code: ErrorCode.INVALID_POSTAL_CODE,
    severity: 'error',
    category: 'format',
    messages: {
      en: {
        title: 'Invalid postal code',
        detail: 'The postal code format is not valid (German: 5 digits).',
        suggestion: 'Ensure German postal codes are exactly 5 digits (e.g., 80331).',
      },
      de: {
        title: 'Ungültige Postleitzahl',
        detail: 'Das PLZ-Format ist ungültig (Deutschland: 5 Ziffern).',
        suggestion: 'Deutsche Postleitzahlen müssen genau 5 Ziffern haben (z.B. 80331).',
      },
    },
  },

  [ErrorCode.INVALID_COUNTRY_CODE]: {
    code: ErrorCode.INVALID_COUNTRY_CODE,
    severity: 'error',
    category: 'format',
    messages: {
      en: {
        title: 'Invalid country code',
        detail: 'The country code must be a 2-letter ISO 3166-1 Alpha-2 code.',
        suggestion: 'Use valid country codes: DE (Germany), AT (Austria), FR (France), etc.',
      },
      de: {
        title: 'Ungültiger Ländercode',
        detail: 'Der Ländercode muss ein 2-Buchstaben ISO 3166-1 Alpha-2 Code sein.',
        suggestion: 'Verwenden Sie gültige Ländercodes: DE (Deutschland), AT (Österreich), FR (Frankreich), etc.',
      },
    },
  },

  [ErrorCode.INVALID_CURRENCY_CODE]: {
    code: ErrorCode.INVALID_CURRENCY_CODE,
    severity: 'error',
    category: 'format',
    messages: {
      en: {
        title: 'Invalid currency code',
        detail: 'The currency code must be a 3-letter ISO 4217 code.',
        suggestion: 'Use valid currency codes: EUR, USD, GBP, CHF, etc.',
      },
      de: {
        title: 'Ungültiger Währungscode',
        detail: 'Der Währungscode muss ein 3-Buchstaben ISO 4217 Code sein.',
        suggestion: 'Verwenden Sie gültige Währungscodes: EUR, USD, GBP, CHF, etc.',
      },
    },
  },

  [ErrorCode.INVALID_BU_KEY]: {
    code: ErrorCode.INVALID_BU_KEY,
    severity: 'error',
    category: 'format',
    messages: {
      en: {
        title: 'Invalid BU key',
        detail: 'The BU key (Buchungsschlüssel) is not a valid DATEV code.',
        suggestion: 'Valid BU keys: 0, 1, 2, 3, 8, 9, 18, 19, 91, 92, 94, 95.',
      },
      de: {
        title: 'Ungültiger BU-Schlüssel',
        detail: 'Der BU-Schlüssel (Buchungsschlüssel) ist kein gültiger DATEV-Code.',
        suggestion: 'Gültige BU-Schlüssel: 0, 1, 2, 3, 8, 9, 18, 19, 91, 92, 94, 95.',
      },
    },
  },

  // === Business Rule Errors (4xx) ===
  [ErrorCode.TOTALS_MISMATCH]: {
    code: ErrorCode.TOTALS_MISMATCH,
    severity: 'error',
    category: 'business_rule',
    messages: {
      en: {
        title: 'Invoice totals do not match',
        detail: 'Net amount + VAT does not equal Gross amount.',
        suggestion: 'Verify the invoice totals. Net + VAT should equal Gross (±0.02 tolerance).',
      },
      de: {
        title: 'Rechnungssummen stimmen nicht',
        detail: 'Nettobetrag + MwSt entspricht nicht dem Bruttobetrag.',
        suggestion: 'Prüfen Sie die Rechnungssummen. Netto + MwSt sollte Brutto ergeben (±0,02 Toleranz).',
      },
    },
  },

  [ErrorCode.LINE_ITEMS_SUM_MISMATCH]: {
    code: ErrorCode.LINE_ITEMS_SUM_MISMATCH,
    severity: 'warning',
    category: 'business_rule',
    messages: {
      en: {
        title: 'Line items sum does not match header',
        detail: 'The sum of line item amounts does not match the invoice total.',
        suggestion: 'This may be due to rounding or hidden charges. Export will continue with header values.',
      },
      de: {
        title: 'Positionssumme stimmt nicht mit Kopfdaten',
        detail: 'Die Summe der Positionsbeträge entspricht nicht der Rechnungssumme.',
        suggestion: 'Dies kann durch Rundung oder versteckte Gebühren verursacht werden. Export wird mit Kopfwerten fortgesetzt.',
      },
    },
  },

  [ErrorCode.VAT_SUM_MISMATCH]: {
    code: ErrorCode.VAT_SUM_MISMATCH,
    severity: 'warning',
    category: 'business_rule',
    messages: {
      en: {
        title: 'VAT sum does not match header',
        detail: 'The sum of line item VAT amounts does not match the header VAT.',
        suggestion: 'This may be due to rounding. Export will continue with header values.',
      },
      de: {
        title: 'MwSt-Summe stimmt nicht mit Kopfdaten',
        detail: 'Die Summe der MwSt-Beträge entspricht nicht der Kopf-MwSt.',
        suggestion: 'Dies kann durch Rundung verursacht werden. Export wird mit Kopfwerten fortgesetzt.',
      },
    },
  },

  [ErrorCode.BU_KEY_VAT_RATE_MISMATCH]: {
    code: ErrorCode.BU_KEY_VAT_RATE_MISMATCH,
    severity: 'error',
    category: 'business_rule',
    messages: {
      en: {
        title: 'BU key does not match VAT rate',
        detail: 'The BU key assigned does not correspond to the VAT rate.',
        suggestion: 'BU key 3=19%, 2=7%, 1/8/9=0%. Adjust the BU key or VAT rate.',
      },
      de: {
        title: 'BU-Schlüssel passt nicht zum MwSt-Satz',
        detail: 'Der zugewiesene BU-Schlüssel entspricht nicht dem MwSt-Satz.',
        suggestion: 'BU-Schlüssel 3=19%, 2=7%, 1/8/9=0%. Passen Sie den BU-Schlüssel oder MwSt-Satz an.',
      },
    },
  },

  [ErrorCode.IGE_RC_NON_ZERO_VAT]: {
    code: ErrorCode.IGE_RC_NON_ZERO_VAT,
    severity: 'error',
    category: 'business_rule',
    messages: {
      en: {
        title: 'IGE/Reverse Charge with non-zero VAT',
        detail: 'Intra-community acquisition or reverse charge invoices must show 0% VAT.',
        suggestion: 'For IGE/RC, the supplier invoice should show 0% VAT. Buyer self-assesses.',
      },
      de: {
        title: 'IGE/Reverse Charge mit MwSt ungleich Null',
        detail: 'Innergemeinschaftliche Erwerbe oder Reverse-Charge-Rechnungen müssen 0% MwSt zeigen.',
        suggestion: 'Bei IGE/RC sollte die Lieferantenrechnung 0% MwSt zeigen. Käufer ermittelt selbst.',
      },
    },
  },

  [ErrorCode.EU_MISSING_VAT_ID]: {
    code: ErrorCode.EU_MISSING_VAT_ID,
    severity: 'error',
    category: 'business_rule',
    messages: {
      en: {
        title: 'EU transaction requires VAT IDs',
        detail: 'Cross-border EU transactions require valid VAT IDs from both parties.',
        suggestion: 'Ensure both your company and the EU supplier have valid VAT IDs.',
      },
      de: {
        title: 'EU-Transaktion erfordert USt-IdNr',
        detail: 'Grenzüberschreitende EU-Transaktionen erfordern gültige USt-IdNr beider Parteien.',
        suggestion: 'Stellen Sie sicher, dass sowohl Ihr Unternehmen als auch der EU-Lieferant gültige USt-IdNr haben.',
      },
    },
  },

  [ErrorCode.INVALID_GROSS_AMOUNT]: {
    code: ErrorCode.INVALID_GROSS_AMOUNT,
    severity: 'error',
    category: 'business_rule',
    messages: {
      en: {
        title: 'Invalid gross amount',
        detail: 'The gross amount must be greater than 0 for standard invoices.',
        suggestion: 'Check that the invoice total is positive. Use credit note type for refunds.',
      },
      de: {
        title: 'Ungültiger Bruttobetrag',
        detail: 'Der Bruttobetrag muss für normale Rechnungen größer als 0 sein.',
        suggestion: 'Prüfen Sie, ob der Rechnungsbetrag positiv ist. Verwenden Sie Gutschrift für Erstattungen.',
      },
    },
  },

  [ErrorCode.CREDIT_NOTE_POSITIVE_AMOUNT]: {
    code: ErrorCode.CREDIT_NOTE_POSITIVE_AMOUNT,
    severity: 'error',
    category: 'business_rule',
    messages: {
      en: {
        title: 'Credit note must have negative amount',
        detail: 'Credit notes must have a negative gross amount.',
        suggestion: 'Ensure the credit note amount is negative, or change document type to invoice.',
      },
      de: {
        title: 'Gutschrift muss negativen Betrag haben',
        detail: 'Gutschriften müssen einen negativen Bruttobetrag haben.',
        suggestion: 'Stellen Sie sicher, dass der Gutschriftsbetrag negativ ist, oder ändern Sie den Dokumenttyp.',
      },
    },
  },

  // === System Errors (5xx) ===
  [ErrorCode.PDF_ACQUISITION_FAILED]: {
    code: ErrorCode.PDF_ACQUISITION_FAILED,
    severity: 'error',
    category: 'system',
    messages: {
      en: {
        title: 'PDF download failed',
        detail: 'The PDF document could not be downloaded or generated.',
        suggestion: 'Check that the document URL is valid and accessible. Try again later.',
      },
      de: {
        title: 'PDF-Download fehlgeschlagen',
        detail: 'Das PDF-Dokument konnte nicht heruntergeladen oder generiert werden.',
        suggestion: 'Prüfen Sie, ob die Dokument-URL gültig und erreichbar ist. Versuchen Sie es später erneut.',
      },
    },
  },

  [ErrorCode.ZIP_PACKAGING_FAILED]: {
    code: ErrorCode.ZIP_PACKAGING_FAILED,
    severity: 'error',
    category: 'system',
    messages: {
      en: {
        title: 'ZIP package creation failed',
        detail: 'Failed to create the DATEV ZIP package.',
        suggestion: 'This is a system error. Please try again or contact support.',
      },
      de: {
        title: 'ZIP-Paket-Erstellung fehlgeschlagen',
        detail: 'Das DATEV ZIP-Paket konnte nicht erstellt werden.',
        suggestion: 'Dies ist ein Systemfehler. Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.',
      },
    },
  },

  [ErrorCode.XML_GENERATION_FAILED]: {
    code: ErrorCode.XML_GENERATION_FAILED,
    severity: 'error',
    category: 'system',
    messages: {
      en: {
        title: 'XML generation failed',
        detail: 'Failed to generate the DATEV XML document.',
        suggestion: 'This is a system error. Please try again or contact support.',
      },
      de: {
        title: 'XML-Generierung fehlgeschlagen',
        detail: 'Das DATEV XML-Dokument konnte nicht generiert werden.',
        suggestion: 'Dies ist ein Systemfehler. Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.',
      },
    },
  },

  [ErrorCode.UNEXPECTED_ERROR]: {
    code: ErrorCode.UNEXPECTED_ERROR,
    severity: 'error',
    category: 'system',
    messages: {
      en: {
        title: 'Unexpected error',
        detail: 'An unexpected error occurred during processing.',
        suggestion: 'Please try again. If the problem persists, contact support with the error code.',
      },
      de: {
        title: 'Unerwarteter Fehler',
        detail: 'Ein unerwarteter Fehler ist während der Verarbeitung aufgetreten.',
        suggestion: 'Bitte versuchen Sie es erneut. Bei anhaltenden Problemen kontaktieren Sie den Support mit dem Fehlercode.',
      },
    },
  },
};

/**
 * Get error message definition by code
 */
export function getErrorDefinition(code: ErrorCode): ErrorMessageDefinition | undefined {
  return ERROR_MESSAGES[code];
}

/**
 * Get all error codes for a specific category
 */
export function getErrorCodesByCategory(category: ErrorMessageDefinition['category']): ErrorCode[] {
  return Object.values(ErrorCode).filter(
    code => ERROR_MESSAGES[code]?.category === category
  );
}
