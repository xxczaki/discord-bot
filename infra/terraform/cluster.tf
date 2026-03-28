resource "civo_firewall" "main" {
  name                 = "discord-bot"
  create_default_rules = false
  region               = var.region

  ingress_rule {
    label      = "kubernetes-api"
    protocol   = "tcp"
    port_range = "6443"
    cidr       = ["0.0.0.0/0"]
    action     = "allow"
  }

  egress_rule {
    label      = "all-tcp"
    protocol   = "tcp"
    port_range = "1-65535"
    cidr       = ["0.0.0.0/0"]
    action     = "allow"
  }

  egress_rule {
    label      = "all-udp"
    protocol   = "udp"
    port_range = "1-65535"
    cidr       = ["0.0.0.0/0"]
    action     = "allow"
  }
}

resource "civo_kubernetes_cluster" "main" {
  name        = "discord-bot"
  region      = var.region
  firewall_id = civo_firewall.main.id

  pools {
    size       = var.node_size
    node_count = var.node_count
  }
}
