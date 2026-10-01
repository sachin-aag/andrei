locals {
  tenants = {
    for key, tenant in var.tenants : key => {
      bucket_name  = coalesce(tenant.bucket_name, "${var.project_id}-${key}-attachments")
      cors_origins = tenant.cors_origins
      labels       = merge(var.labels, { tenant = key }, tenant.labels)
    }
  }

  # Must match the headers the signed-URL / resumable-upload client reads.
  cors_response_headers = [
    "Content-Type",
    "Content-Length",
    "Content-Range",
    "Accept-Ranges",
    "ETag",
    "x-goog-resumable",
    "x-goog-content-length-range",
  ]
}

resource "google_project_service" "storage" {
  project            = var.project_id
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

resource "google_storage_bucket" "attachments" {
  for_each = local.tenants

  name                        = each.value.bucket_name
  project                     = var.project_id
  location                    = var.location
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = each.value.labels

  versioning {
    enabled = false
  }

  # Browser resumable uploads (createResumableUpload + Origin).
  cors {
    origin          = each.value.cors_origins
    method          = ["GET", "HEAD", "PUT", "POST", "OPTIONS"]
    response_header = local.cors_response_headers
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
  for_each = google_storage_bucket.attachments

  bucket = each.value.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${var.runtime_service_account_email}"
}

# Required for Storage getSignedUrl (iam.serviceAccounts.signBlob). Once per SA.
resource "google_service_account_iam_member" "runtime_token_creator" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.runtime_service_account_email}"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${var.runtime_service_account_email}"
}

# Existing single-bucket state (andrei-493614-attachments) → shared tenant.
moved {
  from = google_storage_bucket.attachments
  to   = google_storage_bucket.attachments["shared"]
}

moved {
  from = google_storage_bucket_iam_member.runtime_object_user
  to   = google_storage_bucket_iam_member.runtime_object_user["shared"]
}
