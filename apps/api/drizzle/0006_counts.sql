CREATE TABLE "stock_count_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"count_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"counted_qty" numeric(12, 3),
	"counted_by" uuid,
	"counted_at" timestamp with time zone,
	"system_qty" numeric(12, 3),
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"category_id" uuid,
	"location" text,
	"assigned_to" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_assigned_to_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_lines_uq" ON "stock_count_lines" USING btree ("count_id","product_id");--> statement-breakpoint
CREATE INDEX "stock_count_lines_count_idx" ON "stock_count_lines" USING btree ("count_id");