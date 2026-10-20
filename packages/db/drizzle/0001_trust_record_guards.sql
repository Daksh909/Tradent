-- CLAUDE.md hard rule 3: the trust record is append-only.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: the trust record is append-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER decision_logs_append_only
  BEFORE UPDATE OR DELETE ON decision_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER fills_append_only
  BEFORE UPDATE OR DELETE ON fills
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER daily_metrics_no_delete
  BEFORE DELETE ON daily_metrics
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
-- CLAUDE.md hard rule 5: an agent version is immutable once its forward test starts.
CREATE OR REPLACE FUNCTION forbid_locked_version_change() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'agent version % is locked for forward testing; create a new version instead', OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_versions_locked
  BEFORE UPDATE OR DELETE ON agent_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_locked_version_change();
