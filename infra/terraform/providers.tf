locals {
  kubeconfig = yamldecode(civo_kubernetes_cluster.main.kubeconfig)
}

provider "civo" {
  region = var.region
}

provider "kubernetes" {
  host                   = local.kubeconfig.clusters[0].cluster.server
  cluster_ca_certificate = base64decode(local.kubeconfig.clusters[0].cluster["certificate-authority-data"])
  token                  = local.kubeconfig.users[0].user.token
}

provider "helm" {
  kubernetes {
    host                   = local.kubeconfig.clusters[0].cluster.server
    cluster_ca_certificate = base64decode(local.kubeconfig.clusters[0].cluster["certificate-authority-data"])
    token                  = local.kubeconfig.users[0].user.token
  }
}
