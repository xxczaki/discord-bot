---
"discord-player-googlevideo": minor
---

Recover from YouTube stream protection instead of stopping after about a minute of audio. The extractor now reuses one BotGuard session, re-mints PO tokens when SABR asks for them, starts a new BotGuard session when the token is not accepted, handles player reload requests, stubs the canvas context BotGuard reads, and resumes a failed stream from its last snapshot.
