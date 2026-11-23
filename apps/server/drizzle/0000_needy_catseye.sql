CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency_code" text NOT NULL,
	"created_at" bigint NOT NULL,
	"category_id" text
);
