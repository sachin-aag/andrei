output "runtime_service_account_email" {
  value = var.runtime_service_account_email
}

output "speech_api" {
  value = google_project_service.speech.service
}
