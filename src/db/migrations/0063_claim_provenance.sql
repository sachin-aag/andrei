ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'claim_verified';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'claim_unsupported';
