terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.40.0, < 7.0.0"
    }
  }

  # Local state for now. Move to a remote backend (GCS/TFC) once this
  # stack is shared across machines/CI.
}