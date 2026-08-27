-- Demo-only continuous Word-like documents (one TipTap body, no DMAIC split).
-- Adding the value only; no existing row changes to this type.
ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'generic_document';
