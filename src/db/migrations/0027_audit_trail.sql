CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."audit_action" AS ENUM(
    'report_created',
    'report_updated',
    'report_deleted',
    'report_submitted',
    'report_approved',
    'report_feedback',
    'section_updated',
    'comment_created',
    'comment_updated',
    'comment_status_changed',
    'comment_deleted',
    'suggestion_generated',
    'suggestion_applied',
    'evaluation_run',
    'evaluation_bypassed',
    'signature_submission',
    'signature_approval',
    'signature_rejection',
    'user_created',
    'user_updated',
    'user_password_reset',
    'policy_updated',
    'auth_password_changed',
    'auth_password_reset',
    'improve_ai_session_created',
    'improve_ai_session_completed',
    'improve_ai_response_updated'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."audit_entity" AS ENUM(
    'report',
    'section',
    'comment',
    'suggestion',
    'evaluation',
    'signature',
    'user',
    'policy',
    'auth',
    'improve_ai'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."signature_meaning" AS ENUM('submission', 'approval', 'rejection');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" text PRIMARY KEY NOT NULL,
  "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "report_id" text,
  "actor_id" text NOT NULL,
  "actor_name" text NOT NULL,
  "actor_role" text NOT NULL,
  "action" "audit_action" NOT NULL,
  "entity_type" "audit_entity" NOT NULL,
  "entity_id" text NOT NULL,
  "summary" text NOT NULL,
  "old_value" jsonb,
  "new_value" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prev_hash" text DEFAULT '' NOT NULL,
  "hash" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "section_content_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "report_id" text NOT NULL,
  "section" "section_type" NOT NULL,
  "version_no" integer NOT NULL,
  "is_snapshot" boolean DEFAULT false NOT NULL,
  "content_snapshot" jsonb,
  "diff" jsonb,
  "content_hash" text NOT NULL,
  "audit_event_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "electronic_signatures" (
  "id" text PRIMARY KEY NOT NULL,
  "report_id" text NOT NULL,
  "signer_id" text NOT NULL,
  "signer_name" text NOT NULL,
  "meaning" "signature_meaning" NOT NULL,
  "signed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "auth_method" text DEFAULT 'password' NOT NULL,
  "audit_event_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "section_content_versions" ADD CONSTRAINT "section_content_versions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "section_content_versions" ADD CONSTRAINT "section_content_versions_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."audit_events"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "electronic_signatures" ADD CONSTRAINT "electronic_signatures_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "electronic_signatures" ADD CONSTRAINT "electronic_signatures_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."audit_events"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_report_seq_idx" ON "audit_events" USING btree ("report_id", "seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_actor_created_idx" ON "audit_events" USING btree ("actor_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type", "entity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "section_content_versions_report_section_version_unique" ON "section_content_versions" USING btree ("report_id", "section", "version_no");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_events_canonical_payload(
  p_prev_hash text,
  p_actor_id text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_old_value jsonb,
  p_new_value jsonb,
  p_created_at timestamptz
) RETURNS text AS $$
BEGIN
  RETURN COALESCE(p_prev_hash, '') || '|' ||
    COALESCE(p_actor_id, '') || '|' ||
    COALESCE(p_action, '') || '|' ||
    COALESCE(p_entity_type, '') || '|' ||
    COALESCE(p_entity_id, '') || '|' ||
    COALESCE(p_old_value::text, 'null') || '|' ||
    COALESCE(p_new_value::text, 'null') || '|' ||
    COALESCE(p_created_at::text, '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_events_before_insert()
RETURNS trigger AS $$
DECLARE
  prev text;
  ts timestamptz;
BEGIN
  ts := COALESCE(NEW.created_at, now());
  NEW.created_at := ts;

  SELECT hash INTO prev
  FROM audit_events
  ORDER BY seq DESC
  LIMIT 1
  FOR UPDATE;

  IF prev IS NULL THEN
    prev := '';
  END IF;

  NEW.prev_hash := prev;
  NEW.hash := encode(
    digest(
      audit_events_canonical_payload(
        prev,
        NEW.actor_id,
        NEW.action::text,
        NEW.entity_type::text,
        NEW.entity_id,
        NEW.old_value,
        NEW.new_value,
        ts
      ),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_append_only_guard()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Append-only table: % on % is not permitted', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_hash_chain ON audit_events;
--> statement-breakpoint
CREATE TRIGGER audit_events_hash_chain
  BEFORE INSERT ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION audit_events_before_insert();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_append_only_update ON audit_events;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION audit_append_only_guard();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_append_only_delete ON audit_events;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION audit_append_only_guard();
--> statement-breakpoint
DROP TRIGGER IF EXISTS section_content_versions_append_only_update ON section_content_versions;
--> statement-breakpoint
CREATE TRIGGER section_content_versions_append_only_update
  BEFORE UPDATE ON section_content_versions
  FOR EACH ROW
  EXECUTE FUNCTION audit_append_only_guard();
--> statement-breakpoint
DROP TRIGGER IF EXISTS section_content_versions_append_only_delete ON section_content_versions;
--> statement-breakpoint
CREATE TRIGGER section_content_versions_append_only_delete
  BEFORE DELETE ON section_content_versions
  FOR EACH ROW
  EXECUTE FUNCTION audit_append_only_guard();
--> statement-breakpoint
DROP TRIGGER IF EXISTS electronic_signatures_append_only_update ON electronic_signatures;
--> statement-breakpoint
CREATE TRIGGER electronic_signatures_append_only_update
  BEFORE UPDATE ON electronic_signatures
  FOR EACH ROW
  EXECUTE FUNCTION audit_append_only_guard();
--> statement-breakpoint
DROP TRIGGER IF EXISTS electronic_signatures_append_only_delete ON electronic_signatures;
--> statement-breakpoint
CREATE TRIGGER electronic_signatures_append_only_delete
  BEFORE DELETE ON electronic_signatures
  FOR EACH ROW
  EXECUTE FUNCTION audit_append_only_guard();
