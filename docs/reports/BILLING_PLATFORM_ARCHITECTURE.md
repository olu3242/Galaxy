# Billing Platform Architecture

## Overview

The Billing Platform (workstream H in `@galaxy/platform`) handles the financial data layer for Galaxy's multi-tenant SaaS model. All billing tables are protected by Row-Level Security using the standard `organization_id::text = current_setting('app.current_tenant', true)` policy, ensuring complete cross-tenant isolation for financial records.

## Services and Tables

**BillingService** manages `billing_accounts` (per-org billing relationship with status and currency) and `billing_profiles` (billing contact details and address). Each organization can have one primary account created via `createAccount` and a profile via `createProfile`. The service also exposes `listAccounts` for global admin views without tenant context.

**InvoiceService** manages `invoices` and `invoice_items`. Invoices support statuses: `draft`, `open`, `paid`, `void`, and `uncollectible`. The `createInvoice` method sets initial status to `draft`; `markPaid` transitions to `paid` and records `paid_at`. Line items are managed via `addItem`. **PaymentService** records payments to the `payments` table and issues credits via the `credits` table. Both tables track `amount_cents` as `BIGINT` to avoid floating-point issues.

## API Endpoints

- `POST /platform/billing/accounts` — create a billing account for an organization
- `GET /platform/billing/accounts` — list all billing accounts (admin view)
- `POST /platform/billing/invoices` — create an invoice
- `GET /platform/billing/invoices?organizationId=&status=` — list invoices with filters
