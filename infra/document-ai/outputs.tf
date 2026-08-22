output "location" {
  description = "Set this as DOCUMENT_AI_LOCATION on Vercel and in .env.local."
  value       = google_document_ai_processor.ocr.location
}

output "processor_id" {
  description = "Trailing processor UUID. Set as DOCUMENT_AI_PROCESSOR_ID."
  value       = google_document_ai_processor.ocr.name
}

output "processor_name" {
  description = "Full resource name (projects/.../processors/...)."
  value       = google_document_ai_processor.ocr.id
}

output "runtime_service_account_email" {
  value = var.runtime_service_account_email
}

output "vercel_env_hint" {
  value = <<-EOT
    printf '%s' '${google_document_ai_processor.ocr.location}' | vercel env add DOCUMENT_AI_LOCATION preview
    printf '%s' '${google_document_ai_processor.ocr.name}' | vercel env add DOCUMENT_AI_PROCESSOR_ID preview
  EOT
}
