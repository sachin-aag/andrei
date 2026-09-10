variable "project_id" {
  type        = string
  description = "GCP project that owns Speech-to-Text (GOOGLE_VERTEX_PROJECT)."
}

variable "runtime_service_account_email" {
  type        = string
  description = "Vercel WIF runtime SA (GCP_SERVICE_ACCOUNT_EMAIL)."
}
