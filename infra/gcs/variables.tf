variable "project_id" {
  type        = string
  description = "GCP project that owns the attachments buckets."
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

variable "tenants" {
  type = map(object({
    # Override when the bucket already exists under a different name.
    # Default: {project_id}-{tenant_key}-attachments
    bucket_name  = optional(string)
    cors_origins = list(string)
    labels       = optional(map(string), {})
  }))
  description = <<-EOT
    One private attachments bucket per customer pack. Add a map entry for a
    new Vercel project, apply, then set that project's GCS_BUCKET to the
    output name. The `shared` key is the existing MJ/demo/Convergent bucket
    (andrei-493614-attachments) — do not rename it.
  EOT

  validation {
    condition     = length(var.tenants) > 0
    error_message = "Define at least one tenant (shared and/or a customer pack)."
  }

  validation {
    condition     = alltrue([for t in var.tenants : length(t.cors_origins) > 0])
    error_message = "Each tenant needs at least one CORS origin (GCS has no host wildcards)."
  }
}

variable "staging_temp_age_days" {
  type        = number
  description = "Delete objects under staging/ and temp/ after this many days. Permanent reports/ objects are never lifecycle-deleted."
  default     = 7
}

variable "labels" {
  type        = map(string)
  description = "Labels applied to every attachments bucket (merged with tenant=)."
  default = {
    app     = "andrei"
    purpose = "pdf-evidence-attachments"
  }
}
