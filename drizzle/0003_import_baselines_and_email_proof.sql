ALTER TABLE "handler_download_days" ADD COLUMN "imported_downloads" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "handler_versions" ADD COLUMN "imported_download_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "handlers" ADD COLUMN "imported_download_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_by_moderator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Hand-written backfill. Rows already imported from Mongo: their current counters are the Mongo totals
-- (v3 counts cannot be told apart before this column existed), so the next upsert import adds Mongo's
-- new downloads instead of counting the old ones twice. Rows created on v3 are never touched by the importer.
UPDATE "handlers" h SET "imported_download_count" = h."download_count"
  WHERE NOT EXISTS (SELECT 1 FROM "audit_log" a WHERE a."action" = 'handler.create' AND a."target_id" = h."id");--> statement-breakpoint
UPDATE "handler_versions" v SET "imported_download_count" = v."download_count"
  WHERE NOT EXISTS (SELECT 1 FROM "audit_log" a WHERE a."action" = 'version.upload' AND a."target_id" = v."id");--> statement-breakpoint
UPDATE "handler_download_days" d SET "imported_downloads" = d."downloads"
  WHERE NOT EXISTS (SELECT 1 FROM "audit_log" a WHERE a."action" = 'handler.create' AND a."target_id" = d."handler_id");--> statement-breakpoint
-- Addresses a moderator marked verified, unless an inbox proof (link, reset) or a change came later.
UPDATE "users" u SET "email_verified_by_moderator" = true
  WHERE u."email_verified_at" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "audit_log" a WHERE a."action" = 'user.verify_email' AND a."target_id" = u."id"
      AND NOT EXISTS (SELECT 1 FROM "audit_log" b WHERE b."target_id" = u."id" AND b."at" > a."at"
        AND b."action" IN ('auth.email_changed', 'auth.password_reset')));
