CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"parent_id" text,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"icon" text,
	"content" jsonb,
	"content_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_version" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_parent_id_document_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "document_workspaceId_idx" ON "document" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "document_parentId_idx" ON "document" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "document_version_documentId_createdAt_idx" ON "document_version" USING btree ("document_id","created_at");