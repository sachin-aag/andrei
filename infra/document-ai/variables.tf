variable "project_id" {
  type        = string
  description = "GCP project that owns the Document AI processor (GOOGLE_VERTEX_PROJECT)."
}

variable "location" {
  type        = string
  description = "Processor region. Must be us or eu — never global (that is DOCUMENT_EXTRACT_LOCATION for Gemini)."
  default     = "us"

  validation {
    condition     = contains(["us", "eu"], var.location)
    error_message = "Document AI location must be us or eu, not global."
  }
}

variable "display_name" {
  type        = string
  description = "Unique display name for the Enterprise OCR processor."
  default     = "andrei-enterprise-ocr"
}

variable "runtime_service_account_email" {
  type        = string
  description = "Vercel WIF runtime SA (GCP_SERVICE_ACCOUNT_EMAIL)."
}
