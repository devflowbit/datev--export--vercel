/**
 * DATEV ZIP Packager Service
 * Creates DATEV-compliant ZIP package with PDF, XML, and document.xml
 */

import JSZip from 'jszip';
import { DatevXMLGeneratorService } from './DatevXMLGeneratorService';
import { DATEV_CONFIG } from '../config/datevConfig';

export interface ZipPackageResult {
  success: boolean;
  zipBuffer?: Buffer;
  zipBase64?: string;
  filename?: string;
  filesIncluded?: string[];
  error?: string;
}

export class DatevZipPackagerService {
  private xmlGenerator: DatevXMLGeneratorService;

  constructor() {
    this.xmlGenerator = new DatevXMLGeneratorService();
  }

  /**
   * Create DATEV-compliant ZIP package
   * Contains: invoice_{number}.pdf, invoice_{number}.xml, document.xml
   */
  public async createZipPackage(
    invoiceNumber: string,
    xmlContent: string,
    pdfBuffer: Buffer,
    documentGuid: string,
    documentDate: string,
    documentDirection: 'incoming' | 'outgoing' | 'creditNote' = 'incoming' // Support credit notes
  ): Promise<ZipPackageResult> {
    try {
      // Generate filenames
      const sanitizedInvoiceNumber = this.sanitizeFilename(invoiceNumber);
      const pdfFilename = `invoice_${sanitizedInvoiceNumber}.pdf`;
      const xmlFilename = `invoice_${sanitizedInvoiceNumber}.xml`;
      const zipFilename = `datev_export_${sanitizedInvoiceNumber}.zip`;

      // Create ZIP instance
      const zip = new JSZip();

      // Add PDF file
      zip.file(pdfFilename, pdfBuffer);

      // Add main XML file (Ledger Import format)
      zip.file(xmlFilename, xmlContent, {
        compression: 'DEFLATE'
      });

      // Generate and add document.xml (archive manifest) with v6.0 structure
      const documentMappingXml = this.xmlGenerator.generateDocumentMappingXML(
        pdfFilename,
        xmlFilename,
        documentGuid,
        documentDate, // Pass document date for invoice month calculation
        documentDirection, // Pass document direction for Rechnungseingang/Rechnungsausgang
        DATEV_CONFIG.generatingSystem
      );

      zip.file('document.xml', documentMappingXml, {
        compression: 'DEFLATE'
      });

      // Generate ZIP buffer
      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: {
          level: DATEV_CONFIG.compressionLevel
        }
      });

      // Convert to base64
      const zipBase64 = zipBuffer.toString('base64');

      return {
        success: true,
        zipBuffer,
        zipBase64,
        filename: zipFilename,
        filesIncluded: [pdfFilename, xmlFilename, 'document.xml']
      };
    } catch (error) {
      return {
        success: false,
        error: `ZIP package creation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Sanitize filename (remove special characters)
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9_-]/g, '_') // Replace special chars with underscore
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .substring(0, 50); // Limit length
  }

  /**
   * Validate ZIP package structure
   */
  public async validateZipPackage(zipBuffer: Buffer): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const zip = await JSZip.loadAsync(zipBuffer);

      // Check required files
      const files = Object.keys(zip.files);

      // Must have document.xml
      if (!files.includes('document.xml')) {
        errors.push('Missing required file: document.xml');
      }

      // Must have at least one PDF
      const pdfFiles = files.filter(f => f.endsWith('.pdf'));
      if (pdfFiles.length === 0) {
        errors.push('Missing PDF file');
      }

      // Must have at least one XML (besides document.xml)
      const xmlFiles = files.filter(f => f.endsWith('.xml') && f !== 'document.xml');
      if (xmlFiles.length === 0) {
        errors.push('Missing main XML file');
      }

      // Check ZIP is not empty
      if (files.length === 0) {
        errors.push('ZIP package is empty');
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`ZIP validation failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }
}
