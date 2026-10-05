-- Cada cambio en lo que necesita un dispositivo queda en change_log para GET /api/sync/pull.
CREATE OR REPLACE FUNCTION log_change() RETURNS trigger AS $$
DECLARE
  rec record;
  key text;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  IF TG_TABLE_NAME = 'settings' THEN
    key := rec.key;
  ELSIF TG_TABLE_NAME = 'promotion_products' THEN
    INSERT INTO change_log (entity, entity_id, op) VALUES ('promotions', rec.promotion_id::text, 'upsert');
    RETURN NULL;
  ELSE
    key := rec.id::text;
  END IF;
  INSERT INTO change_log (entity, entity_id, op)
  VALUES (TG_TABLE_NAME, key, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','barcodes','categories','customers','settings','registers','members','promotions','promotion_products','shifts','suppliers'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_change()', t || '_log_change', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Lo que ya existía entra al registro.
INSERT INTO change_log (entity, entity_id, op)
SELECT 'products', id::text, 'upsert' FROM products
UNION ALL SELECT 'barcodes', id::text, 'upsert' FROM barcodes
UNION ALL SELECT 'categories', id::text, 'upsert' FROM categories
UNION ALL SELECT 'customers', id::text, 'upsert' FROM customers
UNION ALL SELECT 'settings', key, 'upsert' FROM settings
UNION ALL SELECT 'registers', id::text, 'upsert' FROM registers
UNION ALL SELECT 'members', id::text, 'upsert' FROM members
UNION ALL SELECT 'promotions', id::text, 'upsert' FROM promotions
UNION ALL SELECT 'shifts', id::text, 'upsert' FROM shifts
UNION ALL SELECT 'suppliers', id::text, 'upsert' FROM suppliers;
