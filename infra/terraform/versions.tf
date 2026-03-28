terraform {
  required_version = ">= 1.14.8"

  cloud {
    organization = "parsify"

    workspaces {
      name = "discord-bot"
    }
  }

  required_providers {
    civo = {
      source  = "civo/civo"
      version = "~> 1.1"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.17"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.35"
    }
  }
}
