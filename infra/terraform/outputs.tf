output "kubeconfig" {
  value     = civo_kubernetes_cluster.main.kubeconfig
  sensitive = true
}

output "cluster_id" {
  value = civo_kubernetes_cluster.main.id
}

output "customer_namespaces" {
  value = { for k, v in kubernetes_namespace.customer : k => v.metadata[0].name }
}
