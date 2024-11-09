terraform {
  cloud {
    organization = "parsify"
    workspaces {
      name = "discord-bot"
    }
  }

  required_providers {
    scaleway = {
      source = "scaleway/scaleway"
    }
  }
  required_version = ">= 0.13"
}

provider "scaleway" {
  zone       = "pl-waw-1"
  region     = "pl-waw"
  project_id = var.project_id
}

resource "scaleway_vpc_private_network" "private_network" {}

resource "scaleway_k8s_cluster" "cluster" {
  name                        = "cluster"
  version                     = "1.30.2"
  cni                         = "cilium"
  private_network_id          = scaleway_vpc_private_network.private_network.id
  delete_additional_resources = true
}

resource "scaleway_k8s_pool" "pool" {
  cluster_id  = scaleway_k8s_cluster.cluster.id
  name        = "pool"
  node_type   = "DEV1-M"
  size        = 1
  autohealing = true
}

resource "scaleway_registry_namespace" "main" {
  name        = "main-cr"
  is_public   = false
}