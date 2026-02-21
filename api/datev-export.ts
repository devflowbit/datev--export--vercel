/**
 * DATEV Export Vercel Function
 * Main HTTP endpoint for DATEV export processing
 *
 * Features:
 * - Mode-aware validation (test/prod via DATEV_MODE env variable)
 * - User-friendly error messages (German/English)
 * - Dual line item sum validation strategy
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Logger, createLogger } from '../src/types/Logger';
import { DatevParserService } from '../src/services/DatevParserService';
import { DatevValidatorService } from '../src/services/DatevValidatorService';
import { DatevXMLGeneratorService } from '../src/services/DatevXMLGeneratorService';
import { PDFService } from '../src/services/PDFService';
import { DatevZipPackagerService } from '../src/services/DatevZipPackagerService';
import { WebhookNotificationService } from '../src/services/WebhookNotificationService';
import { ErrorFormatterService } from '../src/services/ErrorFormatterService';
import { LLMDataInput, DatevExportRequest, WebhookPayload } from '../src/models/LLMData.interface';
import { DatevExportResult, DatevDocument } from '../src/models/DatevDocument.interface';
import { DATEV_CONFIG, isTestMode } from '../src/config/datevConfig';
import { randomUUID } from 'crypto';

// Initialize error formatter (German by default)
const errorFormatter = new ErrorFormatterService('de');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const logger = createLogger();

  logger.log('DATEV Export function triggered');
  logger.log(`Validation mode: ${isTestMode() ? 'TEST (relaxed)' : 'PROD (strict)'}`);

  // Initialize webhook service and extract webhook parameters
  let correlationId: string;
  let webhookUrl: string | undefined;
  let webhookService: WebhookNotificationService | undefined;

  try {
    // Parse request body (already parsed by Vercel)
    const requestBody = req.body as any;

    // Stage 0: Basic input validation (flexible - no strict schema)
    if (!requestBody) {
      const formattedErrors = errorFormatter.formatErrors(['Document data missing from request']);
      const r = createFormattedErrorResponse(
        'Invalid request: Request body is empty',
        400,
        formattedErrors,
        [],
        undefined
      );
      return res.status(r.status).json(r.body);
    }

    if (!requestBody.llmData) {
      const formattedErrors = errorFormatter.formatErrors(['llmData section is missing from request']);
      const r = createFormattedErrorResponse(
        'Invalid request: llmData is required',
        400,
        formattedErrors,
        [],
        undefined
      );
      return res.status(r.status).json(r.body);
    }

    // Check critical sections exist (warnings, not errors)
    const llmData = requestBody.llmData as LLMDataInput;
    const inputWarnings: string[] = [];

    if (!llmData.invoice?.value) {
      inputWarnings.push('Invoice section is missing or empty - document may fail validation');
    }
    if (!llmData.vendor?.value) {
      inputWarnings.push('Vendor section is missing or empty - supplier data may be incomplete');
    }
    if (!llmData.summary?.value) {
      inputWarnings.push('Summary section is missing or empty - totals may be missing');
    }

    if (inputWarnings.length > 0) {
      logger.warn('Input warnings:', inputWarnings);
    }

    // Extract datevClientId and parse into consultantNumber/clientNumber
    const datevClientId = requestBody.datevClientId as string | undefined;
    let consultantNumber: string | undefined;
    let clientNumber: string | undefined;

    if (datevClientId && datevClientId.includes('-')) {
      const [consultant, client] = datevClientId.split('-');
      consultantNumber = consultant;
      clientNumber = client;
      logger.log(`DATEV Client: ${datevClientId} (Consultant: ${consultantNumber}, Client: ${clientNumber})`);
    }

    const exportRequest: DatevExportRequest = {
      llmData: requestBody.llmData as LLMDataInput,
      pdfSasUrl: requestBody.documentSasUrl,
      correlationId: requestBody.correlationId,
      webhookUrl: requestBody.webhookUrl,
      datevClientId,
      options: {
        ...(requestBody.options || {}),
        consultantNumber,
        clientNumber
      }
    };

    // Generate correlationId if not provided
    correlationId = exportRequest.correlationId || randomUUID();
    webhookUrl = exportRequest.webhookUrl;

    logger.log(`Processing invoice: ${exportRequest.llmData.invoice?.value?.invoiceId?.value || 'unknown'}`);
    logger.log(`CorrelationId: ${correlationId}${webhookUrl ? `, WebhookUrl: ${webhookUrl}` : ''}`);

    // Stage 1: Parse LLM data to DATEV document structure
    logger.log('Stage 1: Parsing LLM data');
    const parserService = new DatevParserService({
      confidenceThreshold: exportRequest.options?.confidenceThreshold,
      consultantNumber: exportRequest.options?.consultantNumber,
      clientNumber: exportRequest.options?.clientNumber
    });
    const datevDocument: DatevDocument = parserService.parseLLMData(exportRequest.llmData);

    logger.log("Datev doc line items", datevDocument);
    logger.log(`Parsed document: ${datevDocument.documentNumber}, ${datevDocument.supplier.name}`);

    // Stage 2: Get PDF (download or generate) - MOVED BEFORE VALIDATION
    logger.log('Stage 2: Acquiring PDF');
    const pdfService = new PDFService();
    const pdfResult = await pdfService.getPDF(exportRequest.pdfSasUrl, datevDocument);

    if (!pdfResult.success || !pdfResult.pdfBuffer) {
      logger.error('PDF acquisition failed:', pdfResult.error);

      const errorMetadata = {
        invoiceNumber: datevDocument.documentNumber,
        stage: 'pdf_acquisition',
        timestamp: new Date().toISOString()
      };

      const validationErrors = [`PDF error: ${pdfResult.error}`];

      if (webhookUrl) {
        await sendErrorWebhook(
          webhookUrl,
          correlationId,
          'PDF acquisition failed',
          errorMetadata,
          logger,
          validationErrors
        );
      }

      const r = createErrorResponse(
        'PDF acquisition failed',
        500,
        { validationErrors, metadata: errorMetadata },
        correlationId
      );
      return res.status(r.status).json(r.body);
    }

    logger.log(`PDF acquired: ${pdfResult.source}, size: ${pdfResult.pdfBuffer.length} bytes`);

    // Attach PDF to document BEFORE validation
    datevDocument.primaryPDF = pdfResult.pdfBuffer;

    // Stage 3: Validate required fields and business rules - NOW PDF IS ATTACHED
    logger.log('Stage 3: Validating DATEV document');
    logger.log(`Validation mode: ${isTestMode() ? 'TEST' : 'PROD'}`);

    const validatorService = new DatevValidatorService();
    const validationReport = validatorService.validate(datevDocument);

    // Log validation strategy used for line items
    if (validationReport.businessRulesValidation.checks.lineItemSumDetails) {
      const sumDetails = validationReport.businessRulesValidation.checks.lineItemSumDetails;
      logger.log(`Line item sum validation: strategy=${sumDetails.strategy}, valid=${sumDetails.valid}`);
      if (sumDetails.strategy !== 'none') {
        logger.log(`  Net sum: ${sumDetails.netSum.toFixed(2)}, Header net: ${sumDetails.headerNet.toFixed(2)}`);
        logger.log(`  Gross sum: ${sumDetails.grossSum.toFixed(2)}, Header gross: ${sumDetails.headerGross.toFixed(2)}`);
      }
    }

    if (!validationReport.overall.valid) {
      logger.error('Validation failed:', validationReport.overall.errors);

      const errorMetadata = {
        invoiceNumber: datevDocument.documentNumber,
        stage: 'validation',
        mode: validationReport.mode,
        timestamp: new Date().toISOString()
      };

      const formattedErrors = validationReport.overall.formattedErrors ||
        errorFormatter.formatErrors(validationReport.overall.errors, 'error');
      const formattedWarnings = validationReport.overall.formattedWarnings ||
        errorFormatter.formatErrors(validationReport.overall.warnings, 'warning');

      if (webhookUrl) {
        await sendErrorWebhook(
          webhookUrl,
          correlationId,
          'DATEV validation failed: Required fields missing or business rules violated',
          errorMetadata,
          logger,
          validationReport.overall.errors,
          validationReport.overall.warnings
        );
      }

      const r = createFormattedErrorResponse(
        'DATEV validation failed: Required fields missing or business rules violated',
        400,
        formattedErrors,
        formattedWarnings,
        correlationId,
        errorMetadata
      );
      return res.status(r.status).json(r.body);
    }

    logger.log('Validation passed');
    if (validationReport.overall.warnings.length > 0) {
      logger.warn('Validation warnings:', validationReport.overall.warnings);
    }

    // Stage 4: Generate DATEV Ledger Import XML (v6.0)
    logger.log('Stage 4: Generating DATEV Ledger Import XML');
    const xmlGenerator = new DatevXMLGeneratorService();
    const xmlContent = xmlGenerator.generateLedgerImportXML(datevDocument);

    logger.log(`Ledger Import XML generated: ${xmlContent} characters`);

    // Stage 5: Create ZIP package (with Ledger XML + document.xml manifest)
    logger.log('Stage 5: Creating DATEV ZIP package');
    const zipPackager = new DatevZipPackagerService();
    const zipResult = await zipPackager.createZipPackage(
      datevDocument.documentNumber,
      xmlContent,
      pdfResult.pdfBuffer,
      datevDocument.documentGuid!,
      datevDocument.documentDate,
      datevDocument.documentDirection
    );

    if (!zipResult.success || !zipResult.zipBase64) {
      logger.error('ZIP packaging failed:', zipResult.error);

      const errorMetadata = {
        invoiceNumber: datevDocument.documentNumber,
        stage: 'zip_packaging',
        timestamp: new Date().toISOString()
      };

      const validationErrors = [`ZIP error: ${zipResult.error}`];

      if (webhookUrl) {
        await sendErrorWebhook(
          webhookUrl,
          correlationId,
          'ZIP packaging failed',
          errorMetadata,
          logger,
          validationErrors
        );
      }

      const r = createErrorResponse(
        'ZIP packaging failed',
        500,
        { validationErrors, metadata: errorMetadata },
        correlationId
      );
      return res.status(r.status).json(r.body);
    }

    logger.log(`ZIP created: ${zipResult.filename}, files: ${zipResult.filesIncluded?.join(', ')}`);

    // Prepare metadata
    const metadata = {
      invoiceNumber: datevDocument.documentNumber,
      documentDate: datevDocument.documentDate,
      supplier: datevDocument.supplier.name,
      grossAmount: datevDocument.grossAmount,
      currency: datevDocument.currency,
      filesIncluded: zipResult.filesIncluded || [],
      pdfSource: pdfResult.source as 'azure_download' | 'generated',
      stage: 'completed',
      timestamp: new Date().toISOString(),
      validation: validationReport.overall
    };

    // Send webhook notification if webhook URL provided
    if (webhookUrl) {
      logger.log('[Webhook] Sending success notification');

      webhookService = new WebhookNotificationService(
        DATEV_CONFIG.webhook.maxRetries,
        DATEV_CONFIG.webhook.timeoutMs,
        DATEV_CONFIG.webhook.allowHttp
      );

      const webhookPayload: WebhookPayload = {
        correlationId,
        success: true,
        zipData: zipResult.zipBase64,
        filename: zipResult.filename,
        metadata,
        timestamp: new Date().toISOString()
      };

      const webhookResult = await webhookService.notifyWebhook(
        webhookUrl,
        webhookPayload,
        DATEV_CONFIG.webhook.apiKey
      );

      if (webhookResult.success) {
        logger.log(`[Webhook] Notification sent successfully (${webhookResult.attemptCount} attempt(s))`);
      } else {
        logger.warn(`[Webhook] Notification failed: ${webhookResult.error}`);
      }
    }

    // Success response
    const successResponse: DatevExportResult = {
      success: true,
      zipData: zipResult.zipBase64,
      filename: zipResult.filename,
      correlationId,
      metadata
    };

    logger.log('DATEV export completed successfully');

    return res.status(200).json(successResponse);

  } catch (error) {
    logger.error('Unexpected error:', error);

    const errorMessage = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    const errorMetadata = {
      stage: 'unknown',
      timestamp: new Date().toISOString()
    };

    if (webhookUrl) {
      await sendErrorWebhook(
        webhookUrl,
        correlationId! || 'unknown',
        errorMessage,
        errorMetadata,
        logger
      );
    }

    const r = createErrorResponse(
      errorMessage,
      500,
      { metadata: errorMetadata },
      correlationId!
    );
    return res.status(r.status).json(r.body);
  }
}

/**
 * Helper function to create error response
 */
function createErrorResponse(
  message: string,
  status: number,
  additionalData?: any,
  correlationId?: string
): { status: number; body: any } {
  const errorResponse: DatevExportResult = {
    success: false,
    error: message,
    correlationId,
    ...additionalData
  };
  return { status, body: errorResponse };
}

/**
 * Helper function to create formatted error response with user-friendly messages
 */
function createFormattedErrorResponse(
  message: string,
  status: number,
  formattedErrors: import('../src/constants/errorMessages').UserFriendlyError[],
  formattedWarnings: import('../src/constants/errorMessages').UserFriendlyError[],
  correlationId?: string,
  metadata?: any
): { status: number; body: any } {
  const errorSummary = formattedErrors.length > 0
    ? formattedErrors.map(e => e.title).slice(0, 3).join(', ') +
    (formattedErrors.length > 3 ? ` (+${formattedErrors.length - 3} more)` : '')
    : message;

  const errorResponse = {
    success: false,
    error: message,
    summary: errorSummary,
    correlationId,
    mode: isTestMode() ? 'test' : 'prod',
    errors: {
      count: formattedErrors.length,
      items: formattedErrors.map(e => ({
        code: e.code,
        field: e.field,
        severity: e.severity,
        messages: e.messages
      }))
    },
    warnings: {
      count: formattedWarnings.length,
      items: formattedWarnings.map(w => ({
        code: w.code,
        field: w.field,
        severity: w.severity,
        messages: w.messages
      }))
    },
    technicalErrors: formattedErrors.map(e => e.technicalMessage).filter(Boolean),
    metadata
  };

  return { status, body: errorResponse };
}

/**
 * Helper function to send error webhook notification
 */
async function sendErrorWebhook(
  webhookUrl: string,
  correlationId: string,
  error: string,
  metadata: any,
  context: Logger,
  validationErrors?: string[],
  validationWarnings?: string[]
): Promise<void> {
  try {
    const webhookService = new WebhookNotificationService(
      DATEV_CONFIG.webhook.maxRetries,
      DATEV_CONFIG.webhook.timeoutMs,
      DATEV_CONFIG.webhook.allowHttp
    );

    const webhookPayload: WebhookPayload = {
      correlationId,
      success: false,
      error,
      metadata,
      timestamp: new Date().toISOString(),
      validationErrors,
      validationWarnings
    };

    context.log('[Webhook] Sending error notification');
    const result = await webhookService.notifyWebhook(
      webhookUrl,
      webhookPayload,
      DATEV_CONFIG.webhook.apiKey
    );

    if (result.success) {
      context.log('[Webhook] Error notification sent successfully');
    } else {
      context.warn(`[Webhook] Error notification failed: ${result.error}`);
    }
  } catch (webhookError) {
    context.error('[Webhook] Exception sending error notification:', webhookError);
  }
}
