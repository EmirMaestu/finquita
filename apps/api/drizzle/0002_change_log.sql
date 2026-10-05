CREATE TABLE "change_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"op" text NOT NULL,
	"xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "change_log_entity_idx" ON "change_log" USING btree ("entity","entity_id");