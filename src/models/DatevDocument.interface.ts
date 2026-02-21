/**
 * DATEV Document Interface
 * Represents the DATEV-compliant document structure
 * Maps to DATEV XML Field List specification
 */

export interface AddressComponents {
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface SupplierInfo {
  name?: string; // Changed to optional
  street?: string; // Changed to optional
  postalCode?: string; // Changed to optional
  city?: string; // Changed to optional
  country?: string; // Changed to optional
  vatId?: string;
  germanTaxNumber?: string;
  iban?: string;
  bic?: string;
  email?: string;
  phone?: string;
  internalId?: string; // LieferantenNr
  // Extended fields for DATEV XML (all optional)
  bpAccountNo?: string; // Business partner account number (Order 17, 38)
  accountName?: string; // Account holder name (Order 28)
  shipFromCountry?: string; // Origin country ISO code (Order 16)
  bankCode?: string; // Bank code/BLZ (Order 23)
  bankAccount?: string; // Bank account number (Order 24)
  bankCountry?: string; // Bank country code (Order 25)
  swiftCode?: string; // BIC/SWIFT code (Order 27)
  vendorPartyNumber?: string;
}

export interface CustomerInfo {
  name?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  vatId?: string;
  germanTaxNumber?: string;
  iban?: string;
  bic?: string;
  email?: string;
  phone?: string;
  internalId?: string;
  // Extended fields for DATEV XML (all optional)
  bpAccountNo?: string;
  accountName?: string;
  bankCode?: string;
  bankAccount?: string;
  bankCountry?: string;
  swiftCode?: string;
}

export interface PaymentInfo {
  paymentTermsText?: string;
  dueDate?: string; // Payment due date (Order 36)
  paymentMethod?: string;
  paymentStatus?: string;
  bankAccount?: string; // Bank account number (Order 24)
  iban?: string; // IBAN (Order 26)
  // Discount fields (Order 31-35)
  discountPercentage?: number;
  discountDays?: number;
  discountDueDate?: string;
  discountedTotal?: number;
  // Extended payment fields (all optional)
  paidAt?: string; // Payment date (Order 18)
  paymentConditionsId?: string; // Payment terms code (Order 29)
  paymentOrder?: string; // Payment order/reference (Order 30)
  // Second discount tier (Order 33-35)
  discountAmount2?: number;
  discountPercentage2?: number;
  discountPaymentDate2?: string;
  // Banking fields (Order 23-27)
  bankCode?: string; // Bank code/BLZ
  bankCountry?: string; // Bank country code
  swiftCode?: string; // BIC/SWIFT code
  // Exchange rate (Order 22)
  exchangeRate?: number;
  isInvoiceAlreadyPaid?: boolean;
  invoicePaidAtDate?: string;
}

export interface TaxLine {
  rate: number;
  type: string; // VST, UST
  taxableAmount: number;
  taxAmount: number;
  taxKey: number;
}

export interface LineItem {
  lineNumber: number; // PositionsNr (required)
  description: string; // Beschreibung (required)
  articleNumber?: string; // NEW v6.0: SKU/product code (optional)
  quantity?: number; // Menge (optional)
  unit?: string; // Einheit (optional)
  unitPriceNet: number; // EinzelpreisNetto (required)
  lineNetAmount: number; // PositionsNetto (required)
  vatRate: number; // PositionsSteuersatz (required)
  lineTaxAmount?: number; // PositionsSteuerbetrag (conditional)
  lineGrossAmount?: number; // NEW v6.0: Gross amount (calculated)
  buKey?: string; // BU-Schlüssel (Order 5) - optional now, not always present
  suggestedGLAccount?: string; // SachkontoVorschlag (Order 4) - maps to accountNo in XML
  bookingText?: string; // NEW v6.0: Posting description (Order 13)
  information?: string; // Document summary
  costCenter?: string; // Cost center (Order 7) - costCategoryId in XML
  costCategory?: string; // Cost category (Order 8) - costCategoryId2 in XML
  costObject?: string; // NEW v6.0: Cost object/project (optional)
  deliveryDate?: string; // NEW: Line-specific delivery/service date (Order 38) - YYYY-MM-DD
  // Extended line item fields (all optional)
  costAmount?: number; // Cost center amount (Order 6)
  typeOfReceivable?: string; // Type of receivable (Order 14)
  internalInvoiceId?: string; // Internal invoice reference (Order 19)
  orderId?: string; // Order reference/PO number (Order 39)
  accountName?: string;
}

export interface DatevDocument {
  // Document Direction (NEW: for incoming/outgoing invoices/credit notes)
  documentDirection: 'incoming' | 'outgoing' | 'creditNote'; // 'incoming' = purchase invoice, 'outgoing' = sales invoice, 'creditNote' = credit note

  // Sheet A: Envelope Fields
  advisorNumber?: string; // BeraterNr (optional)
  clientNumber?: string; // MandantNr (optional)
  interfaceType: string; // Required: "XML-Online"
  interfaceVersion: string; // Required: "1.0"
  batchId?: string; // BatchId/UploadId (optional)
  fileName?: string; // FileName (optional)
  timestamp?: string; // Timestamp (optional)

  // Sheet B: Header Fields
  documentType?: string; // Belegtyp (strongly recommended) - "Eingangsrechnung"
  documentNumber: string; // Belegnummer (required) - consolidatedInvoiceId
  documentDate: string; // Belegdatum (required) - YYYY-MM-DD - consolidatedDate
  serviceDate?: string; // Leistungsdatum (strongly recommended) - consolidatedDeliveryDate
  servicePeriod?: { start: string; end: string }; // Leistungszeitraum (alternative to serviceDate)
  postingDate?: string; // Buchungsdatum (optional)
  currency: string; // Währung (required) - consolidatedCurrencyCode
  exchangeRate?: number; // Wechselkurs (conditional: required if currency ≠ EUR)
  grossAmount: number; // BetragBrutto (required) - consolidatedAmount
  netAmount: number; // BetragNetto (required)
  totalTax: number; // SteuerGesamt (conditional)
  documentField1?: string; // Belegfeld1 (optional) - often PO number
  documentField2?: string; // Belegfeld2 (optional) - often due date
  externalReference?: string; // ExterneReferenz (strongly recommended)
  internalNote?: string; // InterneNotiz (optional)
  primaryPDF?: Buffer; // Belegbild (required)

  // Sheet C: Counterparty Fields (all optional)
  supplier?: SupplierInfo;
  customer?: CustomerInfo; // NEW: Customer information (for party swap in outgoing invoices)
  supplierInternalId?: string; // LieferantenNr (strongly recommended)

  // Sheet D: Payment Fields
  payment?: PaymentInfo;
  dueDate?: string; // FaelligAm (strongly recommended)

  // Sheet E: VAT Fields
  vatCase: string; // Steuerfall (required) - Inland19, IGE19, RC19, etc.
  taxRate: number; // Steuersatz (required)
  reverseChargeNote?: string; // ReverseChargeHinweis (strongly recommended for RC)
  intraEUNote?: string; // IGE-Hinweis (strongly recommended for IGE)

  // Sheet F: Line Items
  lineItems: LineItem[];

  // Sheet G: Booking Fields
  creditorAccount?: string; // Kreditorenkonto (strongly recommended)
  offsetAccount?: string; // Gegenkonto/Sachkonto (strongly recommended)
  oposFlag?: boolean; // OPOSFlag (optional)
  costAccountingActive?: boolean; // KostenrechnungAktiv (optional)

  // Sheet H: International Fields
  intraEUGoodsAcquisition?: boolean; // IGE flag
  euServiceReverseCharge?: boolean; // EU Service RC flag
  customerVatId?: string; // UStIdNrKunde - your German VAT ID
  ownVatId?: string; // Own VAT ID (Order 15) - buyer's VAT
  supplierVatIdForValidation?: string; // UStIdNrLieferant
  importVATDocNumber?: string; // EUStBelegNr/Zoll
  nonEUImport?: boolean; // DrittlandImport
  shipToCountry?: string; // Destination country (Order 21)

  // Sheet J: Reference Fields
  purchaseOrderNumber?: string; // Bestellnummer/PO
  deliveryNoteNumber?: string; // Lieferscheinnummer
  deliveryDate?: string; // Lieferdatum
  contractNumber?: string; // Vertrag/AboNr

  // Internal metadata
  documentGuid?: string; // Generated GUID for document.xml
  generatedAt?: string; // Generation timestamp

  // NEW v6.0 Fields
  // Header additions
  systemVersion?: string; // System version (e.g., "1.0.0")
  fiscalYear?: number; // Auto-calculated from documentDate
  periodStart?: string; // Auto-calculated (month start)
  periodEnd?: string; // Auto-calculated (month end)
  fiscalYearStart?: string; // Auto-calculated (year-01-01)
  recordCount?: number; // Always 1 for single invoice
  clientID?: string; // Optional client DB ID
  consultantNumber?: string; // Same as advisorNumber
  testMode?: boolean; // Optional test flag

  // Document-level additions
  documentCategory?: string; // B2B, B2C
  invoiceTypeCode?: string; // "invoice", "creditnote"
  businessArea?: string; // Division/business area

  // Vendor additions
  vendorAccountNumber?: string; // 99999 default (v6.0 party accountNumber)
  vendorBpAccount?: string; // Optional business partner account
  vendorName2?: string; // Second name line
  vendorTaxNumber?: string; // Separate from germanTaxNumber

  // Customer additions
  customerAccountNumber?: string; // 69999 default (v6.0 party accountNumber)
  customerBpAccount?: string; // Optional business partner account
  customerName?: string; // Customer name
  customerName2?: string; // Second name line
  customerStreet?: string;
  customerPostalCode?: string;
  customerCity?: string;
  customerCountry?: string;

  // Tax additions
  taxLines?: TaxLine[]; // Optional detailed tax breakdown

  // Payment additions
  paymentCondition?: string; // Structured payment code
  skontoPercent?: number; // Cash discount %
  skontoDays?: number; // Cash discount days
  paymentDeadline?: string; // Calculated deadline
  paymentReference?: string; // Payment matching reference

  // Booking additions
  postingKey?: string; // 40 for vendor invoices
  bookingText?: string; // Posting description
  costCenter?: string; // Cost center code
  costObject?: string; // Project/cost object

  orderId?: string;
}

export interface DatevExportResult {
  success: boolean;
  correlationId?: string; // Request correlation ID for tracking
  zipData?: string; // base64 encoded ZIP
  filename?: string;
  error?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
  metadata?: {
    invoiceNumber?: string;
    documentDate?: string;
    supplier?: string;
    grossAmount?: number;
    currency?: string;
    filesIncluded?: string[];
    pdfSource?: string;
    stage?: string;
    timestamp?: string;
    validation?: ValidationResult;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
