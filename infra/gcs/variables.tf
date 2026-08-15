variable "project_id" {
  type        = string
  description = "GCP project that owns the attachments bucket."
}

variable "bucket_name" {
  type        = string
  description = "Globally unique GCS bucket name (set as GCS_BUCKET on Vercel)."
}

variable "location" {
  type        = string
  description = "Bucket location (multi-region like EU/US, or a region)."
  default     = "EU"
}

variable "runtime_service_account_email" {
  type        = string
  description = "Vercel WIF runtime SA (GCP_SERVICE_ACCOUNT_EMAIL)."
}

variable "cors_origins" {
  type        = list(string)
  description = <<-EOT
    Exact browser Origins allowed for resumable uploads.
    GCS CORS does not support host wildcards — add each Vercel preview
    URL you need, plus production and localhost.
  EOT
}

variable "staging_temp_age_days" {
  type        = number
  description = "Delete objects under staging/ and temp/ after this many days. Permanent reports/ objects are never lifecycle-deleted."
  default     = 7
}

variable "labels" {
  type        = map(string)
  description = "Labels applied to the bucket."
  default = {
    app     = "andrei"
    purpose = "pdf-evidence-attachments"
  }
}