---
"discord-player-googlevideo": patch
---

Use `outputStream.end()` instead of `outputStream.destroy(error)` on stream failures to give FFmpeg a clean EOF, allowing discord-player to advance the queue instead of silently stalling
