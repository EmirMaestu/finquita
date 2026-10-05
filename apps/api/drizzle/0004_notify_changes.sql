-- Además de registrar el cambio, avisa por NOTIFY (Postgres junta los avisos iguales de una transacción).
CREATE OR REPLACE FUNCTION log_change() RETURNS trigger AS $$
DECLARE
  rec record;
  key text;
  entity text := TG_TABLE_NAME;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  IF TG_TABLE_NAME = 'settings' THEN
    key := rec.key;
  ELSIF TG_TABLE_NAME = 'promotion_products' THEN
    entity := 'promotions';
    key := rec.promotion_id::text;
  ELSE
    key := rec.id::text;
  END IF;
  INSERT INTO change_log (entity, entity_id, op)
  VALUES (entity, key, CASE WHEN TG_OP = 'DELETE' AND TG_TABLE_NAME <> 'promotion_products' THEN 'delete' ELSE 'upsert' END);
  PERFORM pg_notify('mostrador_changes', entity);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_alert() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('mostrador_changes', 'alerts');
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER alerts_notify AFTER INSERT OR UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION notify_alert();
