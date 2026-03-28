variable "civo_token" {
  type      = string
  sensitive = true
}

variable "region" {
  type    = string
  default = "LON1"
}

variable "node_size" {
  type    = string
  default = "g4s.kube.small"
}

variable "node_count" {
  type    = number
  default = 1
}

variable "chart_version" {
  type    = string
  default = "0.19.0"
}

variable "image_tag" {
  type = string
}

variable "customers" {
  type = map(object({
    discord_token         = string
    client_id             = string
    playlists_channel_id  = string
    bot_debug_channel_id  = string
    owner_user_id         = string
    sentry_dsn            = string
    spotify_client_id     = string
    spotify_client_secret = string
    spotify_market        = optional(string, "DE")
    fallback_source       = optional(string, "")
    disabled_commands     = optional(string, "maintenance,lockdown")
    mistral_api_key       = optional(string, "")
    openai_api_key        = optional(string, "")
  }))
}
