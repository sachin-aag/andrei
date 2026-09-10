resource "google_project_service" "speech" {
  project            = var.project_id
  service            = "speech.googleapis.com"
  disable_on_destroy = false
}

# StreamingRecognize from Vercel (WIF) and any other callers using this SA.
resource "google_project_iam_member" "runtime_speech_client" {
  project = var.project_id
  role    = "roles/speech.client"
  member  = "serviceAccount:${var.runtime_service_account_email}"

  depends_on = [google_project_service.speech]
}
