-- Convergent mechanical/hardware DV reports (825-00101 family) are a distinct
-- document type: numbered sections, one execution pair, deviations split from
-- failures. Adding the value only; no existing row changes to this type.
ALTER TYPE "public"."document_type" ADD VALUE IF NOT EXISTS 'mechanical_design_verification';
