ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "payload_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_events_canonical_payload_v2(
  p_prev_hash text,
  p_report_id text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_summary text,
  p_old_value jsonb,
  p_new_value jsonb,
  p_metadata jsonb,
  p_created_at timestamptz
) RETURNS text AS $$
BEGIN
  RETURN COALESCE(p_prev_hash, '') || '|' ||
    COALESCE(p_report_id, '') || '|' ||
    COALESCE(p_actor_id, '') || '|' ||
    COALESCE(p_actor_name, '') || '|' ||
    COALESCE(p_actor_role, '') || '|' ||
    COALESCE(p_action, '') || '|' ||
    COALESCE(p_entity_type, '') || '|' ||
    COALESCE(p_entity_id, '') || '|' ||
    COALESCE(p_summary, '') || '|' ||
    COALESCE(p_old_value::text, 'null') || '|' ||
    COALESCE(p_new_value::text, 'null') || '|' ||
    COALESCE(p_metadata::text, 'null') || '|' ||
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

  NEW.payload_version := 2;
  NEW.prev_hash := prev;
  NEW.hash := encode(
    digest(
      audit_events_canonical_payload_v2(
        prev,
        NEW.report_id,
        NEW.actor_id,
        NEW.actor_name,
        NEW.actor_role,
        NEW.action::text,
        NEW.entity_type::text,
        NEW.entity_id,
        NEW.summary,
        NEW.old_value,
        NEW.new_value,
        NEW.metadata,
        ts
      ),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
