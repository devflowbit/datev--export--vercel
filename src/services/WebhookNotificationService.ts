import { WebhookPayload, WebhookResult } from '../models/LLMData.interface';
import { generateAppSecretHeader, isAppSecretConfigured, generateWebhookSignature, isWebhookSignatureConfigured } from '../utils/appSecretGenerator';

/**
 * Webhook Notification Service
 * Handles asynchronous webhook notifications with retry logic and security validation
 */
export class WebhookNotificationService {
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly allowHttp: boolean;

  constructor(
    maxRetries: number = 3,
    timeoutMs: number = 30000,
    allowHttp: boolean = false
  ) {
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
    this.allowHttp = allowHttp;
  }

  /**
   * Send webhook notification with retry logic
   * @param webhookUrl Target webhook endpoint URL
   * @param payload Webhook payload data
   * @param apiKey API key for authentication (x-api-key header)
   * @returns WebhookResult with success status and metadata
   */
  async notifyWebhook(
    webhookUrl: string,
    payload: WebhookPayload,
    apiKey: string
  ): Promise<WebhookResult> {
    const startTime = Date.now();
    let lastError: string = '';

    // Validate webhook URL before attempting to send
    const validationError = this.validateWebhookUrl(webhookUrl);
    if (validationError) {
      console.error(`[WebhookService] URL validation failed: ${validationError}`);
      return {
        success: false,
        attemptCount: 0,
        error: validationError,
        duration: Date.now() - startTime
      };
    }

    // Attempt webhook notification with retry logic
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[WebhookService] Attempt ${attempt}/${this.maxRetries} - Sending to ${this.sanitizeUrl(webhookUrl)}`);
        console.log(`[WebhookService] CorrelationId: ${payload.correlationId}, Success: ${payload.success}`);

        const result = await this.sendWebhookRequest(webhookUrl, payload, apiKey, attempt);

        console.log(JSON.stringify(result));

        if (result.success) {
          const duration = Date.now() - startTime;
          console.log(`[WebhookService] Success after ${attempt} attempt(s) - Duration: ${duration}ms - Status: ${result.statusCode}`);
          return {
            ...result,
            attemptCount: attempt,
            duration
          };
        }

        lastError = result.error || 'Unknown error';

        // Check if we should retry based on status code
        if (result.statusCode && !this.shouldRetry(result.statusCode)) {
          console.error(`[WebhookService] Non-retriable error (${result.statusCode}), stopping retries`);
          return {
            ...result,
            attemptCount: attempt,
            duration: Date.now() - startTime
          };
        }

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < this.maxRetries) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          console.warn(`[WebhookService] Attempt ${attempt} failed (${result.statusCode || 'timeout'}), retrying in ${backoffMs}ms...`);
          await this.sleep(backoffMs);
        }

      } catch (error: any) {
        lastError = error.message || 'Unknown error';
        console.error(`[WebhookService] Attempt ${attempt} exception:`, error.message);

        if (attempt < this.maxRetries) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          await this.sleep(backoffMs);
        }
      }
    }

    // All retries exhausted
    const duration = Date.now() - startTime;
    console.error(`[WebhookService] All ${this.maxRetries} attempts failed - Duration: ${duration}ms`);
    return {
      success: false,
      attemptCount: this.maxRetries,
      error: `All retry attempts exhausted. Last error: ${lastError}`,
      duration
    };
  }

  /**
   * Send a single webhook HTTP request with timeout
   */
  private async sendWebhookRequest(
    webhookUrl: string,
    payload: WebhookPayload,
    apiKey: string,
    attempt: number
  ): Promise<WebhookResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // Get secrets directly from env at runtime (not from static config)
      // This ensures the env vars are read when the request is made, not at module load time
      const adminApiKey = process.env.ADMIN_API_KEY || '';
      const webhookSecret = process.env.AZURE_WEBHOOK_SECRET || '';

      // Serialize payload once for both body and signature
      const payloadJson = JSON.stringify(payload);

      // Generate App-Secret header if ADMIN_API_KEY is configured
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-correlation-id': payload.correlationId,
        'User-Agent': 'DATEV-Export-Service/1.0'
      };

      // Add App-Secret header for time-based authentication (CSRF bypass)
      if (isAppSecretConfigured(adminApiKey)) {
        headers['App-Secret'] = generateAppSecretHeader(adminApiKey);
        console.log(`[WebhookService] App-Secret header added for secure authentication`);
      } else {
        console.warn(`[WebhookService] ADMIN_API_KEY not configured - App-Secret header NOT added`);
      }

      // Add x-webhook-signature header (HMAC-SHA256 signature of payload)
      if (isWebhookSignatureConfigured(webhookSecret)) {
        headers['x-webhook-signature'] = generateWebhookSignature(payloadJson, webhookSecret);
        console.log(`[WebhookService] x-webhook-signature header added for payload verification`);
      } else {
        console.warn(`[WebhookService] AZURE_WEBHOOK_SECRET not configured - x-webhook-signature header NOT added`);
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: payloadJson,
        signal: controller.signal
      });

      console.log("Raw Response", webhookUrl, response);

      clearTimeout(timeoutId);

      const statusCode = response.status;

      // Success: 2xx status codes
      if (response.ok) {
        return {
          success: true,
          statusCode,
          attemptCount: attempt
        };
      }

      // Get error details from response
      let errorMessage = `HTTP ${statusCode}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          errorMessage += `: ${errorBody.substring(0, 200)}`; // Limit error message length
        }
      } catch (e) {
        // Ignore error reading response body
      }

      return {
        success: false,
        statusCode,
        attemptCount: attempt,
        error: errorMessage
      };

    } catch (error: any) {
      clearTimeout(timeoutId);

      // Handle timeout
      if (error.name === 'AbortError') {
        return {
          success: false,
          attemptCount: attempt,
          error: `Timeout after ${this.timeoutMs}ms`
        };
      }

      // Handle network errors
      return {
        success: false,
        attemptCount: attempt,
        error: `Network error: ${error.message}`
      };
    }
  }

  /**
   * Validate webhook URL for security and format
   * Prevents SSRF attacks and ensures proper protocol
   */
  private validateWebhookUrl(url: string): string | null {
    try {
      const parsed = new URL(url);

      // Protocol validation
      if (parsed.protocol === 'http:' && !this.allowHttp) {
        return 'HTTP protocol not allowed. Use HTTPS for security.';
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return `Invalid protocol: ${parsed.protocol}. Only HTTP(S) allowed.`;
      }

      // SSRF prevention - block private IP ranges
      const hostname = parsed.hostname.toLowerCase();

      // Block localhost variants
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.endsWith('.local')
      ) {
        return 'Localhost and local domains are not allowed for security reasons.';
      }

      // Block private IP ranges (basic check)
      const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const ipv4Match = hostname.match(ipv4Regex);

      if (ipv4Match) {
        const octets = ipv4Match.slice(1, 5).map(Number);

        // Check private ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
        if (
          octets[0] === 10 ||
          (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
          (octets[0] === 192 && octets[1] === 168) ||
          octets[0] === 169 && octets[1] === 254 // Link-local
        ) {
          return 'Private IP addresses are not allowed for security reasons.';
        }
      }

      return null; // Valid URL

    } catch (error) {
      return `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Determine if a status code should trigger a retry
   * 5xx errors and network issues are retriable
   * 4xx client errors are not retriable (except 408, 429)
   */
  private shouldRetry(statusCode: number): boolean {
    // 5xx server errors - retriable
    if (statusCode >= 500 && statusCode < 600) {
      return true;
    }

    // Special 4xx cases that are retriable
    if (statusCode === 408 || statusCode === 429) {
      return true; // Request Timeout, Too Many Requests
    }

    // All other 4xx are client errors - don't retry
    return false;
  }

  /**
   * Sanitize URL for logging (hide sensitive query params)
   */
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return '[invalid-url]';
    }
  }

  /**
   * Sleep utility for backoff delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
