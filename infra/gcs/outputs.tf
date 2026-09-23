output "bucket_names" {
  description = "Tenant key → GCS bucket name. Set the matching Vercel project's GCS_BUCKET."
  value       = { for key, bucket in google_storage_bucket.attachments : key => bucket.name }
}

output "bucket_urls" {
  value = { for key, bucket in google_storage_bucket.attachments : key => bucket.url }
}

output "cors_origins" {
  value = { for key, tenant in local.tenants : key => tenant.cors_origins }
}

output "runtime_service_account_email" {
  value = var.runtime_service_account_email
}

output "vercel_env_hints" {
  description = "One printf per tenant after linking that Vercel project."
  value = {
    for key, bucket in google_storage_bucket.attachments :
    key => "printf '%s' '${bucket.name}' | vercel env add GCS_BUCKET preview && printf '%s' '${bucket.name}' | vercel env add GCS_BUCKET production"
  }
}
