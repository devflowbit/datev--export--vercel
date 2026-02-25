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
   * Build base filename from project kürzel, vendor name, and document date.
   * Format: {projectKuerzel}_{vendorName}_{dd.mm.yyyy}
   * Uses "Allgemein" as prefix when no project kürzel is available.
   */
  private buildBaseFilename(invoiceNumber: string, documentDate: string, vendorName?: string, projectKuerzel?: string): string {
    // Format date as dd.mm.yyyy
    const date = new Date(documentDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const formattedDate = `${day}.${month}.${year}`;

    // Use project kürzel or "Allgemein" as prefix
    const prefix = projectKuerzel || 'Allgemein';

    // Build parts: [prefix, vendorName, dd.mm.yyyy]
    const parts: string[] = [prefix];
    if (vendorName) parts.push(vendorName);
    parts.push(formattedDate);

    return this.sanitizeFilename(parts.join('_'));
  }

  /**
   * Create DATEV-compliant ZIP package
   * Contains: {name}.pdf, {name}.xml, document.xml
   */
  public async createZipPackage(
    invoiceNumber: string,
    xmlContent: string,
    pdfBuffer: Buffer,
    documentGuid: string,
    documentDate: string,
    documentDirection: 'incoming' | 'outgoing' | 'creditNote' = 'incoming',
    vendorName?: string,
    projectKuerzel?: string
  ): Promise<ZipPackageResult> {
    try {
      // Generate filenames using project kürzel + vendor name + date
      const baseName = this.buildBaseFilename(invoiceNumber, documentDate, vendorName, projectKuerzel);
      const pdfFilename = `${baseName}.pdf`;
      const xmlFilename = `${baseName}.xml`;
      const zipFilename = `${baseName}.zip`;

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
        documentDate,
        documentDirection,
        DATEV_CONFIG.generatingSystem,
        projectKuerzel
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
