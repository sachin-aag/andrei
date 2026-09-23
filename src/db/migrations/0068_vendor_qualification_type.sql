-- 3xper Innoventure vendor qualification (QAD-SOP-MS-001-F04).
-- Adding the value only; no existing row changes to this type.
ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'vendor_qualification';
