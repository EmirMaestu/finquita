CREATE TABLE "off_cache" (
	"code" text PRIMARY KEY NOT NULL,
	"found" boolean NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
