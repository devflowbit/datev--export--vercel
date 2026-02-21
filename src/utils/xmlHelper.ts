/**
 * XML Helper Utility
 * Provides XML formatting and escaping functions
 */

/**
 * Escape XML special characters
 */
export function escapeXml(unsafe: string): string {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }

  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format date to ISO 8601 format (YYYY-MM-DD)
 */
export function formatDateForDatev(date: string | Date): string {
  if (!date) {
    return '';
  }

  let dateObj: Date;

  if (typeof date === 'string') {
    // If already in YYYY-MM-DD format, return it
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Format current date/time to DATEV-compliant format
 * DATEV requires local time format WITHOUT timezone indicators (no Z, +, or -)
 * Pattern: YYYY-MM-DDTHH:mm:ss
 */
export function formatDateTimeForDatev(date?: Date): string {
  const d = date || new Date();

  // DATEV schema requires pattern: .+T[^Z\+\-]+
  // This means no 'Z', '+', or '-' characters after the 'T'
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Format number for XML (always use period as decimal separator)
 */
export function formatNumberForXml(value: number, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00';
  }

  return value.toFixed(decimals);
}

/**
 * Generate UUID v4
 */
export function generateGUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Replace template placeholders in XML string
 */
export function replacePlaceholder(
  template: string,
  placeholder: string,
  value: string | number | boolean | null | undefined,
  escape: boolean = true
): string {
  if (value === null || value === undefined || value === '') {
    // Remove the entire line containing the placeholder if value is empty
    const regex = new RegExp(`^.*{{${placeholder}}}.*$`, 'gm');
    return template.replace(regex, '');
  }

  const strValue = String(value);
  const finalValue = escape ? escapeXml(strValue) : strValue;
  const regex = new RegExp(`{{${placeholder}}}`, 'g');

  return template.replace(regex, finalValue);
}

/**
 * Replace multiple placeholders at once
 */
export function replacePlaceholders(
  template: string,
  replacements: Record<string, any>,
  escape: boolean = true
): string {
  let result = template;

  for (const [placeholder, value] of Object.entries(replacements)) {
    result = replacePlaceholder(result, placeholder, value, escape);
  }

  return result;
}

/**
 * Handle conditional blocks in templates
 * Example: {{#if FIELD}}content{{/if}}
 */
export function processConditionals(template: string, data: Record<string, any>): string {
  let result = template;

  // Process {{#if FIELD}}...{{/if}} blocks
  const ifRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g;

  result = result.replace(ifRegex, (match, fieldName, content) => {
    const value = data[fieldName];
    // Include block if value is truthy and not empty string
    if (value !== null && value !== undefined && value !== '') {
      return content;
    }
    return '';
  });

  return result;
}

/**
 * Validate XML structure (basic check)
 */
export function isValidXML(xmlString: string): boolean {
  try {
    // Basic checks
    if (!xmlString || xmlString.trim() === '') {
      return false;
    }

    // Check for opening <?xml declaration
    if (!xmlString.trim().startsWith('<?xml')) {
      return false;
    }

    // Check for balanced tags (simplified)
    const openTags = (xmlString.match(/<[^/][^>]*[^/]>/g) || []).length;
    const closeTags = (xmlString.match(/<\/[^>]+>/g) || []).length;
    const selfClosing = (xmlString.match(/<[^>]+\/>/g) || []).length;

    // This is a very basic check - for production, use a proper XML parser
    return openTags === closeTags || (openTags === closeTags + selfClosing);
  } catch (error) {
    return false;
  }
}
