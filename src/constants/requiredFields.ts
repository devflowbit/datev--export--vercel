/**
 * DATEV Required Fields Definition
 * Based on DATEV XML Field List specification
 */

export enum FieldRequirement {
  REQUIRED = 'REQUIRED',
  STRONGLY_RECOMMENDED = 'STRONGLY_RECOMMENDED',
  CONDITIONAL = 'CONDITIONAL',
  OPTIONAL = 'OPTIONAL'
}

export interface FieldDefinition {
  path: string;
  name: string;
  requirement: FieldRequirement;
  condition?: string; // For conditional fields
  description: string;
}

export const REQUIRED_FIELDS: FieldDefinition[] = [
  // Sheet A: Envelope
  {
    path: 'interfaceType',
    name: 'Interface Type',
    requirement: FieldRequirement.REQUIRED,
    description: 'DATEV interface type (XML-Online)'
  },
  {
    path: 'interfaceVersion',
    name: 'Interface Version',
    requirement: FieldRequirement.REQUIRED,
    description: 'Interface version (1.0)'
  },

  // Sheet B: Header
  {
    path: 'documentNumber',
    name: 'Document Number (Belegnummer)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Supplier invoice number - maps to consolidatedInvoiceId'
  },
  {
    path: 'documentDate',
    name: 'Document Date (Belegdatum)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Invoice issue date (YYYY-MM-DD) - maps to consolidatedDate'
  },
  {
    path: 'currency',
    name: 'Currency (Währung)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Transaction currency code (ISO 4217) - maps to consolidatedCurrencyCode'
  },
  {
    path: 'exchangeRate',
    name: 'Exchange Rate (Wechselkurs)',
    requirement: FieldRequirement.CONDITIONAL,
    condition: 'Required if currency ≠ EUR',
    description: 'Currency exchange rate to EUR'
  },
  {
    path: 'grossAmount',
    name: 'Gross Amount (BetragBrutto)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Total invoice amount including VAT - maps to consolidatedAmount'
  },
  {
    path: 'netAmount',
    name: 'Net Amount (BetragNetto)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Sum of all line item net amounts'
  },
  {
    path: 'totalTax',
    name: 'Total Tax Amount (SteuerGesamt)',
    requirement: FieldRequirement.CONDITIONAL,
    condition: 'Should be 0 for IGE/RC supplier documents',
    description: 'Total VAT amount'
  },
  {
    path: 'primaryPDF',
    name: 'Primary Document PDF (Belegbild)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Original invoice PDF'
  },

  // Sheet E: VAT
  {
    path: 'vatCase',
    name: 'VAT Case (Steuerfall)',
    requirement: FieldRequirement.REQUIRED,
    description: 'VAT treatment scenario (Inland19, IGE19, RC19, etc.)'
  },
  {
    path: 'taxRate',
    name: 'Tax Rate (Steuersatz)',
    requirement: FieldRequirement.REQUIRED,
    description: 'VAT percentage'
  },

  // Sheet F: Line Items
  {
    path: 'lineItems',
    name: 'Line Items',
    requirement: FieldRequirement.REQUIRED,
    description: 'At least one line item required'
  },
  {
    path: 'lineItems[].lineNumber',
    name: 'Line Number (PositionsNr)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Sequential line numbering'
  },
  {
    path: 'lineItems[].description',
    name: 'Line Description (Beschreibung)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Description of goods/services'
  },
  {
    path: 'lineItems[].unitPriceNet',
    name: 'Unit Price Net (EinzelpreisNetto)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Net price per unit'
  },
  {
    path: 'lineItems[].lineNetAmount',
    name: 'Line Net Amount (PositionsNetto)',
    requirement: FieldRequirement.REQUIRED,
    description: 'Total net amount for line'
  },
  {
    path: 'lineItems[].vatRate',
    name: 'Line VAT Rate (PositionsSteuersatz)',
    requirement: FieldRequirement.REQUIRED,
    description: 'VAT rate for line'
  },
  {
    path: 'lineItems[].buKey',
    name: 'Line BU Key (BU-Schlüssel)',
    requirement: FieldRequirement.REQUIRED,
    description: 'DATEV posting key for line'
  }
];

export const STRONGLY_RECOMMENDED_FIELDS: FieldDefinition[] = [
  // Document Type
  {
    path: 'documentType',
    name: 'Document Type (Belegtyp)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Document type (Eingangsrechnung, etc.)'
  },
  {
    path: 'serviceDate',
    name: 'Service Date (Leistungsdatum)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Critical for §13b/IGE VAT logic'
  },
  // Supplier Information
  {
    path: 'supplier.name',
    name: 'Supplier Name',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Vendor company name'
  },
  {
    path: 'supplier.street',
    name: 'Supplier Street (Straße)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Vendor street address'
  },
  {
    path: 'supplier.postalCode',
    name: 'Supplier Postal Code (PLZ)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Vendor postal/ZIP code'
  },
  {
    path: 'supplier.city',
    name: 'Supplier City (Ort)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Vendor city'
  },
  {
    path: 'supplier.country',
    name: 'Supplier Country (Land)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Vendor country (ISO 3166-1 Alpha-2)'
  },
  {
    path: 'supplier.vatId',
    name: 'EU VAT ID (USt-IdNr.)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    condition: 'For EU suppliers',
    description: 'Essential for IGE and reverse charge'
  },
  {
    path: 'supplierInternalId',
    name: 'Supplier ID (LieferantenNr)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Internal unique vendor identifier'
  },
  {
    path: 'dueDate',
    name: 'Due Date (FaelligAm)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Payment due date'
  },
  {
    path: 'externalReference',
    name: 'External Reference (ExterneReferenz)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Deep link back to source system'
  },
  {
    path: 'creditorAccount',
    name: 'Vendor Account (Kreditorenkonto)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Creditor account number'
  },
  {
    path: 'offsetAccount',
    name: 'G/L Account (Gegenkonto/Sachkonto)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Expense or revenue account'
  },
  {
    path: 'lineItems[].suggestedGLAccount',
    name: 'Suggested G/L Account (SachkontoVorschlag)',
    requirement: FieldRequirement.STRONGLY_RECOMMENDED,
    description: 'Pre-suggested general ledger account'
  }
];
