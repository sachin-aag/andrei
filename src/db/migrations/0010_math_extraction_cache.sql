CREATE TABLE IF NOT EXISTS "math_extraction_cache" (
	"image_hash" text PRIMARY KEY NOT NULL,
	"latex" text NOT NULL,
	"mathml" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
