resource "google_project_service" "documentai" {
  project            = var.project_id
  service            = "documentai.googleapis.com"
  disable_on_destroy = false
}

# Enterprise Document OCR (OCR_PROCESSOR). Do not switch this to
# FORM_PARSER_PROCESSOR — that path is ~20× the OCR cost.
resource "google_document_ai_processor" "ocr" {
  project      = var.project_id
  location     = var.location
  display_name = var.display_name
  type         = "OCR_PROCESSOR"

  depends_on = [google_project_service.documentai]
}

# ProcessDocument from Vercel (WIF) and any other callers using this SA.
resource "google_project_iam_member" "runtime_api_user" {
  project = var.project_id
  role    = "roles/documentai.apiUser"
  member  = "serviceAccount:${var.runtime_service_account_email}"
}
