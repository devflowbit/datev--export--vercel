/**
 * LLM Data Structure Interface
 * Represents the input data structure from LLM extraction with confidence scores
 */

export interface LLMField<T = any> {
  value: T;
  id?: string;
  path?: string;
  confidence: string;
  source?: string | null;
  error?: string | null;
}

export interface LLMSection<T> {
  id: string;
  path: string;
  value: T;
}

export interface InvoiceValue {
  invoiceId?: LLMField<string>;
  invoiceDate?: LLMField<string>;
  deliveryDate?: LLMField<string>;
  orderId?: LLMField<string>;
}

export interface VendorValue {
  vendorName?: LLMField<string>;
  vendorAddress?: LLMField<string>;
  vendorTaxId?: LLMField<string>;
  vendorEmail?: LLMField<string>;
  vendorPhone?: LLMField<string>;
  // Extended vendor fields (all optional)
  bpAccountNo?: LLMField<string>;
  vendorPartyNumber?: LLMField<string>;
  accountName?: LLMField<string>;
  shipFromCountry?: LLMField<string>;
  iban?: LLMField<string>;
  bic?: LLMField<string>;
  bankCode?: LLMField<string>;
  bankAccount?: LLMField<string>;
  bankCountry?: LLMField<string>;
  vendorCity: LLMField<string>;
  vendorCountry: LLMField<string>;
  germanTaxNumber?: LLMField<string>;
}

export interface CustomerValue {
  customerId?: LLMField<string>;
  customerName?: LLMField<string>;
  street?: LLMField<string>;
  postalCode?: LLMField<string>;
  city?: LLMField<string>;
  country?: LLMField<string>;
  customerAddress?: LLMField<string>;
  customerEmail?: LLMField<string>;
  customerPhone?: LLMField<string>;
  customerVatId?: LLMField<string>;
  customerCity?: LLMField<string>;
  customerCountry?: LLMField<string>;
}

export interface PaymentValue {
  paymentTerms?: LLMField<string>;
  bankAccountNumber?: LLMField<string>;
  paymentMethod?: LLMField<string>;
  paymentStatus?: LLMField<string>;
  dueDate?: LLMField<string> | null;
  netDays?: LLMField<number> | null;
  discountPercentage?: LLMField<number>;
  discountDays?: LLMField<number> | null;
  discountDueDate?: LLMField<string> | null;
  discountedTotal?: LLMField<number>;
  // Extended payment fields (all optional)
  paidAt?: LLMField<string>;
  paymentDate?: LLMField<string>;
  paymentConditionsId?: LLMField<string>;
  paymentOrder?: LLMField<string>;
  discountAmount2?: LLMField<number>;
  discountPercentage2?: LLMField<number>;
  discountPaymentDate2?: LLMField<string>;
  bankCode?: LLMField<string>;
  bankAccount?: LLMField<string>;
  bankCountry?: LLMField<string>;
  swiftCode?: LLMField<string>;
  bic?: LLMField<string>;
  exchangeRate?: LLMField<number>;
  isInvoiceAlreadyPaid?: LLMField<boolean>;
  invoicePaidAtDate?: LLMField<string> | null;
}

export interface SummaryValue {
  subTotal?: LLMField<number>;
  totalTax?: LLMField<number>;
  invoiceTotal?: LLMField<number>;
  documentType?: LLMField<string>;
  currencySymbol?: LLMField<string>;
  currencyShortForm?: LLMField<string>;
}

export interface LineItemData {
  srNo?: LLMField<number>;
  description?: LLMField<string>;
  quantity?: LLMField<number>;
  unit?: LLMField<string>;
  unitPrice?: LLMField<number>;
  totalPrice?: LLMField<number>;
  vatRate?: LLMField<number>;
  vatAmount?: LLMField<number>;
  sachkonto?: LLMField<string>;
  BUSchluessel?: LLMField<string>;
  discount?: LLMField<number>;
  // Extended line item fields (all optional)
  bookingText?: LLMField<string>;
  information?: LLMField<string>;
  costCenter?: LLMField<string>;
  costCategory?: LLMField<string>;
  costCategoryId?: LLMField<string>;
  costAmount?: LLMField<number>;
  typeOfReceivable?: LLMField<string>;
  internalInvoiceId?: LLMField<string>;
  orderId?: LLMField<string>;
  accountName?: LLMField<string>;
}

export interface LineItemsValue {
  items?: {
    id: string;
    path: string;
    value: LineItemData[];
    error?: string | null;
  };
}

export interface LLMDataInput {
  documentDirection?: 'incoming' | 'outgoing' | 'creditNote'; // Direction of invoice: incoming (purchase), outgoing (sales), or creditNote
  invoice?: LLMSection<InvoiceValue>;
  vendor?: LLMSection<VendorValue>;
  customer?: LLMSection<CustomerValue>;
  payment?: LLMSection<PaymentValue>;
  summary?: LLMSection<SummaryValue>;
  lineItems?: LLMSection<LineItemsValue>;
  metadata?: LLMSection<any>;
}

export interface DatevExportRequest {
  llmData: LLMDataInput;
  pdfSasUrl?: string;
  correlationId?: string;
  webhookUrl?: string;
  datevClientId?: string; // Format: "consultantNumber-clientNumber" (e.g., "23433-4605")
  options?: {
    confidenceThreshold?: number;
    validateXml?: boolean;
    consultantNumber?: string; // Extracted from datevClientId
    clientNumber?: string; // Extracted from datevClientId
  };
}

/**
 * Webhook Notification Payload
 * Sent to client's webhook endpoint after ZIP package creation
 */
export interface WebhookPayload {
  correlationId: string;
  success: boolean;
  zipData?: string;
  filename?: string;
  metadata?: {
    invoiceNumber: string;
    documentDate: string;
    supplier: string;
    grossAmount: number;
    currency: string;
    filesIncluded: string[];
    pdfSource: 'azure_download' | 'generated';
    stage: string;
    timestamp: string;
  };
  timestamp: string;
  error?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
}

/**
 * Webhook Notification Result
 * Internal result from webhook service
 */
export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  attemptCount: number;
  error?: string;
  duration?: number;
}
