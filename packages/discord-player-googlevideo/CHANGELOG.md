# discord-player-googlevideo

## 0.3.0

### Minor Changes

- 5bba1cc: Recover from YouTube stream protection instead of stopping after about a minute of audio. The extractor now reuses one BotGuard session, re-mints PO tokens when SABR asks for them, starts a new BotGuard session when the token is not accepted, handles player reload requests, stubs the canvas context BotGuard reads, and resumes a failed stream from its last snapshot.

## 0.2.8

### Patch Changes

- d673d07: Set `streamError` on the track metadata when the SABR stream fails mid-playback, instead of ending the output as if the track finished.
- 50139de: Update dependencies

## 0.2.7

### Patch Changes

- 84774c5: Upgrade jsdom to version 30 and require its supported Node.js runtime.

## 0.2.6

### Patch Changes

- 24ae6da: Fix PO token generation

## 0.2.5

### Patch Changes

- cdb1702: Update youtubei.js to v17

## 0.2.4

### Patch Changes

- f187a62: Use `outputStream.end()` instead of `outputStream.destroy(error)` on stream failures to give FFmpeg a clean EOF, allowing discord-player to advance the queue instead of silently stalling

## 0.2.3

### Patch Changes

- 5a1e735: Fix https://github.com/LuanRT/YouTube.js/issues/1146

## 0.2.2

### Patch Changes

- 284b449: Fix 60-second streaming limitation with proper PO token generation

## 0.2.1

### Patch Changes

- a3b4820: YouTube playlist support

## 0.2.0

### Minor Changes

- e2e72cd: Update dependencies, fix CJS compatibility

## 0.1.2

### Patch Changes

- 1274910: README and package.json updates

## 0.1.1

### Patch Changes

- f9ae122: README update, testing setup changes

## 0.1.0

### Minor Changes

- 3ca014a: Initial release of discord-player-googlevideo extractor
