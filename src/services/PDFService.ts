/**
 * PDF Service
 * Handles PDF acquisition: download from Azure Blob or generate fallback
 */

import { DatevDocument } from '../models/DatevDocument.interface';
import { DATEV_CONFIG } from '../config/datevConfig';

export interface PDFResult {
  success: boolean;
  pdfBuffer?: Buffer;
  source?: 'azure_download' | 'generated' | 'provided';
  error?: string;
}

// PDF download retry configuration
const PDF_DOWNLOAD_CONFIG = {
  maxRetries: 3,           // Maximum number of retry attempts
  initialDelayMs: 1000,    // Initial delay before first retry (1 second)
  maxDelayMs: 5000,        // Maximum delay between retries (5 seconds)
  backoffMultiplier: 2,    // Exponential backoff multiplier
};

export class PDFService {
  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get PDF buffer from SAS URL or generate fallback
   * Includes retry logic with exponential backoff for downloads
   */
  public async getPDF(pdfSasUrl?: string, invoiceData?: DatevDocument): Promise<PDFResult> {
    // Priority 1: Download from Azure if SAS URL provided (with retries)
    if (pdfSasUrl && pdfSasUrl.trim() !== '') {
      let lastError: string = '';
      let delay = PDF_DOWNLOAD_CONFIG.initialDelayMs;

      for (let attempt = 1; attempt <= PDF_DOWNLOAD_CONFIG.maxRetries; attempt++) {
        try {
          console.log(`📥 [PDF] Download attempt ${attempt}/${PDF_DOWNLOAD_CONFIG.maxRetries}`);
          console.log(`   SAS URL: ${pdfSasUrl.substring(0, 80)}...`);
          
          const downloadResult = await this.downloadFromAzureBlob(pdfSasUrl);
          
          if (downloadResult.success) {
            console.log(`✅ [PDF] Download successful on attempt ${attempt}`);
            console.log(`   Size: ${downloadResult.pdfBuffer?.length || 0} bytes`);
            return {
              success: true,
              pdfBuffer: downloadResult.pdfBuffer,
              source: 'azure_download'
            };
          } else {
            lastError = downloadResult.error || 'Unknown download error';
            console.warn(`⚠️ [PDF] Download attempt ${attempt} failed: ${lastError}`);
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          console.error(`❌ [PDF] Download attempt ${attempt} error: ${lastError}`);
        }

        // If not the last attempt, wait before retrying
        if (attempt < PDF_DOWNLOAD_CONFIG.maxRetries) {
          console.log(`⏳ [PDF] Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
          
          // Exponential backoff with max limit
          delay = Math.min(delay * PDF_DOWNLOAD_CONFIG.backoffMultiplier, PDF_DOWNLOAD_CONFIG.maxDelayMs);
        }
      }

      // All retries exhausted
      console.error(`❌ [PDF] All ${PDF_DOWNLOAD_CONFIG.maxRetries} download attempts failed. Last error: ${lastError}`);
      console.warn(`⚠️ [PDF] Falling back to PDF generation...`);
    }

    // Priority 2: Generate PDF from invoice data (fallback)
    if (invoiceData) {
      try {
        console.log(`🔧 [PDF] Generating fallback PDF from invoice data...`);
        const generatedBuffer = await this.generateInvoicePDF(invoiceData);
        console.log(`✅ [PDF] Generated fallback PDF: ${generatedBuffer.length} bytes`);
        return {
          success: true,
          pdfBuffer: generatedBuffer,
          source: 'generated'
        };
      } catch (error) {
        return {
          success: false,
          error: `PDF generation failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }

    return {
      success: false,
      error: 'No PDF source available (no SAS URL and no invoice data for generation)'
    };
  }

  /**
   * Download PDF from Azure Blob Storage using SAS URL
   */
  private async downloadFromAzureBlob(sasUrl: string): Promise<PDFResult> {
    try {
      console.log(`🌐 [PDF] Starting download from Azure Blob...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DATEV_CONFIG.pdfTimeout);

      const response = await fetch(sasUrl, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log(`📡 [PDF] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      // Get content type
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('pdf') && !contentType.includes('application/octet-stream')) {
        return {
          success: false,
          error: `Invalid content type: ${contentType}, expected application/pdf`
        };
      }

      // Get buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validate size
      if (buffer.length === 0) {
        return {
          success: false,
          error: 'Downloaded PDF is empty (0 bytes)'
        };
      }

      if (buffer.length > DATEV_CONFIG.maxPDFSizeBytes) {
        return {
          success: false,
          error: `PDF too large: ${buffer.length} bytes (max: ${DATEV_CONFIG.maxPDFSizeBytes})`
        };
      }

      // Basic PDF validation (check magic bytes)
      if (!this.isPDFBuffer(buffer)) {
        return {
          success: false,
          error: 'Downloaded file is not a valid PDF (invalid magic bytes)'
        };
      }

      return {
        success: true,
        pdfBuffer: buffer
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: `PDF download timeout after ${DATEV_CONFIG.pdfTimeout}ms`
        };
      }

      return {
        success: false,
        error: `Download error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Generate simple invoice PDF from DATEV document data (fallback)
   * Uses pdf-lib for basic PDF generation
   */
  private async generateInvoicePDF(invoiceData: DatevDocument): Promise<Buffer> {
    // Import pdf-lib dynamically
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

    // Create new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 800; // Start from top

    // Helper to draw text
    const drawText = (text: string, x: number, size: number = 10, bold: boolean = false) => {
      page.drawText(text, {
        x,
        y,
        size,
        font: bold ? boldFont : font,
        color: rgb(0, 0, 0)
      });
      y -= size + 5;
    };

    // Title
    drawText('INVOICE', 50, 20, true);
    y -= 10;

    // Invoice Details
    drawText(`Invoice Number: ${invoiceData.documentNumber}`, 50, 12, false);
    drawText(`Invoice Date: ${invoiceData.documentDate}`, 50, 12, false);
    if (invoiceData.dueDate) {
      drawText(`Due Date: ${invoiceData.dueDate}`, 50, 12, false);
    }
    y -= 10;

    // Supplier (From)
    drawText('From:', 50, 12, true);
    drawText(invoiceData.supplier.name, 50, 11, false);
    drawText(invoiceData.supplier.street, 50, 11, false);
    drawText(`${invoiceData.supplier.postalCode} ${invoiceData.supplier.city}`, 50, 11, false);
    drawText(invoiceData.supplier.country, 50, 11, false);
    if (invoiceData.supplier.vatId) {
      drawText(`VAT ID: ${invoiceData.supplier.vatId}`, 50, 11, false);
    }
    y -= 10;

    // Line Items Header
    drawText('Line Items:', 50, 12, true);
    y -= 5;

    // Table Header
    page.drawText('Description', { x: 50, y, size: 10, font: boldFont });
    page.drawText('Qty', { x: 350, y, size: 10, font: boldFont });
    page.drawText('Price', { x: 400, y, size: 10, font: boldFont });
    page.drawText('Amount', { x: 480, y, size: 10, font: boldFont });
    y -= 15;

    // Line Items
    invoiceData.lineItems.forEach(item => {
      if (y < 100) {
        // Add new page if needed
        const newPage = pdfDoc.addPage([595, 842]);
        y = 800;
      }

      const description = item.description.length > 40 ? item.description.substring(0, 37) + '...' : item.description;
      page.drawText(description, { x: 50, y, size: 9, font });
      page.drawText(item.quantity?.toString() || '1', { x: 350, y, size: 9, font });
      // Safe toFixed calls - ensure values are numbers
      const unitPrice = typeof item.unitPriceNet === 'number' ? item.unitPriceNet.toFixed(2) : '0.00';
      const lineAmount = typeof item.lineNetAmount === 'number' ? item.lineNetAmount.toFixed(2) : '0.00';
      page.drawText(unitPrice, { x: 400, y, size: 9, font });
      page.drawText(lineAmount, { x: 480, y, size: 9, font });
      y -= 12;
    });

    y -= 10;

    // Totals - safe toFixed calls
    const netAmountStr = typeof invoiceData.netAmount === 'number' ? invoiceData.netAmount.toFixed(2) : '0.00';
    const totalTaxStr = typeof invoiceData.totalTax === 'number' ? invoiceData.totalTax.toFixed(2) : '0.00';
    const grossAmountStr = typeof invoiceData.grossAmount === 'number' ? invoiceData.grossAmount.toFixed(2) : '0.00';
    drawText(`Net Amount: ${invoiceData.currency} ${netAmountStr}`, 350, 11, false);
    drawText(`VAT (${invoiceData.taxRate}%): ${invoiceData.currency} ${totalTaxStr}`, 350, 11, false);
    drawText(`Total: ${invoiceData.currency} ${grossAmountStr}`, 350, 12, true);

    // Footer
    y = 50;
    drawText('Generated by Flowbit DATEV Export System', 50, 8, false);

    // Serialize to bytes
    const pdfBytes = await pdfDoc.save();

    return Buffer.from(pdfBytes);
  }

  /**
   * Validate if buffer is a PDF file (check magic bytes)
   */
  private isPDFBuffer(buffer: Buffer): boolean {
    // PDF files start with "%PDF-"
    return buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';
  }
}
