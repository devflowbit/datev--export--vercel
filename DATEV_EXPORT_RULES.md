# DATEV Export Rules

Authoritative reference for the DATEV export system. Covers business rules, validation logic, format requirements, and processing pipeline.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Document Types](#2-document-types)
3. [Processing Pipeline](#3-processing-pipeline)
4. [Required Fields](#4-required-fields)
5. [Format Validation Rules](#5-format-validation-rules)
6. [Business Rule Validation](#6-business-rule-validation)
7. [BU Keys Reference](#7-bu-keys-reference)
8. [Delivery Date Logic](#8-delivery-date-logic)
9. [Credit Note Rules](#9-credit-note-rules)
10. [Test vs Production Mode](#10-test-vs-production-mode)
11. [Account Number Ranges](#11-account-number-ranges)
12. [Error Code Reference](#12-error-code-reference)
13. [API Reference](#13-api-reference)
14. [ZIP Package Contents](#14-zip-package-contents)
15. [Configuration](#15-configuration)

---

## 1. Overview

A Vercel serverless function that converts LLM-extracted invoice data into DATEV-compliant XML exports with PDF packaging. It targets the **DATEV Ledger Import v6.0** specification (`Belegverwaltung_online_ledger_import_v060.xsd`) and handles German accounting standards for incoming invoices, outgoing invoices, and credit notes.

### High-Level Architecture

```
POST /api/datev-export
  │
  ├── Stage 0: Input validation
  ├── Stage 1: Parse LLM data → DatevDocument
  ├── Stage 2: Acquire PDF (download or generate)
  ├── Stage 3: Validate (3-layer validation)
  ├── Stage 4: Generate DATEV Ledger Import XML
  ├── Stage 5: Create ZIP package
  └── Webhook notification (optional)
```

### Key Services

| Service | File | Responsibility |
|---------|------|----------------|
| `DatevParserService` | `src/services/DatevParserService.ts` | Transform LLM JSON into `DatevDocument` |
| `PDFService` | `src/services/PDFService.ts` | Download PDF from Azure SAS URL or generate fallback |
| `DatevValidatorService` | `src/services/DatevValidatorService.ts` | 3-layer validation |
| `DatevXMLGeneratorService` | `src/services/DatevXMLGeneratorService.ts` | Produce DATEV Ledger Import v6.0 XML |
| `DatevZipPackagerService` | `src/services/DatevZipPackagerService.ts` | Bundle XML + PDF + document.xml manifest |
| `WebhookNotificationService` | `src/services/WebhookNotificationService.ts` | POST result to caller's webhook |
| `VATValidationService` | `src/services/VATValidationService.ts` | Algorithmic check digit validation for EU VAT IDs |
| `ErrorFormatterService` | `src/services/ErrorFormatterService.ts` | Bilingual (DE/EN) error formatting |

---

## 2. Document Types

The system supports three document directions, each affecting party mapping and XML output.

### Direction Types

| Direction | German Term | XML Ledger Element | Party Mapping |
|-----------|-------------|-------------------|---------------|
| `incoming` | Eingangsrechnung | `accountsPayableLedger` | Normal: vendor = supplier, customer = buyer |
| `outgoing` | Rechnungsausgang | `accountsReceivableLedger` | **Swapped**: vendor = customer (in XML), customer = supplier (in XML) |
| `creditNote` | Gutschrift | `accountsPayableLedger` | Same as incoming (vendor = supplier) |

### Party Swapping Logic

For **outgoing** invoices, the supplier and customer roles are swapped in the XML output:

- **XML vendor fields** (`supplierName`, `supplierCity`) are populated from the `customer` data
- **XML customer fields** (`customerName`, `customerCity`) are populated from the `supplier` data

For **incoming** and **creditNote** directions, no swap occurs.

### Auto-Detection

Credit notes are auto-detected when `llmData.summary.value.documentType.value === 'creditNote'`. This overrides the `documentDirection` field in the request.

### Document Mapping Types

The `document.xml` manifest uses direction-specific labels:

| Direction | `documentTypeText` |
|-----------|-------------------|
| `incoming` | `Eingangsrechnungen` |
| `outgoing` | `Rechnungsausgang` |
| `creditNote` | `Gutschrift` |

---

## 3. Processing Pipeline

### Stage 0: Input Validation

Basic request body checks:
- Request body must not be empty
- `llmData` field must be present
- Warnings (non-blocking) if `invoice`, `vendor`, or `summary` sections are missing

### Stage 1: Parse (`DatevParserService`)

Transforms LLM JSON with `{ value, confidence, source, error }` field structure into a flat `DatevDocument`.

Key operations:
- **Confidence threshold**: Fields below threshold (default: `0.5`) are logged as warnings but still used
- **German number parsing**: Converts `1.234,56` format to numeric values
- **Address parsing**: Splits vendor address string into street, postal code, city, country
- **Line item calculation**: Handles two scenarios:
  - *VAT amount provided*: `totalPrice` is treated as net, VAT amount is used directly
  - *VAT amount missing*: `totalPrice` is treated as gross, net/VAT calculated backwards
- **IBAN extraction**: For German IBANs (DE + 22 chars), extracts bank account number (last 10 digits)
- **`datevClientId` parsing**: If format is `"consultantNumber-clientNumber"` (e.g., `"23433-4605"`), splits into separate fields

### Stage 2: PDF Acquisition (`PDFService`)

- Downloads PDF from Azure SAS URL if provided
- Generates a fallback PDF if download fails
- Maximum PDF size: **10 MB**
- Timeout: **30 seconds**
- PDF is attached to `DatevDocument.primaryPDF` before validation

### Stage 3: Validate (`DatevValidatorService`)

Three sequential validation layers (see sections 4-6 for details):

1. **Required Fields** — Checks for mandatory fields per direction
2. **Format Validation** — Pattern matching for dates, codes, VAT IDs
3. **Business Rules** — Mathematical consistency, BU key logic, EU requirements

Only **errors** block the export. **Warnings** are included in the response but allow processing to continue.

### Stage 4: XML Generation (`DatevXMLGeneratorService`)

- Uses template-based XML generation with placeholder replacement
- Schema: `Belegverwaltung_online_ledger_import_v060.xsd`
- **Consolidated amount** is calculated from line items (not from LLM-extracted total) to avoid rounding mismatches
- Line items with `lineNetAmount === 0` are filtered out
- XML is validated using `fast-xml-parser` `XMLValidator` before returning

### Stage 5: ZIP Packaging (`DatevZipPackagerService`)

- Creates a ZIP file containing PDF, XML, and `document.xml` manifest
- Compression: DEFLATE, level 6
- Filename format: `datev_export_{sanitized_invoice_number}.zip`
- Returns base64-encoded ZIP in the response

### Webhook (Optional)

If `webhookUrl` is provided in the request:
- Success: sends full ZIP data, metadata, and correlation ID
- Error: sends error details, validation errors/warnings
- Authentication: `x-api-key` header with configured API key
- Retries: configurable (default 3), with configurable timeout (default 30s)

---

## 4. Required Fields

Fields are validated per DATEV XML specification sheets. Requirements differ by document direction.

### Sheet A: Envelope (Always Required)

| Field | DATEV Name | Description |
|-------|-----------|-------------|
| `interfaceType` | — | Must be `"XML-Online"` |
| `interfaceVersion` | — | Must be `"1.0"` |

### Sheet B: Header (Always Required)

| Field | DATEV Name | Notes |
|-------|-----------|-------|
| `documentType` | Belegtyp | e.g., `"Eingangsrechnung"` |
| `documentNumber` | Belegnummer | Invoice number |
| `documentDate` | Belegdatum | Format: `YYYY-MM-DD` |
| `grossAmount` | BetragBrutto | Must be > 0 (or < 0 for credit notes) |
| `netAmount` | BetragNetto | Sum of line item net amounts |
| `currency` | Waehrung | ISO 4217, 3 letters |
| `exchangeRate` | Wechselkurs | **Conditional**: required if currency != EUR |

### Sheet C: Counterparty (Direction-Dependent)

**Incoming invoices** — full supplier address required:

| Field | Required |
|-------|----------|
| Supplier Name | Yes |
| Supplier Street | Yes |
| Supplier Postal Code | Yes |
| Supplier City | Yes |
| Supplier Country | Yes |

**Outgoing invoices** — minimal customer info:

| Field | Required |
|-------|----------|
| Customer Name | Yes |
| Customer City | Yes |
| Customer Street | No |
| Customer Postal Code | No |
| Customer Country | No |

### Sheet E: VAT (Always Required)

| Field | DATEV Name |
|-------|-----------|
| `vatCase` | Steuerfall |
| `taxRate` | Steuersatz |

### Sheet F: Line Items (Always Required)

Minimum 1 line item. Per line:

| Field | DATEV Name | Required |
|-------|-----------|----------|
| `description` | Beschreibung | Yes |
| `unitPriceNet` | EinzelpreisNetto | Yes |
| `lineNetAmount` | PositionsNetto | Yes |
| `vatRate` | PositionsSteuersatz | Yes |
| `buKey` | BU-Schluessel | Yes for incoming, No for outgoing |

### Sheet K: Attachment

| Field | DATEV Name | Notes |
|-------|-----------|-------|
| `primaryPDF` | HauptbelegPDF | Required — original invoice PDF |

### Strongly Recommended Fields

These are not required but improve DATEV processing quality:

- `serviceDate` (Leistungsdatum) — critical for Section 13b / IGE VAT logic
- `supplier.vatId` (USt-IdNr.) — essential for EU suppliers
- `supplierInternalId` (LieferantenNr) — vendor identifier
- `dueDate` (FaelligAm) — payment due date
- `externalReference` (ExterneReferenz) — link back to source system
- `creditorAccount` (Kreditorenkonto) — creditor account number
- `offsetAccount` (Gegenkonto/Sachkonto) — expense or revenue account
- `lineItems[].suggestedGLAccount` (SachkontoVorschlag) — GL account suggestion

---

## 5. Format Validation Rules

### Date Format

All dates must be **ISO 8601**: `YYYY-MM-DD`

Validated fields: `documentDate`, `serviceDate`

### Postal Code

German format: exactly **5 digits**

### Country Code

**ISO 3166-1 Alpha-2**: 2 uppercase letters (e.g., `DE`, `FR`, `AT`)

### Currency Code

**ISO 4217**: 3 uppercase letters (e.g., `EUR`, `USD`, `GBP`)

### VAT ID Patterns (EU Countries)

| Country | Code | Pattern | Example |
|---------|------|---------|---------|
| Austria | AT | `ATU` + 8 digits | `ATU12345678` |
| Belgium | BE | `BE` + 10 digits (starts with 0 or 1) | `BE0123456789` |
| Bulgaria | BG | `BG` + 9-10 digits | `BG123456789` |
| Croatia | HR | `HR` + 11 digits | `HR12345678901` |
| Cyprus | CY | `CY` + 8 digits + 1 letter | `CY12345678A` |
| Czech Republic | CZ | `CZ` + 8-10 digits | `CZ12345678` |
| **Germany** | **DE** | **`DE` + 9 digits** | **`DE123456789`** |
| Denmark | DK | `DK` + 8 digits | `DK12345678` |
| Estonia | EE | `EE` + 9 digits | `EE123456789` |
| Greece | EL | `EL` + 9 digits | `EL123456789` |
| Greece (alt) | GR | `GR` + 9 digits | `GR123456789` |
| Spain | ES | `ES` + alphanumeric + 7 digits + alphanumeric | `ESX1234567X` |
| Finland | FI | `FI` + 8 digits | `FI12345678` |
| France | FR | `FR` + 2 alphanumeric + 9 digits | `FRXX123456789` |
| United Kingdom | GB | `GB` + 9 or 12 digits, or `GD`/`HA` + 3 digits | `GB123456789` |
| Hungary | HU | `HU` + 8 digits | `HU12345678` |
| Ireland | IE | `IE` + digit + alphanumeric + 5 digits + letter | `IE1A12345A` |
| Italy | IT | `IT` + 11 digits | `IT12345678901` |
| Lithuania | LT | `LT` + 9 or 12 digits | `LT123456789` |
| Luxembourg | LU | `LU` + 8 digits | `LU12345678` |
| Latvia | LV | `LV` + 11 digits | `LV12345678901` |
| Malta | MT | `MT` + 8 digits | `MT12345678` |
| Netherlands | NL | `NL` + 9 digits + `B` + 2 digits | `NL123456789B01` |
| Poland | PL | `PL` + 10 digits | `PL1234567890` |
| Portugal | PT | `PT` + 9 digits | `PT123456789` |
| Romania | RO | `RO` + 2-10 digits | `RO1234567890` |
| Sweden | SE | `SE` + 12 digits | `SE123456789012` |
| Slovenia | SI | `SI` + 8 digits | `SI12345678` |
| Slovakia | SK | `SK` + 10 digits | `SK1234567890` |

**Production mode** additionally runs algorithmic check digit validation (country-specific algorithms per the `VATValidationService`). Test mode only validates the format pattern.

Non-EU VAT IDs: must match `^[A-Z]{2}[A-Z0-9]+$` (2-letter country code + alphanumeric).

### BU Key Values

Valid BU keys: `0`, `1`, `2`, `3`, `8`, `9`, `18`, `19`, `91`, `92`, `94`, `95`

Any other value is a format error.

---

## 6. Business Rule Validation

### Rule 1: Totals Match

**Net + VAT = Gross** with a tolerance of **+/- 0.02 EUR**.

```
|netAmount + totalTax - grossAmount| <= 0.02
```

If this fails, it is an **error** that blocks the export.

### Rule 2: Line Item Sum Validation (Dual Strategy)

Three strategies are attempted in order. If **any** strategy matches within tolerance, validation passes:

| Strategy | Calculation | Compared Against |
|----------|-------------|-----------------|
| **Net-based** | `Sum(lineNetAmount)` | `headerNet` |
| **Gross-based** | `Sum(lineNetAmount + lineTaxAmount)` | `headerGross` |
| **Total-based** | `Sum(lineGrossAmount)` | `headerGross` |

Tolerance: **+/- 0.02 EUR**

If **none** match, this is a **warning** (export continues with header values).

### Rule 3: VAT Sum Match

```
|Sum(lineTaxAmount) - totalTax| <= 0.02
```

If this fails, it is a **warning** (not a blocking error), because different invoice formats produce rounding differences.

### Rule 4: BU Key / VAT Rate Consistency

Each line item's BU key must match its VAT rate per the BU key definition table. For example, BU key `9` requires a 19% VAT rate.

- **Standard invoices**: mismatch is an **error**
- **Credit notes**: mismatch is logged internally as a warning (credit notes may have foreign VAT rates)
- **Test mode**: BU key errors in the *format validation layer* (invalid key values) are downgraded to warnings. Business rule layer mismatches (wrong VAT rate for a valid key) remain blocking errors.

### Rule 5: IGE / Reverse Charge Zero VAT

If any line item uses an IGE key (`18`, `19`) or RC key (`91`, `92`, `94`, `95`), the total VAT amount must be near zero (`totalTax <= 0.01`).

Rationale: for intra-EU goods acquisition and reverse charge, the supplier document must show 0% VAT — the buyer self-assesses.

This is an **error** if violated.

### Rule 6: EU VAT ID Requirement

For EU suppliers (country in EU list, not `DE`):

- Supplier VAT ID must be present
- Customer (your company) VAT ID must be configured

| Mode | Severity |
|------|----------|
| Test | Warning |
| Production | Error |

### EU Member States

```
AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE
```

(27 countries)

> **Note on Greece**: The EU countries list uses `GR` (ISO 3166-1), while the VAT ID prefix uses `EL` (EU fiscal convention). Both `EL` and `GR` are accepted as VAT ID prefixes in format validation.

---

## 7. BU Keys Reference

BU-Schluessel (Buchungsschluessel) are DATEV posting keys that drive VAT treatment.

### Input Tax Keys (Incoming Invoices)

| BU Key | Name | VAT Rate | VAT Case | Use Case |
|--------|------|----------|----------|----------|
| `9` | Inland 19% Input VAT | 19% | `Inland19` | Domestic German supplier, standard rate |
| `8` | Inland 7% Input VAT | 7% | `Inland7` | Domestic German supplier, reduced rate |
| `19` | Intra-EU Goods Acquisition 19% | 19% | `IGE19` | EU goods purchase, supplier shows 0%, buyer self-assesses at 19% |
| `18` | Intra-EU Goods Acquisition 7% | 7% | `IGE7` | EU goods purchase, supplier shows 0%, buyer self-assesses at 7% |
| `94` | Reverse Charge 19% (with input VAT deduction) | 19% | `RC19` | EU services, reverse charge with input VAT deduction right |
| `91` | Reverse Charge 7% (with input VAT deduction) | 7% | `RC7` | EU services, reverse charge with input VAT deduction right |
| `95` | Reverse Charge 19% (no input VAT deduction) | 19% | `RC19_NoDeduct` | Reverse charge without input VAT deduction right |
| `92` | Reverse Charge 7% (no input VAT deduction) | 7% | `RC7_NoDeduct` | Reverse charge without input VAT deduction right |

### Output Tax Keys (Outgoing Invoices)

| BU Key | Name | VAT Rate | VAT Case | Use Case |
|--------|------|----------|----------|----------|
| `3` | Domestic Sales 19% | 19% | `Inland19` | Outgoing invoice with standard 19% VAT |
| `2` | Domestic Sales 7% | 7% | `Inland7` | Outgoing invoice with reduced 7% VAT |

### Special Keys

| BU Key | Name | VAT Rate | VAT Case | Use Case |
|--------|------|----------|----------|----------|
| `0` | No BU Key | — | — | Accepted by the format validator but has no definition in the BU key registry. `getBUKeyInfo('0')` returns `undefined`. |
| `1` | Tax-Exempt | 0% | `steuerfrei` | Tax-exempt transactions |

### Key Classification Functions

- **IGE keys** (`18`, `19`): Intra-EU goods acquisition — supplier must show 0% VAT
- **RC keys** (`91`, `92`, `94`, `95`): Reverse charge — supplier must show 0% VAT
- **Zero-VAT-required** keys: All IGE + RC keys require `totalTax` near zero on supplier document

---

## 8. Delivery Date Logic

The system uses a 4-scenario strategy for delivery dates in XML output. The `serviceDate` field from the document header is **never** used as a fallback — `deliveryDate` is the definitive source.

### Scenario 1: All Lines Same Date

All line items have a `deliveryDate` and all values are identical.

**Result**: Both `consolidatedDeliveryDate` (header-level) and per-line `deliveryDate` elements are emitted in XML.

### Scenario 2: Lines with Different Dates

Line items have `deliveryDate` values but they differ across lines.

**Result**: Only per-line `deliveryDate` elements are emitted. No consolidated header date.

### Scenario 3: Some Lines Have Dates

Some line items have `deliveryDate`, others don't.

**Result**: `deliveryDate` is emitted only on lines that have it. No consolidated header date.

### Scenario 4: No Dates

No line items have a `deliveryDate`.

**Result**: No `deliveryDate` anywhere in the XML — neither consolidated nor per-line.

---

## 9. Credit Note Rules

### Detection

Credit notes are identified by:
1. Explicit `documentDirection: 'creditNote'` in the request
2. Auto-detection from `llmData.summary.value.documentType.value === 'creditNote'`

### Amount Requirements

- Gross amount **must be negative** (`< 0`). Positive amounts on credit notes trigger a validation error.
- Standard invoices must have positive gross amounts (`> 0`).

### Processing Behavior

- Credit notes use the **incoming** party mapping (no swap) — vendor = supplier
- Credit notes use `accountsPayableLedger` XML element (same as incoming)
- BU key / VAT rate mismatches produce **warnings** instead of errors (credit notes may carry foreign VAT rates)
- In `document.xml`, the document type text is `"Gutschrift"`

---

## 10. Test vs Production Mode

Controlled by the `DATEV_MODE` environment variable. Default: `test`.

### Side-by-Side Comparison

| Validation Check | Test Mode | Production Mode |
|------------------|-----------|-----------------|
| VAT ID format | Warning | Error |
| VAT ID algorithmic check digit | Skipped | Error |
| Supplier address completeness | Error | Error |
| BU Key / VAT rate consistency (format layer) | Warning | Error |
| BU Key / VAT rate consistency (business rule layer) | Error | Error |
| Line item sum validation | Warning | Warning |
| Document number format | Warning | Warning |
| Currency validation | Warning | Warning |
| Placeholder VAT IDs (e.g., `DEXXXXXXXXX`) | Allowed | Not allowed |
| EU VAT ID requirements | Warning | Error |
| Required fields level | Minimal | Standard |

### Key Differences

**Test mode** (`DATEV_MODE=test`):
- VAT ID format errors and EU VAT requirements are downgraded to warnings
- Algorithmic check digit validation is skipped entirely
- Accepts placeholder/test VAT IDs (e.g., `DEXXXXXXXXX`)
- Note: supplier address completeness and BU key/VAT rate business rule mismatches remain blocking errors even in test mode
- Suitable for development, integration testing, and demos

**Production mode** (`DATEV_MODE=prod`):
- Strict validation — most failures are blocking errors
- Runs algorithmic check digit validation on VAT IDs (blocking error on failure)
- Requires real, valid VAT IDs
- Suitable for live accounting workflows

---

## 11. Account Number Ranges

DATEV v6.0 specifies distinct account number ranges for vendors and customers.

| Account Type | Range | Default | Description |
|-------------|-------|---------|-------------|
| Vendor (Kreditor) | `10000`–`69999` | `10000` | Accounts payable / supplier accounts |
| Customer (Debitor) | `70000`–`99999` | `70000` | Accounts receivable / customer accounts |

These ranges are validated during configuration checks. An invalid range produces a configuration error.

### Other Default Accounts

| Account | Default Value | Description |
|---------|--------------|-------------|
| Creditor Account | `16000` | Standard creditor account (SKR03/04) |
| Offset Account | `4910` | Common expense account |

---

## 12. Error Code Reference

All errors follow the pattern `DATEV_XXX` where the range indicates the category.

### Input Errors (1xx)

| Code | Name | Severity | Description |
|------|------|----------|-------------|
| `DATEV_100` | Missing LLM Data | Error | `llmData` is missing from the request |
| `DATEV_101` | Missing Invoice Section | Error | Invoice section not found in extracted data |
| `DATEV_102` | Missing Vendor Section | Error | Vendor/supplier section not found |
| `DATEV_103` | Missing Summary Section | Error | Summary section with totals not found |
| `DATEV_104` | Missing Line Items | Error | No line items in extracted data |

### Required Field Errors (2xx)

| Code | Name | Severity | Description |
|------|------|----------|-------------|
| `DATEV_200` | Missing Invoice Number | Error | Belegnummer is required |
| `DATEV_201` | Missing Invoice Date | Error | Belegdatum is required |
| `DATEV_202` | Missing Supplier Name | Error | Supplier name is required |
| `DATEV_203` | Missing Supplier Street | Error | Street required for incoming invoices |
| `DATEV_204` | Missing Supplier Postal Code | Error | PLZ required for incoming invoices |
| `DATEV_205` | Missing Supplier City | Error | City required for incoming invoices |
| `DATEV_206` | Missing Supplier Country | Error | Country required for incoming invoices |
| `DATEV_207` | Missing Gross Amount | Error | Bruttobetrag is required |
| `DATEV_208` | Missing Net Amount | Error | Nettobetrag is required |
| `DATEV_209` | Missing Currency | Error | Currency code is required |
| `DATEV_210` | Missing VAT Case | Error | Steuerfall could not be determined |
| `DATEV_211` | Missing Tax Rate | Error | Steuersatz is required |
| `DATEV_212` | Missing PDF | Error | PDF document is required as attachment |
| `DATEV_213` | Missing Exchange Rate | Error | Required for non-EUR currencies |

### Format Errors (3xx)

| Code | Name | Severity | Description |
|------|------|----------|-------------|
| `DATEV_300` | Invalid Date Format | Error | Expected `YYYY-MM-DD` |
| `DATEV_301` | Invalid VAT ID Format | Error | Does not match country-specific pattern |
| `DATEV_302` | Invalid Postal Code | Error | German: must be 5 digits |
| `DATEV_303` | Invalid Country Code | Error | Must be 2-letter ISO code |
| `DATEV_304` | Invalid Currency Code | Error | Must be 3-letter ISO code |
| `DATEV_305` | Invalid BU Key | Error | Not a valid DATEV posting key |

### Business Rule Errors (4xx)

| Code | Name | Severity | Description |
|------|------|----------|-------------|
| `DATEV_400` | Totals Mismatch | Error | Net + VAT != Gross (beyond tolerance) |
| `DATEV_401` | Line Items Sum Mismatch | Warning | Line item sums don't match header |
| `DATEV_402` | VAT Sum Mismatch | Warning | Line VAT sum != header VAT |
| `DATEV_403` | BU Key / VAT Rate Mismatch | Error | BU key doesn't match the VAT rate |
| `DATEV_404` | IGE/RC Non-Zero VAT | Error | IGE/RC invoice has non-zero VAT |
| `DATEV_405` | EU Missing VAT ID | Error | EU transaction missing required VAT IDs |
| `DATEV_406` | Invalid Gross Amount | Error | Gross must be > 0 for standard invoices |
| `DATEV_407` | Credit Note Positive Amount | Error | Credit note must have negative gross |

### System Errors (5xx)

| Code | Name | Severity | Description |
|------|------|----------|-------------|
| `DATEV_500` | PDF Acquisition Failed | Error | PDF download or generation failed |
| `DATEV_501` | ZIP Packaging Failed | Error | ZIP package creation failed |
| `DATEV_502` | XML Generation Failed | Error | DATEV XML generation failed |
| `DATEV_599` | Unexpected Error | Error | Catch-all for unhandled errors |

### Error Message Structure

All errors include bilingual messages (German and English):

```json
{
  "code": "DATEV_400",
  "field": "totals",
  "severity": "error",
  "messages": {
    "en": {
      "title": "Invoice totals do not match",
      "detail": "Net amount + VAT does not equal Gross amount.",
      "suggestion": "Verify the invoice totals. Net + VAT should equal Gross (+-0.02 tolerance)."
    },
    "de": {
      "title": "Rechnungssummen stimmen nicht",
      "detail": "Nettobetrag + MwSt entspricht nicht dem Bruttobetrag.",
      "suggestion": "Pruefen Sie die Rechnungssummen. Netto + MwSt sollte Brutto ergeben (+-0,02 Toleranz)."
    }
  }
}
```

---

## 13. API Reference

### Endpoint

```
POST /api/datev-export
```

Function timeout: **120 seconds** (configured in `vercel.json`).

### Request Body

```json
{
  "llmData": {
    "documentDirection": "incoming | outgoing | creditNote",
    "invoice": {
      "id": "...",
      "path": "...",
      "value": {
        "invoiceId": { "value": "INV-001", "confidence": "0.95" },
        "invoiceDate": { "value": "2024-12-15", "confidence": "0.98" },
        "deliveryDate": { "value": "2024-12-10", "confidence": "0.90" },
        "orderId": { "value": "PO-123", "confidence": "0.85" }
      }
    },
    "vendor": { "...LLM fields..." },
    "customer": { "...LLM fields..." },
    "payment": { "...LLM fields..." },
    "summary": { "...LLM fields..." },
    "lineItems": { "...LLM fields..." }
  },
  "documentSasUrl": "https://storage.blob.core.windows.net/...",
  "correlationId": "uuid-optional",
  "webhookUrl": "https://your-server.com/webhook",
  "datevClientId": "23433-4605",
  "options": {
    "confidenceThreshold": 0.5,
    "validateXml": true
  }
}
```

#### LLM Field Structure

Every extracted field follows this pattern:

```json
{
  "value": "<extracted value>",
  "confidence": "0.95",
  "source": "page_1",
  "error": null
}
```

### Success Response (200)

```json
{
  "success": true,
  "zipData": "<base64-encoded ZIP>",
  "filename": "datev_export_INV_001.zip",
  "correlationId": "uuid",
  "metadata": {
    "invoiceNumber": "INV-001",
    "documentDate": "2024-12-15",
    "supplier": "Acme GmbH",
    "grossAmount": 1190.00,
    "currency": "EUR",
    "filesIncluded": ["invoice_INV_001.pdf", "invoice_INV_001.xml", "document.xml"],
    "pdfSource": "azure_download",
    "stage": "completed",
    "timestamp": "2024-12-15T10:30:00.000Z",
    "validation": {
      "valid": true,
      "errors": [],
      "warnings": []
    }
  }
}
```

### Error Response (400 / 500)

```json
{
  "success": false,
  "error": "DATEV validation failed: Required fields missing or business rules violated",
  "summary": "Invoice number missing, Supplier name missing (+1 more)",
  "correlationId": "uuid",
  "mode": "test",
  "errors": {
    "count": 3,
    "items": [
      {
        "code": "DATEV_200",
        "field": "documentNumber",
        "severity": "error",
        "messages": { "en": { "..." }, "de": { "..." } }
      }
    ]
  },
  "warnings": {
    "count": 1,
    "items": [
      {
        "code": "DATEV_401",
        "field": "lineItemsSum",
        "severity": "warning",
        "messages": { "en": { "..." }, "de": { "..." } }
      }
    ]
  },
  "technicalErrors": ["REQUIRED: Document Number (Belegnummer) missing"],
  "metadata": {
    "invoiceNumber": "",
    "stage": "validation",
    "mode": "test",
    "timestamp": "2024-12-15T10:30:00.000Z"
  }
}
```

### Webhook Callback Payload

Sent to the `webhookUrl` (if provided) after processing completes.

**Headers:**
- `Content-Type: application/json`
- `x-api-key: <configured API_KEY>`
- `App-Secret: <time-based SHA256 of ADMIN_API_KEY>`

**Body:**

```json
{
  "correlationId": "uuid",
  "success": true,
  "zipData": "<base64-encoded ZIP>",
  "filename": "datev_export_INV_001.zip",
  "metadata": {
    "invoiceNumber": "INV-001",
    "documentDate": "2024-12-15",
    "supplier": "Acme GmbH",
    "grossAmount": 1190.00,
    "currency": "EUR",
    "filesIncluded": ["invoice_INV_001.pdf", "invoice_INV_001.xml", "document.xml"],
    "pdfSource": "azure_download",
    "stage": "completed",
    "timestamp": "2024-12-15T10:30:00.000Z"
  },
  "timestamp": "2024-12-15T10:30:01.000Z",
  "validationErrors": [],
  "validationWarnings": []
}
```

---

## 14. ZIP Package Contents

Every DATEV export produces a ZIP file containing exactly 3 files:

| File | Description |
|------|-------------|
| `invoice_{number}.pdf` | Original invoice PDF (downloaded or generated) |
| `invoice_{number}.xml` | DATEV Ledger Import XML (v6.0 schema) |
| `document.xml` | Archive manifest listing all files with metadata |

### Filename Sanitization

Invoice numbers are sanitized for filenames:
- Special characters replaced with `_`
- Multiple underscores collapsed to single
- Truncated to 50 characters

### document.xml Manifest

Contains:
- Generating system identifier
- Export timestamp
- Document GUID
- References to XML and PDF files
- Invoice month (`YYYY-MM` format)
- Document type text (direction-dependent)
- Ledger type (`accountsPayableLedger` or `accountsReceivableLedger`)

---

## 15. Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COMPANY_VAT_ID` | Yes | `DE123456789` | Your German VAT ID (DE + 9 digits) |
| `DATEV_MODE` | No | `test` | Validation strictness: `test` or `prod` |
| `API_KEY` | No | `""` | Webhook `x-api-key` header value |
| `ADMIN_API_KEY` | No | `""` | Webhook `App-Secret` signing key |
| `WEBHOOK_TIMEOUT_MS` | No | `30000` | Webhook request timeout in ms |
| `WEBHOOK_MAX_RETRIES` | No | `3` | Webhook retry attempts |
| `WEBHOOK_ALLOW_HTTP` | No | `false` | Allow HTTP webhook URLs (only for dev) |

### Application Defaults

| Setting | Value | Description |
|---------|-------|-------------|
| Interface Type | `XML-Online` | DATEV interface identifier |
| Interface Version | `1.0` | Interface version |
| Document Type | `Eingangsrechnung` | Default document type |
| Generating System | `Flowbit Invoice System` | System identifier in XML |
| Default Currency | `EUR` | Fallback currency |
| Confidence Threshold | `0.5` | Minimum LLM confidence to accept field |
| Gross Tolerance | `0.02` | Allowed rounding difference (EUR) |
| PDF Timeout | `30000` ms | PDF download timeout |
| Max PDF Size | `10 MB` | Maximum PDF file size |
| Compression Level | `6` | ZIP DEFLATE compression (0-9) |
| Advisor Number | `23433` | DATEV BeraterNr |
| Client Number | `4605` | DATEV MandantNr |
| Default Posting Key | `31` | Vendor invoices with input tax |
| Default Tax Type | `VST` | Vorsteuer (input tax) |
| Function Timeout | `120` seconds | Vercel function max execution time |

### XML Ledger Field Order

The XML ledger elements follow a strict field ordering (Order 1-41 per DATEV schema):

| Order | Element | Description |
|-------|---------|-------------|
| 1 | `date` | Transaction date |
| 2 | `amount` | Line gross amount |
| 3 | `discountAmount` | Cash discount amount |
| 4 | `accountNo` | GL account number |
| 5 | `buCode` | BU posting key |
| 7 | `costCategoryId` | Cost category |
| 9 | `tax` | VAT rate |
| 10 | `information` | Document summary (max 120 chars) |
| 11 | `currencyCode` | Currency code |
| 12 | `invoiceId` | Invoice number |
| 13 | `bookingText` | Posting description (max 30 chars) |
| 15 | `ownVatId` | Buyer's VAT ID |
| 16 | `shipFromCountry` | Supplier country |
| 18 | `paidAt` | Payment date (if already paid) |
| 20 | `vatId` | Supplier VAT ID |
| 21 | `shipToCountry` | Destination country |
| 26 | `iban` | IBAN (modern SEPA standard) |
| 28 | `accountName` | Account holder name |
| 30 | `paymentOrder` | Payment order flag |
| 31 | `discountPercentage` | Cash discount percentage |
| 32 | `discountPaymentDate` | Discount payment deadline |
| 36 | `dueDate` | Payment due date |
| 37 | `bpAccountNo` | Business partner account number |
| 38 | `deliveryDate` | Delivery/service date |
| 39 | `orderId` | Purchase order reference |
| 40 | `supplierName` / `customerName` | Party name (direction-dependent) |
| 41 | `supplierCity` / `customerCity` | Party city (direction-dependent) |

Fields with `undefined`/`null`/empty values are omitted from the XML output.
