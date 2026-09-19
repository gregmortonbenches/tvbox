ALTER TABLE "list_entries" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "list_entries" ADD COLUMN "wanted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "list_entries" ADD CONSTRAINT "list_entries_wanted_by_user_id_users_id_fk" FOREIGN KEY ("wanted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_entries_position_idx" ON "list_entries" USING btree ("status","position");--> statement-breakpoint
CREATE INDEX "list_entries_wanted_by_idx" ON "list_entries" USING btree ("wanted_by_user_id");