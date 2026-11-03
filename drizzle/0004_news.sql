CREATE TYPE "public"."news_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TABLE "news" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"url" text,
	"severity" "news_severity" DEFAULT 'info' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_message_length" CHECK (char_length(message) between 1 and 500),
	CONSTRAINT "news_message_one_line" CHECK (message !~ '[\r\n]'),
	CONSTRAINT "news_url" CHECK (url is null or (url ~* '^https?://' and char_length(url) <= 2048)),
	CONSTRAINT "news_window" CHECK (ends_at is null or ends_at > starts_at)
);
--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_published_starts_idx" ON "news" USING btree ("starts_at" DESC NULLS LAST) WHERE published;