output "bucket_name" {
  description = "Set this as GCS_BUCKET on Vercel Preview and Production."
  value       = google_storage_bucket.attachments.name
}

output "bucket_url" {
  value = google_storage_bucket.attachments.url
}

output "runtime_service_account_email" {
  value = var.runtime_service_account_email
}

output "cors_origins" {
  value = var.cors_origins
}

output "vercel_env_hint" {
  value = "printf '%s' '${google_storage_bucket.attachments.name}' | vercel env add GCS_BUCKET preview && printf '%s' '${google_storage_bucket.attachments.name}' | vercel env add GCS_BUCKET production"
}