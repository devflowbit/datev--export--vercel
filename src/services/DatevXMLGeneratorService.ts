/**
 * DATEV XML Generator Service
 * Generates DATEV v5.0 compliant XML from templates
 */

import * as fs from 'fs';
import * as path from 'path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { DatevDocument, LineItem, TaxLine, SupplierInfo } from '../models/DatevDocument.interface';
import { escapeXml, formatNumberForXml, formatDateForDatev, formatDateTimeForDatev, processConditionals, replacePlaceholders } from '../utils/xmlHelper';
import { DATEV_CONFIG } from '../config/datevConfig';
import {
  calculateFiscalYear,
  calculateFiscalYearStart,
  calculatePeriodStart,
  calculatePeriodEnd,
  generateTaxLines,
  extractSkonto
} from '../utils/datevCalculations';

export class DatevXMLGeneratorService {
  private templateCache: Map<string, string> = new Map();

  /**
   * Generate DATEV Ledger Import XML (v6.0) - DATEV Compliant
   * Uses the Belegverwaltung_online_ledger_import_v060.xsd schema
   */
  public generateLedgerImportXML(datevDoc: DatevDocument): string {
    // Load ledger import template
    const template = this.loadTemplate('ledger_import_v060.xml');

    // CRITICAL: Swap supplier/customer for outgoing invoices
    // - Incoming: vendor = supplier (in LLM), customer = you
    // - Outgoing: vendor = customer (in XML), customer = supplier (in XML)
    // - CreditNote: behaves like incoming (vendor = supplier)
    const isOutgoing = datevDoc.documentDirection === 'outgoing';
    const isCreditNote = datevDoc.documentDirection === 'creditNote';
    const xmlSupplier = isOutgoing ? datevDoc.customer : datevDoc.supplier;
    const xmlCustomer = isOutgoing ? datevDoc.supplier : datevDoc.customer;

    // Use swapped parties for XML generation
    const effectiveSupplier = xmlSupplier || datevDoc.supplier;
    const effectiveCustomer = xmlCustomer;

    // CRITICAL: Calculate consolidatedAmount from line items to ensure mathematical consistency
    // DATEV validates that consolidatedAmount EXACTLY equals sum of all line item amounts
    // Using LLM-extracted total can cause rounding mismatches
    const consolidatedAmount = datevDoc.lineItems.reduce((sum, item) => {
      const lineGross = item.lineGrossAmount || (item.lineNetAmount + (item.lineTaxAmount || 0));
      return sum + lineGross;
    }, 0);

    // Determine delivery date strategy:
    // RULES:
    // 1. All lines have SAME deliveryDate → BOTH consolidatedDeliveryDate AND per-line deliveryDate
    // 2. Lines have DIFFERENT deliveryDates → Per-line deliveryDate only, NO consolidated
    // 3. Some lines have deliveryDate, some don't → deliveryDate only where present, NO consolidated
    // 4. NO lines have deliveryDate → NO deliveryDate anywhere (not in consolidated, not in lines)
    // CRITICAL: NEVER use serviceDate as fallback - deliveryDate is definitive!

    const lineDeliveryDates = datevDoc.lineItems
      .map(item => item.deliveryDate)
      .filter(date => date !== undefined && date !== null && date !== '');

    // Check if ALL lines have deliveryDate AND all are the same
    const allLinesHaveDate = lineDeliveryDates.length === datevDoc.lineItems.length;
    const allSameDate = allLinesHaveDate && lineDeliveryDates.every(date => date === lineDeliveryDates[0]);

    // Only use consolidated if ALL lines have the SAME date
    const consolidatedDeliveryDate = allSameDate ? lineDeliveryDates[0] : undefined;

    console.log(`[DATEV] Delivery Date Strategy: Lines with dates: ${lineDeliveryDates.length}/${datevDoc.lineItems.length}`);
    if (consolidatedDeliveryDate) {
      console.log(`[DATEV] Consolidated Delivery Date: ${consolidatedDeliveryDate} (all lines match)`);
    } else if (lineDeliveryDates.length > 0) {
      console.log(`[DATEV] Per-line delivery dates only (mixed or different dates)`);
    } else {
      console.log(`[DATEV] No delivery dates present`);
    }

    // Generate ledger line items XML (accountsPayableLedger elements)
    // Pass consolidatedDeliveryDate only if set (ensures per-line dates match when both present)
    // NEVER pass serviceDate - deliveryDate is definitive!
    const lineItemsXML = this.generateLedgerLineItemsXML(
      datevDoc.lineItems,
      datevDoc.documentDate,
      datevDoc.documentNumber,
      datevDoc.currency,
      effectiveSupplier, // Use effective supplier (swapped for outgoing)
      datevDoc.vendorAccountNumber || DATEV_CONFIG.defaultVendorAccountNumber,
      datevDoc.documentDirection, // Pass document direction for conditional logic
      datevDoc.payment?.iban || effectiveSupplier?.iban,
      datevDoc.dueDate,
      {
        discountPercentage: datevDoc.payment?.discountPercentage,
        discountDays: datevDoc.payment?.discountDays,
        discountDueDate: datevDoc.payment?.discountDueDate,
        discountedTotal: datevDoc.payment?.discountedTotal,
        discountAmount2: datevDoc.payment?.discountAmount2,
        discountPercentage2: datevDoc.payment?.discountPercentage2,
        discountPaymentDate2: datevDoc.payment?.discountPaymentDate2,
        paymentTerms: datevDoc.payment?.paymentTermsText
      },
      datevDoc.payment, // Pass entire payment object for additional fields
      consolidatedDeliveryDate, // Only passed if all lines have same date, otherwise undefined
      datevDoc.ownVatId, // Own VAT ID (Order 15)
      datevDoc.customer?.country, // Destination country (Order 21)
      datevDoc.payment?.invoicePaidAtDate,
      datevDoc.payment?.isInvoiceAlreadyPaid,
      datevDoc.orderId
    );

    // Helper for safe toFixed in logging
    const safeToFixed = (val: number | undefined | null, decimals: number = 2): string => {
      return typeof val === 'number' && !isNaN(val) ? val.toFixed(decimals) : '0.00';
    };

    // Validation logging
    console.log(`[DATEV VALIDATION] Consolidated Amount: ${safeToFixed(consolidatedAmount)}`);
    console.log(`[DATEV VALIDATION] Line Items Count: ${datevDoc.lineItems.length}`);
    datevDoc.lineItems.forEach((item, idx) => {
      const
        gross = item.lineGrossAmount || (item.lineNetAmount + (item.lineTaxAmount || 0));
      console.log(`[DATEV VALIDATION] Line ${idx + 1}: ${safeToFixed(gross)}`);
    });
    const calculatedSum = datevDoc.lineItems.reduce((s, i) =>
      s + (i.lineGrossAmount || (i.lineNetAmount + (i.lineTaxAmount || 0))), 0);
    console.log(`[DATEV VALIDATION] Sum Verification: ${safeToFixed(calculatedSum)}`);
    console.log(`[DATEV VALIDATION] Match: ${Math.abs(calculatedSum - consolidatedAmount) < 0.001 ? '✓ PASS' : '✗ FAIL'}`);

    // Prepare placeholders for ledger import
    const placeholders: Record<string, any> = {
      GENERATOR_INFO: DATEV_CONFIG.generatingSystem,
      GENERATING_SYSTEM: DATEV_CONFIG.generatingSystem,
      GROSS_AMOUNT: formatNumberForXml(consolidatedAmount), // Use calculated amount, not extracted
      DOCUMENT_DATE: formatDateForDatev(datevDoc.documentDate),
      DOCUMENT_NUMBER: datevDoc.documentNumber,
      CURRENCY: datevDoc.currency,
      SERVICE_DATE: consolidatedDeliveryDate ? formatDateForDatev(consolidatedDeliveryDate) : '', // Only use if all lines have same date
      LINE_ITEMS_XML: lineItemsXML
    };

    // Process conditional blocks
    let xml = template;
    let previousXml = '';
    let iterations = 0;
    const maxIterations = 10;

    while (xml !== previousXml && iterations < maxIterations) {
      previousXml = xml;
      xml = processConditionals(xml, placeholders);
      iterations++;
    }

    // Replace LINE_ITEMS_XML WITHOUT escaping (it's already valid XML)
    xml = xml.replace(/{{LINE_ITEMS_XML}}/g, lineItemsXML);

    // Replace all other placeholders WITH escaping
    const placeholdersWithoutXML = { ...placeholders };
    delete placeholdersWithoutXML.LINE_ITEMS_XML;
    xml = replacePlaceholders(xml, placeholdersWithoutXML, true);

    // Clean up
    xml = this.cleanupXML(xml);

    // Validate XML structure
    const validation = this.validateXML(xml);
    if (!validation.valid) {
      throw new Error(`Generated invalid Ledger Import XML: ${validation.error}\n\nGenerated XML:\n${xml}`);
    }

    return xml;
  }

  /**
   * Generate DATEV XML from document (v6.0) - DEPRECATED
   * This method uses the old Document schema which is incorrect for invoice data
   * Use generateLedgerImportXML() instead
   */
  public generateXML(datevDoc: DatevDocument): string {
    // Load v6.0 template
    const template = this.loadTemplate('datev_invoice_v6.xml');

    // CRITICAL: Swap supplier/customer for outgoing invoices
    const isOutgoing = datevDoc.documentDirection === 'outgoing';
    const xmlSupplier = isOutgoing ? datevDoc.customer : datevDoc.supplier;
    const xmlCustomer = isOutgoing ? datevDoc.supplier : datevDoc.customer;

    const effectiveSupplier = xmlSupplier || datevDoc.supplier;
    const effectiveCustomer = xmlCustomer;

    // Calculate auto-fields
    const fiscalYear = datevDoc.fiscalYear || calculateFiscalYear(datevDoc.documentDate);
    const fiscalYearStart = datevDoc.fiscalYearStart || calculateFiscalYearStart(datevDoc.documentDate);
    const periodStart = datevDoc.periodStart || calculatePeriodStart(datevDoc.documentDate);
    const periodEnd = datevDoc.periodEnd || calculatePeriodEnd(datevDoc.documentDate);
    const recordCount = datevDoc.recordCount || 1;

    // Generate tax lines if we have line items
    const taxLines = datevDoc.taxLines || generateTaxLines(datevDoc.lineItems);
    const taxLinesXML = this.generateTaxLinesXML(taxLines);

    // Extract skonto if available
    const skonto = datevDoc.payment?.paymentTermsText ? extractSkonto(datevDoc.payment.paymentTermsText) : null;

    // Build line items XML
    const lineItemsXML = this.generateLineItemsXML(datevDoc.lineItems);

    // Check if we have ANY payment data (for conditional wrapper)
    const hasPaymentData = !!(
      datevDoc.payment?.bankAccount ||
      datevDoc.payment?.iban ||
      datevDoc.payment?.paymentTermsText ||
      datevDoc.payment?.paymentMethod ||
      datevDoc.paymentCondition ||
      skonto
    );

    // Prepare comprehensive placeholder data (v6.0)
    const placeholders: Record<string, any> = {
      // System info
      GENERATING_SYSTEM: DATEV_CONFIG.generatingSystem,
      SYSTEM_VERSION: datevDoc.systemVersion || DATEV_CONFIG.systemVersion,
      EXPORT_DATE: formatDateTimeForDatev(),

      // Header - auto-calculated fields
      FISCAL_YEAR: fiscalYear,
      FISCAL_YEAR_START: fiscalYearStart,
      PERIOD_START: periodStart,
      PERIOD_END: periodEnd,
      RECORD_COUNT: recordCount,
      ADVISOR_NUMBER: datevDoc.advisorNumber || DATEV_CONFIG.advisorNumber,
      CLIENT_NUMBER: datevDoc.clientNumber || DATEV_CONFIG.clientNumber,
      CLIENT_ID: datevDoc.clientID || '',
      CONSULTANT_NUMBER: datevDoc.consultantNumber || DATEV_CONFIG.consultantNumber || '',
      TEST_MODE: datevDoc.testMode || false,

      // Document GUID
      DOCUMENT_GUID: datevDoc.documentGuid || '',

      // Document Type
      DOCUMENT_TYPE: datevDoc.documentType,
      DOCUMENT_CATEGORY: datevDoc.documentCategory || DATEV_CONFIG.defaultDocumentCategory,
      INVOICE_TYPE_CODE: datevDoc.invoiceTypeCode || DATEV_CONFIG.defaultInvoiceTypeCode,

      // Base Information
      DOCUMENT_NUMBER: datevDoc.documentNumber,
      DOCUMENT_DATE: formatDateForDatev(datevDoc.documentDate),
      SERVICE_DATE: datevDoc.serviceDate ? formatDateForDatev(datevDoc.serviceDate) : '',
      DUE_DATE: datevDoc.dueDate ? formatDateForDatev(datevDoc.dueDate) : '',
      CURRENCY: datevDoc.currency,
      EXCHANGE_RATE: datevDoc.exchangeRate ? formatNumberForXml(datevDoc.exchangeRate, 4) : '',
      BUSINESS_AREA: datevDoc.businessArea || '',

      // Vendor - complete v6.0 structure (uses effectiveSupplier for swap)
      VENDOR_ACCOUNT_NUMBER: datevDoc.vendorAccountNumber || DATEV_CONFIG.defaultVendorAccountNumber,
      VENDOR_BP_ACCOUNT: datevDoc.vendorBpAccount || '',
      VENDOR_NAME: effectiveSupplier?.name || '',
      VENDOR_NAME_2: datevDoc.vendorName2 || '',
      VENDOR_INTERNAL_ID: datevDoc.supplierInternalId || '',
      VENDOR_STREET: effectiveSupplier?.street || '',
      VENDOR_POSTAL_CODE: effectiveSupplier?.postalCode || '',
      VENDOR_CITY: effectiveSupplier?.city || '',
      VENDOR_COUNTRY: effectiveSupplier?.country || '',
      VENDOR_VAT_ID: effectiveSupplier?.vatId || '',
      VENDOR_TAX_NUMBER: datevDoc.vendorTaxNumber || '',
      VENDOR_GERMAN_TAX_NUMBER: effectiveSupplier?.germanTaxNumber || '',
      VENDOR_EMAIL: effectiveSupplier?.email || '',
      VENDOR_PHONE: effectiveSupplier?.phone || '',
      VENDOR_IBAN: effectiveSupplier?.iban || '',
      VENDOR_BIC: effectiveSupplier?.bic || '',

      // Customer - complete v6.0 structure (uses effectiveCustomer for swap)
      CUSTOMER_ACCOUNT_NUMBER: datevDoc.customerAccountNumber || DATEV_CONFIG.defaultCustomerAccountNumber,
      CUSTOMER_BP_ACCOUNT: datevDoc.customerBpAccount || '',
      CUSTOMER_NAME: effectiveCustomer?.name || datevDoc.customerName || DATEV_CONFIG.generatingSystem,
      CUSTOMER_NAME_2: datevDoc.customerName2 || '',
      CUSTOMER_VAT_ID: effectiveCustomer?.vatId || datevDoc.customerVatId || '',
      CUSTOMER_ADDRESS: !!(effectiveCustomer?.street && effectiveCustomer?.city),
      CUSTOMER_STREET: effectiveCustomer?.street || datevDoc.customerStreet || '',
      CUSTOMER_POSTAL_CODE: effectiveCustomer?.postalCode || datevDoc.customerPostalCode || '',
      CUSTOMER_CITY: effectiveCustomer?.city || datevDoc.customerCity || '',
      CUSTOMER_COUNTRY: effectiveCustomer?.country || datevDoc.customerCountry || '',

      // Line Items
      LINE_ITEMS_XML: lineItemsXML,

      // Summary/Totals
      NET_AMOUNT: formatNumberForXml(datevDoc.netAmount),
      TAX_AMOUNT: formatNumberForXml(datevDoc.totalTax),
      GROSS_AMOUNT: formatNumberForXml(datevDoc.grossAmount),

      // Tax Lines
      HAS_TAX_LINES: taxLines.length > 0,
      TAX_LINES_XML: taxLinesXML,

      // VAT
      VAT_CASE: datevDoc.vatCase,
      TAX_RATE: formatNumberForXml(datevDoc.taxRate, 0),
      REVERSE_CHARGE_NOTE: datevDoc.reverseChargeNote || '',
      INTRA_EU_NOTE: datevDoc.intraEUNote || '',

      // Payment - comprehensive v6.0
      PAYMENT_DATA: hasPaymentData,
      BANK_ACCOUNT: datevDoc.payment?.bankAccount || '',
      IBAN: datevDoc.payment?.iban || '',
      BIC: datevDoc.supplier.bic || '',
      PAYMENT_TERMS_TEXT: datevDoc.payment?.paymentTermsText || '',
      PAYMENT_METHOD: datevDoc.payment?.paymentMethod || '',
      PAYMENT_CONDITION: datevDoc.paymentCondition || '',
      SKONTO_PERCENT: skonto ? formatNumberForXml(skonto.percent, 2) : '',
      SKONTO_DAYS: skonto ? skonto.days : '',
      PAYMENT_DEADLINE: datevDoc.paymentDeadline || '',
      PAYMENT_REFERENCE: datevDoc.paymentReference || '',

      // Booking - complete v6.0
      CREDITOR_ACCOUNT: datevDoc.creditorAccount || DATEV_CONFIG.defaultCreditorAccount,
      OFFSET_ACCOUNT: datevDoc.offsetAccount || DATEV_CONFIG.defaultOffsetAccount,
      POSTING_KEY: datevDoc.postingKey || DATEV_CONFIG.defaultPostingKey,
      BOOKING_TEXT: datevDoc.bookingText || `Invoice ${datevDoc.documentNumber}`,
      OPOS_FLAG: datevDoc.oposFlag ? 'true' : '',
      COST_CENTER: datevDoc.costCenter || '',
      COST_OBJECT: datevDoc.costObject || '',

      // References
      EXTERNAL_REFERENCE: datevDoc.externalReference || `invoice:${datevDoc.documentNumber}`,
      PURCHASE_ORDER_NUMBER: datevDoc.purchaseOrderNumber || '',
      DELIVERY_NOTE_NUMBER: datevDoc.deliveryNoteNumber || '',
      DOCUMENT_FIELD_1: datevDoc.documentField1 || '',
      DOCUMENT_FIELD_2: datevDoc.documentField2 || '',

      // International
      INTERNATIONAL_SECTION: !!(datevDoc.intraEUGoodsAcquisition || datevDoc.euServiceReverseCharge || datevDoc.nonEUImport),
      INTRA_EU_GOODS: datevDoc.intraEUGoodsAcquisition ? 'true' : '',
      EU_SERVICE_RC: datevDoc.euServiceReverseCharge ? 'true' : '',
      NON_EU_IMPORT: datevDoc.nonEUImport ? 'true' : '',

      // Notes
      INTERNAL_NOTE: datevDoc.internalNote || ''
    };

    // Process conditional blocks iteratively until stable
    let xml = template;
    let previousXml = '';
    let iterations = 0;
    const maxIterations = 10; // Safety limit

    while (xml !== previousXml && iterations < maxIterations) {
      previousXml = xml;
      xml = processConditionals(xml, placeholders);
      iterations++;
    }

    if (iterations >= maxIterations) {
      console.warn('[DATEV XML Generator] Reached max iterations for conditional processing');
    }

    // Replace LINE_ITEMS_XML and TAX_LINES_XML WITHOUT escaping (they're already valid XML)
    xml = xml.replace(/{{LINE_ITEMS_XML}}/g, lineItemsXML);
    xml = xml.replace(/{{TAX_LINES_XML}}/g, taxLinesXML);

    // Replace all other placeholders WITH escaping
    const placeholdersWithoutXML = { ...placeholders };
    delete placeholdersWithoutXML.LINE_ITEMS_XML;
    delete placeholdersWithoutXML.TAX_LINES_XML;
    xml = replacePlaceholders(xml, placeholdersWithoutXML, true);

    // Clean up any remaining empty conditional blocks
    xml = this.cleanupXML(xml);

    // Validate XML structure before returning
    const validation = this.validateXML(xml);
    if (!validation.valid) {
      throw new Error(`Generated invalid XML: ${validation.error}\n\nGenerated XML:\n${xml}`);
    }

    return xml;
  }

  /**
   * Generate XML for line items section (v6.0 format)
   */
  private generateLineItemsXML(lineItems: LineItem[]): string {
    if (!lineItems || lineItems.length === 0) {
      return '';
    }

    const lineItemsXML = lineItems.map(item => {
      // Calculate gross amount
      const grossAmount = item.lineGrossAmount || (item.lineNetAmount + (item.lineTaxAmount || 0));

      const parts: string[] = [];

      parts.push('        <lineItem>');
      parts.push(`          <position>${item.lineNumber}</position>`);

      if (item.articleNumber) {
        parts.push(`          <articleNumber>${escapeXml(item.articleNumber)}</articleNumber>`);
      }

      parts.push(`          <description>${escapeXml(item.description)}</description>`);

      if (item.quantity !== undefined && item.quantity !== null) {
        parts.push(`          <quantity>${formatNumberForXml(item.quantity)}</quantity>`);
      }

      if (item.unit) {
        parts.push(`          <quantityUnit>${escapeXml(item.unit)}</quantityUnit>`);
      }

      parts.push(`          <unitPrice>${formatNumberForXml(item.unitPriceNet)}</unitPrice>`);
      parts.push(`          <netAmount>${formatNumberForXml(item.lineNetAmount)}</netAmount>`);
      parts.push(`          <taxRate>${formatNumberForXml(item.vatRate, 0)}</taxRate>`);

      if (item.lineTaxAmount !== undefined && item.lineTaxAmount !== null) {
        parts.push(`          <taxAmount>${formatNumberForXml(item.lineTaxAmount)}</taxAmount>`);
      }

      parts.push(`          <taxKey>${item.buKey}</taxKey>`);
      parts.push(`          <grossAmount>${formatNumberForXml(grossAmount)}</grossAmount>`);

      if (item.suggestedGLAccount) {
        parts.push(`          <accountNumber>${escapeXml(item.suggestedGLAccount)}</accountNumber>`);
      }

      if (item.bookingText) {
        parts.push(`          <bookingText>${escapeXml(item.bookingText)}</bookingText>`);
      }

      if (item.costCenter) {
        parts.push(`          <costCenter>${escapeXml(item.costCenter)}</costCenter>`);
      }

      if (item.costCategory) {
        parts.push(`          <costCategory>${escapeXml(item.costCategory)}</costCategory>`);
      }

      if (item.costObject) {
        parts.push(`          <costObject>${escapeXml(item.costObject)}</costObject>`);
      }

      parts.push('        </lineItem>');

      return parts.join('\n');
    });

    return lineItemsXML.join('\n');
  }

  /**
   * Generate XML for tax lines section (v6.0)
   */
  private generateTaxLinesXML(taxLines: TaxLine[]): string {
    if (!taxLines || taxLines.length === 0) {
      return '';
    }

    const taxLinesXML = taxLines.map(line => {
      const parts: string[] = [];

      parts.push('        <taxLine>');
      parts.push(`          <taxRate>${formatNumberForXml(line.rate, 0)}</taxRate>`);
      parts.push(`          <taxType>${escapeXml(line.type)}</taxType>`);
      parts.push(`          <taxableAmount>${formatNumberForXml(line.taxableAmount)}</taxableAmount>`);
      parts.push(`          <taxAmount>${formatNumberForXml(line.taxAmount)}</taxAmount>`);
      parts.push(`          <taxKey>${line.taxKey}</taxKey>`);
      parts.push('        </taxLine>');

      return parts.join('\n');
    });

    return taxLinesXML.join('\n');
  }

  /**
   * Generate Ledger Line Items XML (accountsPayableLedger elements) - DATA-DRIVEN APPROACH
   * Uses DATEV Ledger Import schema structure - flat format
   * Fields are included ONLY if they have values (no illogical discount-based conditionals)
   */
  private generateLedgerLineItemsXML(
    lineItems: LineItem[],
    documentDate: string,
    invoiceId: string,
    currency: string,
    supplier: SupplierInfo,
    bpAccountNo: string,
    documentDirection: 'incoming' | 'outgoing' | 'creditNote', // Support credit notes
    iban?: string,
    dueDate?: string,
    discountData?: {
      discountPercentage?: number;
      discountDays?: number;
      discountDueDate?: string;
      discountedTotal?: number;
      discountAmount2?: number;
      discountPercentage2?: number;
      discountPaymentDate2?: string;
      paymentTerms?: string;
    },
    payment?: any,
    serviceDate?: string,
    ownVatId?: string,
    shipToCountry?: string,
    paidAt?: string,
    isAlreadyPaid?: boolean,
    orderId?: string
  ): string {

    if (!lineItems || lineItems.length === 0) {
      return '';
    }

    const formattedDate = formatDateForDatev(documentDate);
    const formattedDueDate = dueDate ? formatDateForDatev(dueDate) : undefined;
    // serviceDate is ONLY used when consolidatedDeliveryDate is set (to ensure matching per-line dates)
    // It is the consolidatedDeliveryDate value, NOT document.serviceDate
    const consolidatedDateForLines = serviceDate ? formatDateForDatev(serviceDate) : undefined;

    // Helper function to check if discount data has meaningful values
    // Skip entire discount block if percentage and amount are 0 or missing
    const hasValidDiscountData = (data?: typeof discountData): boolean => {
      if (!data) return false;
      // Check if any discount percentage or amount has a non-zero value
      const hasPercentage = typeof data.discountPercentage === 'number' && data.discountPercentage > 0;
      const hasPercentage2 = typeof data.discountPercentage2 === 'number' && data.discountPercentage2 > 0;
      const hasAmount2 = typeof data.discountAmount2 === 'number' && data.discountAmount2 > 0;
      const hasDiscountedTotal = typeof data.discountedTotal === 'number' && data.discountedTotal > 0;
      return hasPercentage || hasPercentage2 || hasAmount2 || hasDiscountedTotal;
    };

    // Calculate discount amount ONLY if discount percentage is valid (non-zero)
    const grossTotal = lineItems.reduce((sum, item) =>
      sum + (item.lineGrossAmount || (item.lineNetAmount + (item.lineTaxAmount || 0))), 0);

    // Only calculate discount if there's a valid (non-zero) percentage
    const hasValidDiscount = hasValidDiscountData(discountData);
    const discountAmount = (hasValidDiscount && discountData?.discountPercentage && discountData.discountPercentage > 0)
      ? (grossTotal * discountData.discountPercentage / 100)
      : undefined;

    // Determine ledger element name and party field names based on document direction
    // Credit notes behave like incoming invoices (accounts payable)
    const effectiveDirection = documentDirection === 'creditNote' ? 'incoming' : documentDirection;
    const ledgerElementName = effectiveDirection === 'incoming' ? 'accountsPayableLedger' : 'accountsReceivableLedger';
    const partyNameField = effectiveDirection === 'incoming' ? 'supplierName' : 'customerName';
    const partyCityField = effectiveDirection === 'incoming' ? 'supplierCity' : 'customerCity';

    // Get booking text prefix based on direction
    // Generate one ledger element per unique tax rate
    // Filter items to remove the items with 0 amount, then consolidate by vatRate
    const filteredItems = lineItems.filter((item) => item.lineNetAmount !== 0);

    // Consolidate line items by unique vatRate
    const vatRateGroups = new Map<number, LineItem[]>();
    for (const item of filteredItems) {
      const rate = item.vatRate;
      if (!vatRateGroups.has(rate)) {
        vatRateGroups.set(rate, []);
      }
      vatRateGroups.get(rate)!.push(item);
    }

    const consolidatedItems: LineItem[] = Array.from(vatRateGroups.values()).map(group => {
      const first = group[0];
      return {
        ...first,
        lineNetAmount: group.reduce((sum, i) => sum + i.lineNetAmount, 0),
        lineTaxAmount: group.reduce((sum, i) => sum + (i.lineTaxAmount || 0), 0),
        lineGrossAmount: group.reduce((sum, i) => sum + (i.lineGrossAmount || (i.lineNetAmount + (i.lineTaxAmount || 0))), 0),
      };
    });

    const ledgerElements = consolidatedItems.map(item => {
      const lineGross = item.lineGrossAmount || (item.lineNetAmount + (item.lineTaxAmount || 0));

      // Use line-specific deliveryDate if present
      // CRITICAL: If consolidatedDeliveryDate is set, consolidatedDateForLines ensures matching
      // If item has no deliveryDate and consolidatedDeliveryDate is NOT set → NO deliveryDate in XML
      const lineDeliveryDate = item.deliveryDate
        ? formatDateForDatev(item.deliveryDate)
        : consolidatedDateForLines; // Will be undefined if no consolidated date

      // Build ordered field list (Order 1-41 per DATEV schema)
      // Only fields with values will be included
      const fields = [
        // Order 1-3: Core transaction
        { order: 1, element: 'date', value: formattedDate },
        { order: 2, element: 'amount', value: formatNumberForXml(lineGross) },
        { order: 3, element: 'discountAmount', value: discountAmount ? formatNumberForXml(discountAmount) : undefined },

        // Order 4-8: GL Account & Cost
        { order: 4, element: 'accountNo', value: item.suggestedGLAccount }, // NO discount condition!
        { order: 5, element: 'buCode', value: item.buKey }, // NO discount condition!
        // { order: 6, element: 'costAmount', value: item.costAmount ? formatNumberForXml(item.costAmount) : undefined },
        { order: 7, element: 'costCategoryId', value: item.costCategory },
        // { order: 8, element: 'costCategoryId2', value: item.costCategory },

        // Order 9-13: Tax & Description
        { order: 9, element: 'tax', value: formatNumberForXml(item.vatRate, 2) },
        { order: 10, element: 'information', value: item.information ? item.information.substring(0, 120) : undefined },
        { order: 11, element: 'currencyCode', value: currency },
        { order: 12, element: 'invoiceId', value: invoiceId },
        { order: 13, element: 'bookingText', value: item.bookingText ? item.bookingText.substring(0, 30) : undefined }, // NO discount condition!

        // Order 14-21: Party, VAT & Shipping
        // { order: 14, element: 'typeOfReceivable', value: item.typeOfReceivable },
        { order: 15, element: 'ownVatId', value: ownVatId },
        // { order: 16, element: 'shipFromCountry', value: supplier?.country },
        // { order: 17, element: 'partyId', value: (supplier?.vendorPartyNumber || bpAccountNo).replace(/[^a-zA-Z0-9]/g, "") }, // Use internalId for outgoing
        { order: 18, element: 'paidAt', value: isAlreadyPaid ? paidAt : null },
        // { order: 19, element: 'internalInvoiceId', value: item.internalInvoiceId },
        { order: 20, element: 'vatId', value: supplier?.vatId }, // NO discount condition!
        // { order: 21, element: 'shipToCountry', value: shipToCountry },

        // Order 22-27: Banking & Exchange
        // NOTE: bankCode, bankAccount, bankCountry are LEGACY fields (pre-IBAN)
        // DATEV requires BOTH bankCode AND bankAccount if using legacy format, or NEITHER
        // Modern SEPA standard uses IBAN + BIC only, which is what we provide
        // { order: 22, element: 'exchangeRate', value: payment?.exchangeRate ? formatNumberForXml(payment.exchangeRate, 6) : undefined },
        // Order 23-25: REMOVED - Legacy banking fields (bankCode, bankAccount, bankCountry)
        // DATEV Error: "Elemente bankCode/bankAccount entsprechen nicht der Spezifikation"
        // Solution: Use modern IBAN + BIC standard only
        { order: 26, element: 'iban', value: (iban || payment?.iban || supplier?.iban).replace(/ /g, "") },
        // { order: 27, element: 'swiftCode', value: payment?.swiftCode || supplier?.swiftCode },

        // Order 28-30: Account & Payment Terms
        { order: 28, element: 'accountName', value: item.accountName }, // TODO: Mandetory add from LLM
        // { order: 29, element: 'paymentConditionsId', value: payment?.paymentConditionsId },
        { order: 30, element: 'paymentOrder', value: isAlreadyPaid ? !isAlreadyPaid : null }, // Pass false if invoice is already paid, else skip this field

        // Order 31-35: Discount fields (ONLY included if discount data exists)
        { order: 31, element: 'discountPercentage', value: discountData?.discountPercentage ? formatNumberForXml(discountData.discountPercentage, 2) : undefined },
        { order: 32, element: 'discountPaymentDate', value: discountData?.discountDueDate ? formatDateForDatev(discountData.discountDueDate) : undefined },
        // { order: 33, element: 'discountAmount2', value: discountData?.discountAmount2 ? formatNumberForXml(discountData.discountAmount2) : undefined },
        // { order: 34, element: 'discountPercentage2', value: discountData?.discountPercentage2 ? formatNumberForXml(discountData.discountPercentage2, 2) : undefined },
        // { order: 35, element: 'discountPaymentDate2', value: discountData?.discountPaymentDate2 ? formatDateForDatev(discountData.discountPaymentDate2) : undefined },

        // Order 36-41: Due Date & References (CORRECTED ORDER per DATEV schema)
        { order: 36, element: 'dueDate', value: formattedDueDate },
        { order: 37, element: 'bpAccountNo', value: (supplier?.vendorPartyNumber || bpAccountNo).replace(/[^a-zA-Z0-9]/g, "") }, // MOVED: Must come BEFORE deliveryDate per DATEV schema
        { order: 38, element: 'deliveryDate', value: lineDeliveryDate }, // Line-specific or fallback delivery date
        { order: 39, element: 'orderId', value: orderId },
        // { order: 40, element: "paidAt", value: paidAt },
        // { order: 41, element: "paymentOrder", value: isAlreadyPaid }
        // Order 40-41: Party fields - CONDITIONAL based on document direction
        // Incoming: supplierName/supplierCity (vendor is supplier)
        // Outgoing: customerName/customerCity (vendor becomes customer in XML)
        // { order: 40, element: partyNameField, value: supplier?.name },
        // { order: 41, element: partyCityField, value: supplier?.city }
      ];

      // Filter out fields with undefined/null/empty values
      const presentFields = fields.filter(f =>
        f.value !== undefined &&
        f.value !== null &&
        f.value !== ''
      );

      // Sort by order (should already be sorted, but ensures correctness)
      presentFields.sort((a, b) => a.order - b.order);

      // Build XML with direction-specific ledger element name
      const parts: string[] = [`    <${ledgerElementName}>`];

      presentFields.forEach(field => {
        parts.push(`      <${field.element}>${escapeXml(String(field.value))}</${field.element}>`);
      });

      parts.push(`    </${ledgerElementName}>`);

      return parts.join('\n');
    });

    return ledgerElements.join('\n');
  }

  /**
   * Generate document mapping XML (document.xml) with v6.0 archive structure
   * This creates the administrative file that lists all files in the ZIP package
   */
  public generateDocumentMappingXML(
    pdfFilename: string,
    xmlFilename: string,
    documentGuid: string,
    documentDate: string,
    documentDirection: 'incoming' | 'outgoing' | 'creditNote',
    generatingSystem?: string,
    projectKuerzel?: string
  ): string {
    const template = this.loadTemplate('document_mapping.xml');

    // Calculate invoice month in YYYY-MM format for property key="1"
    const date = new Date(documentDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const invoiceMonth = `${year}-${month}`;

    // Determine document type text based on direction
    // Rechnungseingang = Incoming invoices (purchase/expense)
    // Rechnungsausgang = Outgoing invoices (sales/revenue)
    // Gutschrift = Credit note
    let documentTypeText: string;
    if (documentDirection === 'outgoing') {
      documentTypeText = 'Rechnungsausgang';
    } else if (documentDirection === 'creditNote') {
      documentTypeText = 'Gutschrift';
    } else {
      documentTypeText = 'Eingangsrechnungen';
    }

    // Determine ledger type based on direction
    // accountsPayableLedger = Incoming (money you owe to suppliers)
    // accountsReceivableLedger = Outgoing (money owed to you by customers)
    // Credit notes behave like incoming (accounts payable)
    const effectiveDirection = documentDirection === 'creditNote' ? 'incoming' : documentDirection;
    const ledgerType = effectiveDirection === 'outgoing' ? 'accountsReceivableLedger' : 'accountsPayableLedger';

    // Determine repository level 2 name based on project kürzel
    const repositoryLevelName = projectKuerzel || 'Allgemein';

    const placeholders = {
      GENERATING_SYSTEM: generatingSystem || DATEV_CONFIG.generatingSystem,
      EXPORT_DATE: formatDateTimeForDatev(),
      DOCUMENT_GUID: documentGuid,
      XML_FILENAME: xmlFilename,
      PDF_FILENAME: pdfFilename,
      INVOICE_MONTH: invoiceMonth,
      REPOSITORY_LEVEL_NAME: repositoryLevelName,
      DOCUMENT_TYPE_TEXT: documentTypeText,
      LEDGER_TYPE: ledgerType
    };

    // Process conditionals
    let xml = processConditionals(template, placeholders);

    // Replace placeholders
    xml = replacePlaceholders(xml, placeholders, true);

    return xml;
  }

  /**
   * Load template from file (with caching)
   */
  private loadTemplate(templateName: string): string {
    // Check cache first
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    // Determine template path
    const templatePath = path.join(process.cwd(), 'templates', templateName);

    // Read template file
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    const template = fs.readFileSync(templatePath, 'utf-8');

    // Cache it
    this.templateCache.set(templateName, template);

    return template;
  }

  /**
   * Clean up XML iteratively (remove empty lines, template artifacts, empty tags)
   * Uses iterative approach to ensure all artifacts are removed
   */
  private cleanupXML(xml: string): string {
    let cleaned = xml;
    let previousCleaned = '';
    let iterations = 0;
    const maxIterations = 10; // Safety limit

    // Iterate until stable (no more changes)
    while (cleaned !== previousCleaned && iterations < maxIterations) {
      previousCleaned = cleaned;

      // Step 1: Remove ALL template artifacts ({{...}})
      cleaned = cleaned.replace(/\{\{[^}]*\}\}/g, '');

      // Step 2: Remove empty tag pairs (tags with only whitespace inside)
      // Match <tag>whitespace</tag> and remove entirely
      cleaned = cleaned.replace(/<(\w+)>\s*<\/\1>/g, '');

      // Step 3: Remove lines that contain only whitespace
      cleaned = cleaned
        .split('\n')
        .filter(line => line.trim() !== '')
        .join('\n');

      // Step 4: Remove excessive newlines (max 2 consecutive)
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

      iterations++;
    }

    if (iterations >= maxIterations) {
      console.warn('[DATEV XML Generator] Reached max iterations for XML cleanup');
    }

    return cleaned;
  }

  /**
   * Validate XML structure
   */
  private validateXML(xml: string): { valid: boolean; error?: string } {
    try {
      // Use XMLValidator to check if XML is well-formed
      const validationResult = XMLValidator.validate(xml, {
        allowBooleanAttributes: true
      });

      if (validationResult === true) {
        return { valid: true };
      } else {
        // validationResult is an error object
        return {
          valid: false,
          error: `Line ${validationResult.err.line}: ${validationResult.err.msg}`
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Clear template cache (useful for testing)
   */
  public clearCache(): void {
    this.templateCache.clear();
  }
}
