-- MJ-only periodic Equipment Lifecycle Report (ELR): the consolidated review of
-- one piece of equipment since its last periodic re-qualification.
-- Adding the value only; no existing row changes to this type.
ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'equipment_lifecycle_report';
