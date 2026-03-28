resource "kubernetes_namespace" "customer" {
  for_each = var.customers

  metadata {
    name = "bot-${each.key}"

    labels = {
      "app.kubernetes.io/managed-by" = "terraform"
      "customer"                     = each.key
    }
  }
}

resource "kubernetes_secret" "customer" {
  for_each = var.customers

  metadata {
    name      = "secrets"
    namespace = kubernetes_namespace.customer[each.key].metadata[0].name
  }

  data = {
    token               = each.value.discord_token
    sentryDsn           = each.value.sentry_dsn
    spotifyClientSecret = each.value.spotify_client_secret
    openAiApiKey        = each.value.openai_api_key
    mistralApiKey       = each.value.mistral_api_key
  }
}

resource "helm_release" "customer" {
  for_each = var.customers

  name       = "discord-bot"
  namespace  = kubernetes_namespace.customer[each.key].metadata[0].name
  repository = "https://xxczaki.github.io/charts/"
  chart      = "discord-bot"
  version    = var.chart_version

  depends_on = [kubernetes_secret.customer]

  values = [yamlencode({
    secrets = {
      token               = { name = "secrets", key = "token" }
      sentryDsn           = { name = "secrets", key = "sentryDsn" }
      spotifyClientSecret = { name = "secrets", key = "spotifyClientSecret" }
      openAiApiKey        = { name = "secrets", key = "openAiApiKey" }
      mistralApiKey       = { name = "secrets", key = "mistralApiKey" }
    }

    env = {
      clientId           = each.value.client_id
      playlistsChannelId = each.value.playlists_channel_id
      botDebugChannelId  = each.value.bot_debug_channel_id
      ownerUserId        = each.value.owner_user_id
      spotifyClientId    = each.value.spotify_client_id
      spotifyMarket      = each.value.spotify_market
      fallbackSource     = each.value.fallback_source
      disabledCommands   = each.value.disabled_commands
    }

    image = {
      repository = "ghcr.io/xxczaki/discord-bot"
      tag        = var.image_tag
    }

    resources = {
      requests = { memory = "128Mi", cpu = "50m" }
      limits   = { memory = "512Mi", cpu = "400m" }
    }

    redis = {
      architecture = "standalone"
      auth         = { enabled = false }
      master = {
        resources = {
          requests = { memory = "48Mi", cpu = "25m" }
          limits   = { memory = "128Mi", cpu = "100m" }
        }
      }
    }
  })]
}
