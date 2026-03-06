/**
 * DATEV Parser Service
 * Transforms LLM-extracted data with confidence scores into DATEV-compliant document structure
 */

import { LLMDataInput, LLMField, LineItemData } from '../models/LLMData.interface';
import { DatevDocument, LineItem, SupplierInfo, PaymentInfo } from '../models/DatevDocument.interface';
import { parseAddress } from '../utils/addressParser';
import { parseGermanNumber, roundCurrency } from '../utils/numberFormatter';
import { generateGUID, formatDateForDatev } from '../utils/xmlHelper';
import { getBUKeyInfo, isIGEKey, isRCKey } from '../constants/buKeys';
import { DATEV_CONFIG, DEFAULT_VALUES } from '../config/datevConfig';
import {
  calculateFiscalYear,
  calculateFiscalYearStart,
  calculatePeriodStart,
  calculatePeriodEnd
} from '../utils/datevCalculations';

export interface DatevParserOptions {
  confidenceThreshold?: number;
  consultantNumber?: string;
  clientNumber?: string;
}

export class DatevParserService {
  private confidenceThreshold: number;
  private consultantNumber: string;
  private clientNumber: string;

  constructor(options?: DatevParserOptions | number) {
    // Support both old (number) and new (options object) constructor signatures
    if (typeof options === 'number') {
      this.confidenceThreshold = options || DATEV_CONFIG.confidenceThreshold;
      this.consultantNumber = DATEV_CONFIG.consultantNumber || DATEV_CONFIG.advisorNumber;
      this.clientNumber = DATEV_CONFIG.clientNumber;
    } else {
      this.confidenceThreshold = options?.confidenceThreshold || DATEV_CONFIG.confidenceThreshold;
      this.consultantNumber = options?.consultantNumber || DATEV_CONFIG.consultantNumber || DATEV_CONFIG.advisorNumber;
      this.clientNumber = options?.clientNumber || DATEV_CONFIG.clientNumber;
    }
  }

  /**
   * Main parsing function: Transform LLM data to DATEV document (v6.0)
   */
  public parseLLMData(llmData: LLMDataInput): DatevDocument {
    // Extract document direction (default: 'incoming' for backward compatibility)
    let documentDirection = llmData.documentDirection || 'incoming';

    // Auto-detect credit notes from summary.documentType field
    if (llmData.summary?.value?.documentType?.value === 'creditNote') {
      documentDirection = 'creditNote';
    }

    // Extract all sections
    const invoiceInfo = this.extractInvoiceHeader(llmData);
    const supplierInfo = this.extractSupplierInfo(llmData);
    const paymentInfo = this.extractPaymentInfo(llmData);
    const customerInfo = this.extractCustomerInfo(llmData);
    console.log("customer information", customerInfo);
    const lineItems = this.extractLineItems(llmData);
    const summaryInfo = this.extractSummaryInfo(llmData);

    // Derive VAT case from BU keys
    const vatCase = this.deriveVATCase(lineItems, supplierInfo.country);

    // Build DATEV document with v6.0 fields
    const datevDocument: DatevDocument = {
      // Document Direction (NEW)
      documentDirection,

      // Sheet A: Envelope Fields
      interfaceType: DATEV_CONFIG.interfaceType,
      interfaceVersion: DATEV_CONFIG.interfaceVersion,
      timestamp: new Date().toISOString(),

      // Sheet B: Header Fields
      documentType: DATEV_CONFIG.documentType,
      documentNumber: invoiceInfo.invoiceNumber,
      documentDate: invoiceInfo.invoiceDate,
      serviceDate: invoiceInfo.serviceDate || invoiceInfo.invoiceDate, // Fallback to invoice date
      currency: summaryInfo.currency,
      grossAmount: summaryInfo.grossAmount,
      netAmount: summaryInfo.netAmount,
      totalTax: summaryInfo.totalTax,
      externalReference: `invoice:${invoiceInfo.invoiceNumber}`,

      // Sheet C: Counterparty Fields
      supplier: supplierInfo,
      supplierInternalId: supplierInfo.internalId,

      // Sheet D: Payment Fields
      payment: paymentInfo,
      dueDate: paymentInfo?.dueDate,

      // Sheet E: VAT Fields
      vatCase,
      taxRate: this.determinePrimaryTaxRate(lineItems),

      // Sheet F: Line Items
      lineItems,

      // Sheet G: Booking Fields
      creditorAccount: DATEV_CONFIG.defaultCreditorAccount,
      offsetAccount: this.determineOffsetAccount(lineItems),

      // Sheet H: International Fields
      intraEUGoodsAcquisition: lineItems.some(item => isIGEKey(item.buKey)),
      euServiceReverseCharge: lineItems.some(item => isRCKey(item.buKey)),
      customerVatId: customerInfo.vatId,
      ownVatId: DATEV_CONFIG.companyVatId, // Own VAT ID (Order 15)
      supplierVatIdForValidation: supplierInfo.vatId,
      shipToCountry: customerInfo.country, // Destination country (Order 21)

      // Internal metadata
      documentGuid: generateGUID(),
      generatedAt: new Date().toISOString(),

      // NEW v6.0 Fields
      // Header additions (auto-calculated)
      systemVersion: DATEV_CONFIG.systemVersion,
      fiscalYear: calculateFiscalYear(invoiceInfo.invoiceDate),
      periodStart: calculatePeriodStart(invoiceInfo.invoiceDate),
      periodEnd: calculatePeriodEnd(invoiceInfo.invoiceDate),
      fiscalYearStart: calculateFiscalYearStart(invoiceInfo.invoiceDate),
      recordCount: 1,
      advisorNumber: this.consultantNumber, // Use instance value (from params or config)
      clientNumber: this.clientNumber, // Use instance value (from params or config)
      consultantNumber: this.consultantNumber, // Use instance value (from params or config)

      // Document-level additions
      documentCategory: 'B2B',
      invoiceTypeCode: 'invoice',

      // Vendor additions
      vendorAccountNumber: supplierInfo.bpAccountNo || DATEV_CONFIG.defaultVendorAccountNumber, // Use extracted bpAccountNo if available
      vendorTaxNumber: supplierInfo.vatId, // Can be used as tax number

      // Customer additions
      customerAccountNumber: DATEV_CONFIG.defaultCustomerAccountNumber,
      customerName: customerInfo.name,
      customerStreet: customerInfo.street,
      customerPostalCode: customerInfo.postalCode,
      customerCity: customerInfo.city,
      customerCountry: customerInfo.country,

      // Booking additions
      postingKey: DATEV_CONFIG.defaultPostingKey,
      bookingText: `Invoice ${invoiceInfo.invoiceNumber}`,
      orderId: invoiceInfo.orderId
    };

    return datevDocument;
  }

  /**
   * Extract invoice header information
   */
  private extractInvoiceHeader(llmData: LLMDataInput): {
    invoiceNumber: string;
    invoiceDate: string;
    serviceDate?: string;
    orderId?: string;
  } {
    const invoice = llmData.invoice?.value;
    const summary = llmData.summary?.value;

    return {
      invoiceNumber: this.extractFieldValue(invoice?.invoiceId) || '',
      invoiceDate: this.extractFieldValue(invoice?.invoiceDate) || '',
      serviceDate: this.extractFieldValue(invoice?.deliveryDate),
      orderId: this.extractFieldValue(invoice?.orderId)
    };
  }

  /**
   * Extract supplier information with address parsing
   * Extracts all available fields gracefully (missing fields = undefined)
   */
  private extractSupplierInfo(llmData: LLMDataInput): SupplierInfo {
    const vendor = llmData.vendor?.value;

    const vendorName = this.extractFieldValue(vendor?.vendorName) || '';
    const vendorAddress = this.extractFieldValue(vendor?.vendorAddress) || '';
    const vendorTaxId = this.extractFieldValue(vendor?.vendorTaxId);
    const vendorEmail = this.extractFieldValue(vendor?.vendorEmail);
    const vendorPhone = this.extractFieldValue(vendor?.vendorPhone);

    // Parse address into components
    const addressComponents = parseAddress(vendorAddress);

    // Extract extended fields (all optional)
    const bpAccountNo = this.extractFieldValue(vendor?.bpAccountNo);
    const vendorPartyNumber = this.extractFieldValue(vendor?.vendorPartyNumber);
    const accountName = this.extractFieldValue(vendor?.accountName);
    const shipFromCountry = this.extractFieldValue(vendor?.shipFromCountry) || addressComponents.country;
    const country = this.extractFieldValue(vendor?.vendorCountry);
    const city = this.extractFieldValue(vendor?.vendorCity);
    // Remove whitespaces from bank-related fields (IBAN, BIC, bank codes, account numbers)
    const iban = this.extractFieldValue(vendor?.iban)?.replace(/\s+/g, '');
    const bic = this.extractFieldValue(vendor?.bic)?.replace(/\s+/g, '');
    const bankCode = this.extractFieldValue(vendor?.bankCode)?.replace(/\s+/g, '');
    // Extract account number from dedicated field or from IBAN as fallback
    const bankAccountFromField = this.extractFieldValue(vendor?.bankAccount)?.replace(/\s+/g, '');
    const bankAccount = bankAccountFromField || this.extractAccountNumberFromIBAN(iban);
    const bankCountry = this.extractFieldValue(vendor?.bankCountry);
    const germanTaxNumber = this.extractFieldValue(vendor?.germanTaxNumber);

    return {
      name: vendorName,
      street: addressComponents.street,
      postalCode: addressComponents.postalCode,
      city,
      country,
      vatId: vendorTaxId,
      email: vendorEmail,
      phone: vendorPhone,
      internalId: vendorTaxId, // Use VAT ID as internal ID if available
      // Extended fields (only included if present)
      bpAccountNo,
      accountName: accountName || vendorName, // Fallback to vendor name
      shipFromCountry,
      iban,
      bic,
      bankCode,
      bankAccount,
      bankCountry,
      swiftCode: bic, // BIC and SWIFT are the same
      germanTaxNumber,
      vendorPartyNumber
    };
  }

  /**
   * Extract customer information (v6.0)
   */
  private extractCustomerInfo(llmData: LLMDataInput): {
    name?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    country?: string;
    vatId?: string;
  } {
    const customer = llmData.customer?.value;

    if (!customer) {
      return {};
    }

    const customerName = this.extractFieldValue(customer.customerName);
    const street = this.extractFieldValue(customer.street);
    const postalCode = this.extractFieldValue(customer.postalCode);
    const city = this.extractFieldValue(customer.customerCity);
    const country = this.extractFieldValue(customer.customerCountry) || 'DE';
    const vatId = this.extractFieldValue(customer.customerVatId);

    console.log("Own VAT ID", vatId);

    return {
      name: customerName,
      street,
      postalCode,
      city,
      country,
      vatId
    };
  }

  /**
   * Extract account number from IBAN
   * For German IBANs: DEpp bbbbbbbb cccccccccc (pp=check, b=bank code, c=account)
   * Returns the account number portion (last 10 digits for DE)
   */
  private extractAccountNumberFromIBAN(iban: string | undefined): string | undefined {
    if (!iban) return undefined;

    // Remove spaces and convert to uppercase
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();

    // German IBAN: DE + 2 check digits + 8 bank code + 10 account number
    if (cleanIban.startsWith('DE') && cleanIban.length === 22) {
      // Extract last 10 digits (account number)
      return cleanIban.substring(12);
    }

    // For other countries or invalid format, return undefined
    return undefined;
  }

  /**
   * Extract payment information
   * Extracts all available fields gracefully (missing fields = undefined)
   */
  private extractPaymentInfo(llmData: LLMDataInput): PaymentInfo | undefined {
    const payment = llmData.payment?.value;

    if (!payment) {
      return undefined;
    }

    // Extract IBAN (full value from bankAccountNumber field)
    const iban = this.extractFieldValue(payment.bankAccountNumber);

    // Extract account number from IBAN or from separate field
    const bankAccountFromField = this.extractFieldValue(payment.bankAccount);
    const bankAccount = bankAccountFromField || this.extractAccountNumberFromIBAN(iban);

    const dueDate = this.extractFieldValue(payment.dueDate);
    const paymentTerms = this.extractFieldValue(payment.paymentTerms);
    const paymentMethod = this.extractFieldValue(payment.paymentMethod);

    // Extract discount information
    const discountPercentage = payment.discountPercentage ? this.extractFieldValue(payment.discountPercentage) : undefined;
    const discountDays = payment.discountDays ? this.extractFieldValue(payment.discountDays) : undefined;
    const discountDueDate = payment.discountDueDate ? this.extractFieldValue(payment.discountDueDate) : undefined;
    const discountedTotal = payment.discountedTotal ? this.extractFieldValue(payment.discountedTotal) : undefined;

    // Extract extended payment fields (all optional)
    const paidAt = this.extractFieldValue(payment.paidAt) || this.extractFieldValue(payment.paymentDate);
    const paymentConditionsId = this.extractFieldValue(payment.paymentConditionsId);
    const paymentOrder = this.extractFieldValue(payment.paymentOrder);

    // Second discount tier
    const discountAmount2 = this.extractFieldValue(payment.discountAmount2);
    const discountPercentage2 = this.extractFieldValue(payment.discountPercentage2);
    const discountPaymentDate2 = this.extractFieldValue(payment.discountPaymentDate2);

    // Banking fields
    const bankCode = this.extractFieldValue(payment.bankCode);
    const bankCountry = this.extractFieldValue(payment.bankCountry);
    const swiftCode = this.extractFieldValue(payment.swiftCode) || this.extractFieldValue(payment.bic);

    // Exchange rate
    const exchangeRate = this.extractFieldValue(payment.exchangeRate);

    const isInvoiceAlreadyPaid = this.extractFieldValue(payment.isInvoiceAlreadyPaid);
    const invoicePaidAtDate = this.extractFieldValue(payment.invoicePaidAtDate);

    return {
      bankAccount,     // Account number only (extracted from IBAN)
      iban,            // Full IBAN
      dueDate: dueDate ? formatDateForDatev(dueDate) : undefined,
      paymentTermsText: paymentTerms,
      paymentMethod,
      // Discount fields
      discountPercentage,
      discountDays,
      discountDueDate: discountDueDate ? formatDateForDatev(discountDueDate) : undefined,
      discountedTotal,
      // Extended fields (only included if present)
      paidAt: paidAt ? formatDateForDatev(paidAt) : undefined,
      paymentConditionsId,
      paymentOrder,
      discountAmount2,
      discountPercentage2,
      discountPaymentDate2: discountPaymentDate2 ? formatDateForDatev(discountPaymentDate2) : undefined,
      bankCode,
      bankCountry,
      swiftCode,
      exchangeRate,
      isInvoiceAlreadyPaid,
      invoicePaidAtDate
    };
  }

  /**
   * Extract and transform line items
   */
  private extractLineItems(llmData: LLMDataInput): LineItem[] {
    const lineItemsSection = llmData.lineItems?.value?.items;

    if (!lineItemsSection || !lineItemsSection.value) {
      return [];
    }

    const items: LineItemData[] = lineItemsSection.value;

    return items.map((item, index) => {
      const description = this.extractFieldValue(item.description) || '';
      const quantityValue = this.extractFieldValue(item.quantity);
      const unitPrice = this.extractFieldValue(item.unitPrice);
      const totalPrice = this.extractFieldValue(item.totalPrice);
      const vatRate = this.extractFieldValue(item.vatRate);
      const vatAmount = this.extractFieldValue(item.vatAmount);
      const sachkonto = this.extractFieldValue(item.Sachkonto);
      const buKey = this.extractFieldValue(item.buKey);

      // Extract extended line item fields (all optional)
      const bookingText = this.extractFieldValue(item.bookingText);
      const information = this.extractFieldValue(item.information);
      const costCenter = this.extractFieldValue(item.costCenter);
      const costCategory = this.extractFieldValue(item.costCategoryId);
      const costAmount = this.extractFieldValue(item.costAmount);
      const typeOfReceivable = this.extractFieldValue(item.typeOfReceivable);
      const internalInvoiceId = this.extractFieldValue(item.internalInvoiceId);
      const orderId = this.extractFieldValue(item.orderId);
      const unit = this.extractFieldValue(item.unit);

      const accountName = this.extractFieldValue(item.accountName);

      // Parse values (use ?? to preserve 0 as valid quantity)
      const quantity = parseGermanNumber(quantityValue) ?? 1;
      const rate = parseGermanNumber(vatRate);

      // UPDATED LOGIC: Handle both scenarios
      // Scenario 1: vatAmount is provided → totalPrice is NET, use provided vatAmount
      // Scenario 2: vatAmount is missing → totalPrice is GROSS, calculate NET and VAT

      let netUnitPrice: number;
      let netAmount: number;
      let taxAmount: number;
      let grossAmount: number;

      const parsedVatAmount = vatAmount ? parseGermanNumber(vatAmount) : null;
      const parsedTotalPrice = parseGermanNumber(totalPrice);
      const parsedUnitPrice = parseGermanNumber(unitPrice);

      if (parsedVatAmount !== null && parsedVatAmount !== undefined) {
        // Scenario 1: vatAmount provided → totalPrice is NET
        netAmount = parsedTotalPrice;
        taxAmount = parsedVatAmount;
        grossAmount = roundCurrency(netAmount + taxAmount);
        netUnitPrice = roundCurrency(parsedUnitPrice); // unitPrice is already NET
      } else {
        // Scenario 2: vatAmount missing → totalPrice is GROSS, calculate backwards
        grossAmount = parsedTotalPrice;
        netUnitPrice = roundCurrency(parsedUnitPrice / (1 + (rate / 100)));
        netAmount = roundCurrency(quantity * netUnitPrice);
        taxAmount = roundCurrency(grossAmount - netAmount);
      }

      return {
        lineNumber: index + 1,
        description,
        quantity: quantity,
        unit,
        unitPriceNet: netUnitPrice,
        lineNetAmount: netAmount,
        vatRate: rate,
        lineTaxAmount: taxAmount,
        lineGrossAmount: grossAmount,
        buKey: buKey ? String(buKey) : undefined,
        suggestedGLAccount: sachkonto,
        // Extended fields (only included if present)
        bookingText,
        information,
        costCenter,
        costCategory,
        costAmount: costAmount ? parseGermanNumber(costAmount) : undefined,
        typeOfReceivable,
        internalInvoiceId,
        orderId,
        accountName
      };
    });
  }

  /**
   * Extract summary/totals information
   */
  private extractSummaryInfo(llmData: LLMDataInput): {
    netAmount: number;
    totalTax: number;
    grossAmount: number;
    currency: string;
  } {
    const summary = llmData.summary?.value;

    const subTotal = this.extractFieldValue(summary?.subTotal);
    const totalTax = this.extractFieldValue(summary?.totalTax);
    const invoiceTotal = this.extractFieldValue(summary?.invoiceTotal);
    const currencyShortForm = this.extractFieldValue(summary?.currencyShortForm) || DEFAULT_VALUES.currency;

    return {
      netAmount: parseGermanNumber(subTotal),
      totalTax: parseGermanNumber(totalTax),
      grossAmount: parseGermanNumber(invoiceTotal),
      currency: currencyShortForm
    };
  }

  /**
   * Extract value from LLM field structure with confidence check
   */
  private extractFieldValue<T = any>(field: LLMField<T> | undefined): T | undefined {
    if (!field) {
      return undefined;
    }

    const confidence = parseFloat(field.confidence || '0');

    // If confidence is below threshold, return undefined (treat as missing)
    if (confidence < this.confidenceThreshold && confidence > 0) {
      console.warn(`Field at path ${field.path} has low confidence: ${confidence}`);
      // Still return the value but log warning
      // In strict mode, you could return undefined here
    }

    return field.value;
  }

  /**
   * Derive VAT case from BU keys and supplier country
   */
  private deriveVATCase(lineItems: LineItem[], country: string): string {
    if (lineItems.length === 0) {
      return 'Inland19'; // Default
    }

    // Get the first BU key (assuming all lines have same VAT treatment for now)
    const firstBUKey = lineItems[0].buKey;
    const buKeyInfo = getBUKeyInfo(firstBUKey);

    if (buKeyInfo) {
      return buKeyInfo.vatCase;
    }

    // Fallback logic based on country
    if (country === 'DE') {
      return lineItems[0].vatRate === 19 ? 'Inland19' : 'Inland7';
    }

    return 'Inland19'; // Default fallback
  }

  /**
   * Determine primary tax rate from line items
   */
  private determinePrimaryTaxRate(lineItems: LineItem[]): number {
    if (lineItems.length === 0) {
      return 19; // Default
    }

    // Return the most common VAT rate
    const rateCounts = lineItems.reduce((acc, item) => {
      acc[item.vatRate] = (acc[item.vatRate] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const sortedRates = Object.entries(rateCounts).sort((a, b) => b[1] - a[1]);
    return parseFloat(sortedRates[0][0]);
  }

  /**
   * Determine offset/GL account from line items
   */
  private determineOffsetAccount(lineItems: LineItem[]): string {
    // Use the first suggested GL account from line items
    const firstSuggested = lineItems.find(item => item.suggestedGLAccount);
    return firstSuggested?.suggestedGLAccount || DATEV_CONFIG.defaultOffsetAccount;
  }

  /**
   * Set confidence threshold
   */
  public setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = threshold;
  }
}
