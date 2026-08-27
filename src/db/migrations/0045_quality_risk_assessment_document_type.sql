-- MJ Quality Risk Assessment reports (SOP/DP/QA/010 F02). Adding the value
-- only; no existing row changes to this type.
ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'quality_risk_assessment';
