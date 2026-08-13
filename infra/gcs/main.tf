resource "google_project_service" "storage" {
  project            = var.project_id
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

resource "google_storage_bucket" "attachments" {
  name                        = var.bucket_name
  project                     = var.project_id
  location                    = var.location
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels

  versioning {
    enabled = false
  }

  # Browser resumable uploads (createResumableUpload + Origin).
  cors {
    origin          = var.cors_origins
    method          = ["GET", "HEAD", "PUT", "POST", "OPTIONS"]
    response_header = ["Content-Type", "Content-Length", "Content-Range", "x-goog-resumable", "x-goog-content-length-range"]
    max_age_seconds = 3600
  }

  # Only ephemeral prefixes — never reports/ (permanent evidence).
  lifecycle_rule {
    condition {
      age            = var.staging_temp_age_days
      matches_prefix = ["staging/"]
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age            = var.staging_temp_age_days
      matches_prefix = ["temp/"]
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.storage]
}

# Dedicated attachments bucket: object create/read/delete/list is enough.
# Avoid roles/storage.objectAdmin.
resource "google_storage_bucket_iam_member" "runtime_object_user" {
  bucket = google_storage_bucket.attachments.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${var.runtime_service_account_email}"
}

# Required for Storage getSignedUrl (iam.serviceAccounts.signBlob).
resource "google_service_account_iam_member" "runtime_token_creator" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.runtime_service_account_email}"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${var.runtime_service_account_email}"
}