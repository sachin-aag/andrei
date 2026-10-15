-- Demo-pack Equipment Qualification Report (IQ / OQ / PQ), one editor per section.
-- Adding the value only; no existing row changes to this type.
ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'equipment_qualification_report';
