CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"cuit" text,
	"tax_condition" text,
	"hours" text,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"register_id" uuid,
	"token_hash" text,
	"enabled_by" uuid,
	"enabled_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_permissions" (
	"member_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"nickname" text,
	"role" text NOT NULL,
	"email" text,
	"phone" text,
	"auth_user_id" text,
	"pin_hash" text,
	"pin_failed_attempts" integer DEFAULT 0 NOT NULL,
	"pin_locked_until" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"number" integer NOT NULL,
	"suggested_float_cents" bigint DEFAULT 0 NOT NULL,
	"tolerance_cents" bigint DEFAULT 50000 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shift_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"reason" text,
	"category" text,
	"note" text,
	"photo_url" text,
	"ref_type" text,
	"ref_id" uuid,
	"member_id" uuid,
	"authorized_by" uuid,
	"device_id" uuid,
	"device_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"opening_float_cents" bigint NOT NULL,
	"opening_counts" jsonb,
	"previous_left_cents" bigint,
	"opening_note" text,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"expected_cash_cents" bigint,
	"counted_cash_cents" bigint,
	"closing_counts" jsonb,
	"other_media" jsonb,
	"difference_cents" bigint,
	"close_note" text,
	"left_float_cents" bigint,
	"withdrawn_cents" bigint,
	"server_mismatch_cents" bigint,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "barcodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"default_margin_bp" integer,
	"age_restricted" boolean DEFAULT false NOT NULL,
	"tracks_expiry" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text,
	"expires_on" date NOT NULL,
	"qty_remaining" numeric(12, 3) DEFAULT 0 NOT NULL,
	"receipt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"kind" text DEFAULT 'product' NOT NULL,
	"internal_code" text,
	"sale_unit" text DEFAULT 'unit' NOT NULL,
	"purchase_unit_name" text,
	"purchase_unit_qty" numeric(12, 3),
	"stock_base_id" uuid,
	"stock_base_factor" numeric(12, 3),
	"cost_cents" bigint,
	"avg_cost_cents" bigint,
	"margin_bp" integer,
	"price_cents" bigint DEFAULT 0 NOT NULL,
	"fixed_price" boolean DEFAULT false NOT NULL,
	"vat_bp" integer DEFAULT 2100 NOT NULL,
	"stock_qty" numeric(12, 3) DEFAULT 0 NOT NULL,
	"min_stock" numeric(12, 3),
	"container_product_id" uuid,
	"location" text,
	"tracks_expiry" boolean DEFAULT false NOT NULL,
	"age_restricted" boolean DEFAULT false NOT NULL,
	"commission_bp" integer,
	"photo_url" text,
	"quick_button" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"price_review" boolean DEFAULT false NOT NULL,
	"price_updated_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "products_price_nonneg" CHECK ("products"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "promotion_products" (
	"promotion_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(12, 3) DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category_id" uuid,
	"starts_on" date,
	"ends_on" date,
	"weekdays" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"resulting_qty" numeric(12, 3),
	"reason" text,
	"note" text,
	"photo_url" text,
	"status" text DEFAULT 'applied' NOT NULL,
	"lot_id" uuid,
	"ref_type" text,
	"ref_id" uuid,
	"member_id" uuid,
	"device_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"device_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"due_on" date,
	"sale_id" uuid,
	"reverses_id" uuid,
	"method" text,
	"note" text,
	"member_id" uuid,
	"authorized_by" uuid,
	"device_id" uuid,
	"device_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"nickname" text,
	"phone" text,
	"address" text,
	"dni" text,
	"credit_limit_cents" bigint DEFAULT 0 NOT NULL,
	"terms" text DEFAULT '30d' NOT NULL,
	"terms_days" integer DEFAULT 30 NOT NULL,
	"balance_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"qty_ordered" numeric(12, 3) NOT NULL,
	"qty_confirmed" numeric(12, 3),
	"qty_received" numeric(12, 3),
	"pack_qty" numeric(12, 3),
	"unit_cost_cents" bigint,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"expected_on" date,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receipt_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"order_line_id" uuid,
	"qty" numeric(12, 3) NOT NULL,
	"damaged_qty" numeric(12, 3) DEFAULT 0 NOT NULL,
	"unit_cost_cents" bigint,
	"previous_cost_cents" bigint,
	"lot_code" text,
	"expires_on" date
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supplier_id" uuid,
	"order_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"photo_url" text,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"member_id" uuid,
	"device_id" uuid,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"note" text,
	"member_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standing_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"standing_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standing_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supplier_id" uuid NOT NULL,
	"receipt_id" uuid,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"number" text,
	"issued_on" date NOT NULL,
	"due_on" date,
	"amount_cents" bigint NOT NULL,
	"paid_cents" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"photo_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invoice_id" uuid,
	"amount_cents" bigint NOT NULL,
	"method" text NOT NULL,
	"cash_movement_id" uuid,
	"photo_url" text,
	"note" text,
	"member_id" uuid,
	"paid_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supplier_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_code" text,
	"cost_cents" bigint,
	"pack_qty" numeric(12, 3),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"cuit" text,
	"category" text,
	"contact_name" text,
	"whatsapp" text,
	"email" text,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"order_days" jsonb,
	"delivery_days" jsonb,
	"schedule_note" text,
	"lead_days" integer,
	"min_order_cents" bigint,
	"payment_terms_days" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text DEFAULT 'product' NOT NULL,
	"product_id" uuid,
	"category_id" uuid,
	"description" text NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"unit_cost_cents" bigint,
	"promotion_id" uuid,
	"note" text,
	"returned_qty" numeric(12, 3) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"tendered_cents" bigint,
	"surcharge_cents" bigint DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"customer_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sale_return_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"return_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"total_cents" bigint NOT NULL,
	"destination" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"refund_method" text NOT NULL,
	"total_cents" bigint NOT NULL,
	"member_id" uuid,
	"authorized_by" uuid,
	"device_id" uuid,
	"device_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"shift_id" uuid,
	"number" integer NOT NULL,
	"member_id" uuid NOT NULL,
	"customer_id" uuid,
	"status" text DEFAULT 'completed' NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"surcharge_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"change_cents" bigint DEFAULT 0 NOT NULL,
	"receipt_type" text DEFAULT 'ticket' NOT NULL,
	"note" text,
	"device_id" uuid,
	"device_at" timestamp with time zone NOT NULL,
	"clock_skew" boolean DEFAULT false NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"authorized_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_reads" (
	"alert_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"ref_type" text,
	"ref_id" text,
	"dedupe_key" text,
	"status" text DEFAULT 'open' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"member_id" uuid,
	"authorized_by" uuid,
	"device_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_ops" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"device_id" uuid,
	"member_id" uuid,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"reason" text,
	"device_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_enabled_by_members_id_fk" FOREIGN KEY ("enabled_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_permissions" ADD CONSTRAINT "member_permissions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_members_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_base_id_products_id_fk" FOREIGN KEY ("stock_base_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_container_product_id_products_id_fk" FOREIGN KEY ("container_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_ledger" ADD CONSTRAINT "customer_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_payment_id_customer_ledger_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."customer_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_charge_id_customer_ledger_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."customer_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortages" ADD CONSTRAINT "shortages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_order_lines" ADD CONSTRAINT "standing_order_lines_standing_order_id_standing_orders_id_fk" FOREIGN KEY ("standing_order_id") REFERENCES "public"."standing_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_order_lines" ADD CONSTRAINT "standing_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_orders" ADD CONSTRAINT "standing_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_lines" ADD CONSTRAINT "sale_return_lines_return_id_sale_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."sale_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_lines" ADD CONSTRAINT "sale_return_lines_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_reads" ADD CONSTRAINT "alert_reads_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_uq" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "member_permissions_pk" ON "member_permissions" USING btree ("member_id","permission");--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_uq" ON "members" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "members_auth_uq" ON "members" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "cash_movements_shift_idx" ON "cash_movements" USING btree ("shift_id","created_at");--> statement-breakpoint
CREATE INDEX "cash_movements_ref_idx" ON "cash_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "shifts_register_idx" ON "shifts" USING btree ("register_id","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "barcodes_code_uq" ON "barcodes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "barcodes_product_idx" ON "barcodes" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "lots_expires_idx" ON "lots" USING btree ("expires_on");--> statement-breakpoint
CREATE UNIQUE INDEX "products_internal_code_uq" ON "products" USING btree ("internal_code") WHERE "products"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_products_pk" ON "promotion_products" USING btree ("promotion_id","product_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_ref_idx" ON "stock_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "customer_ledger_customer_idx" ON "customer_ledger" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ledger_allocations_charge_idx" ON "ledger_allocations" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_order_idx" ON "purchase_order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_number_uq" ON "purchase_orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "receipt_lines_receipt_idx" ON "receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "supplier_invoices_supplier_idx" ON "supplier_invoices" USING btree ("supplier_id","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_products_uq" ON "supplier_products" USING btree ("supplier_id","product_id");--> statement-breakpoint
CREATE INDEX "supplier_products_product_idx" ON "supplier_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sale_lines_sale_idx" ON "sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_lines_product_idx" ON "sale_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sale_payments_sale_idx" ON "sale_payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sales_register_number_idx" ON "sales" USING btree ("register_id","number");--> statement-breakpoint
CREATE INDEX "sales_device_at_idx" ON "sales" USING btree ("device_at");--> statement-breakpoint
CREATE INDEX "sales_shift_idx" ON "sales" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_reads_pk" ON "alert_reads" USING btree ("alert_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_dedupe_uq" ON "alerts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_member_idx" ON "audit_log" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "sync_ops_device_idx" ON "sync_ops" USING btree ("device_id","created_at");