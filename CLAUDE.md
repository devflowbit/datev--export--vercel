# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vercel serverless function that converts LLM-extracted invoice data into DATEV-compliant XML exports with PDF packaging. Handles German accounting standards (DATEV Ledger Import v6.0) for incoming/outgoing invoices and credit notes.

## Commands

- **Type check:** `npm run build` (runs `tsc --noEmit`, no emitted output)
- **Install deps:** `npm install`
- **Deploy:** Managed via Vercel (auto-deploys from Git). No test framework is configured.

## Architecture

### Request Pipeline (5 stages)

`POST /api/datev-export` processes a single invoice through sequential stages:

1. **Parse** (`DatevParserService`) — Transform LLM JSON into `DatevDocument` structure
2. **PDF Acquire** (`PDFService`) — Download from Azure SAS URL or generate fallback PDF
3. **Validate** (`DatevValidatorService`) — 3-layer validation: required fields → format → business rules
4. **XML Generate** (`DatevXMLGeneratorService`) — Produce DATEV Ledger Import v6.0 XML
5. **ZIP Package** (`DatevZipPackagerService`) — Bundle XML + PDF + document.xml manifest

### Key Directory Layout

- `api/` — Vercel serverless function entry points (`datev-export.ts` is the main endpoint)
- `src/services/` — Business logic (one service per pipeline stage, plus `WebhookNotificationService`, `ErrorFormatterService`, `VATValidationService`)
- `src/models/` — TypeScript interfaces (`DatevDocument`, `LLMDataInput`, validation types)
- `src/config/datevConfig.ts` — All app configuration and defaults (accounts, thresholds, webhook settings)
- `src/constants/` — BU posting keys (`buKeys.ts`), bilingual error catalog (`errorMessages.ts`), required field definitions

### Data Flow

Input (`LLMDataInput`) has nested fields with `{ value, confidence, source, error }` structure. The parser extracts `.value` from each field, applies confidence thresholds (default 0.5), and maps to flat `DatevDocument` properties.

### Validation Modes

Controlled by `DATEV_MODE` env var (`test` or `prod`, default: `test`). Test mode downgrades many errors to warnings and allows placeholder VAT IDs (DEXXXXXXXXX).

### Document Direction & Party Swapping

- **Incoming (Eingangsrechnung):** vendor=supplier, customer=buyer (normal)
- **Outgoing (Ausgangsrechnung):** parties are SWAPPED in XML output
- **Credit Note:** behaves like incoming

### VAT / BU Key Logic

VAT treatment is derived from supplier country and invoice flags, mapped to DATEV BU-Schlüssel:
- BU 9/8: Inland 19%/7%, BU 19/18: Intra-EU goods, BU 94-95/91-92: Reverse charge

### Error Handling

Bilingual (DE/EN) error messages via `ErrorFormatterService`. Errors have codes, categories, severity, and user suggestions. Error responses include structured `errors`/`warnings` arrays with counts.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `COMPANY_VAT_ID` | Yes | German VAT ID (DE + 9 digits) |
| `DATEV_MODE` | No | `test` (default) or `prod` |
| `API_KEY` | No | Webhook x-api-key header |
| `ADMIN_API_KEY` | No | Webhook App-Secret signing key |
| `WEBHOOK_TIMEOUT_MS` | No | Webhook timeout (default: 30000) |
| `WEBHOOK_MAX_RETRIES` | No | Webhook retries (default: 3) |
| `WEBHOOK_ALLOW_HTTP` | No | Allow HTTP webhooks (default: false) |

## Key Constraints

- Function timeout: 120 seconds (`vercel.json`)
- PDF max size: 10MB
- TypeScript strict mode is OFF (`tsconfig.json`)
- Module system: CommonJS targeting ES2020
- German number format throughout (1.234,56 → use `numberFormatter.ts` utilities)
- Line item sum tolerance: ±0.02 EUR
