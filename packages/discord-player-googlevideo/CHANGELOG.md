# discord-player-googlevideo

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
