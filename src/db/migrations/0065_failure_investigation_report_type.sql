-- MJ-only Investigation Report DS (SOP/QA/017-F01 R01), the Drug Substance unit
-- investigation form. Distinct from `investigation_report` (SOP/DP/QA/008, Drug
-- Product, DMAIC) — both forms are live at MJ and neither replaces the other.
-- Adding the value only; no existing row changes to this type.
ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'failure_investigation_report';
