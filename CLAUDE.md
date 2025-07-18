# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Install dependencies
pnpm install

# Start the bot (builds and runs with pretty logging)
pnpm start

# Build for production
pnpm build

# Lint code with Biome
pnpm lint

# Type check with TypeScript
pnpm tsc

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/path/to/file.test.ts

# Run specific test file with coverage
pnpm test:coverage src/path/to/file.test.ts

# Full development workflow check
pnpm lint && pnpm tsc && pnpm test
```

## Project Architecture

This is a Discord music bot built with TypeScript using the discord-player library. The architecture follows a modular pattern:

### Core Structure

- **Entry Point**: `src/index.ts` → `src/utils/initializeBot.ts`
- **Bot Initialization**: Sequentially initializes commands, Discord client, player, and event handlers
- **Player**: Uses discord-player with YouTube and Spotify extractors, includes Opus file caching
- **Commands**: Defined in `src/constants/commands.ts`, handlers in `src/handlers/`
- **Event Handling**: Hook-based system in `src/hooks/` for Discord and player events
- **Utilities**: Shared utilities in `src/utils/` for common operations

### Key Components

- **Command System**: Slash commands with autocomplete, organized by categories (Music, Utilities, Fun, Other, Owner-only)
- **Music Player**: discord-player with custom Opus caching, Redis query cache, Spotify/YouTube integration
- **Caching**: Redis-backed query cache and on-disk Opus file cache for performance
- **Stats & Recovery**: Redis-backed playback statistics and queue recovery mechanism
- **Maintenance Mode**: Kubernetes API integration for deployment management

### Architecture Patterns

- **Hooks Pattern**: Event handlers organized as composable hooks (use* prefix)
- **Utility-First**: Extensive shared utilities for type-safe operations
- **Singleton Player**: Single player instance shared across the application
- **Stream Interception**: Custom stream handling for Opus caching

### Data Flow

1. Commands registered via `initializeCommands()` 
2. Discord client created and logged in
3. Player initialized with extractors and caching hooks
4. Event handlers attached via hooks system
5. Command interactions routed to specific handlers

### Testing

- **Framework**: Vitest with node environment
- **Coverage**: V8 provider with lcov reporting
- **Structure**: Tests colocated with source files (`*.test.ts`) in `tests/` directories
- **Setup**: `src/setupTests.ts` for global test configuration

#### Testing Requirements

- **Always run tests** before finishing any test-related work
- Use `pnpm test:coverage <test-file-path>` for specific test files
- Fix failures and TypeScript errors before completing tasks
- Test files named `*.test.ts` in `tests/` directory alongside source files

#### Test Organization

- Use `describe` blocks only for multiple distinct features in one file
- For single utilities, use `it` blocks directly
- Wrap code values in test names with backticks (e.g., `should save without \`requestedById\``)

#### Mocking Guidelines

- **Never mock** simple utilities (`isObject`, `pluralize`, etc.) - let them run naturally
- Only mock external dependencies and complex integrations (Discord.js, discord-player)
- Use proper ES module imports, never dynamic imports/require in tests
- Use `vi.mock()` for mocking, check `src/setupTests.ts` for existing global mocks
- **Don't duplicate mocks already defined globally** - redis, logger, and Sentry are already mocked in `setupTests.ts`
- **Don't create complex mocks for simple functions** - if a utility needs environment variables, either let it run naturally or use a simple mock
- Check global mocks in `setupTests.ts` before adding new vi.mock() calls to individual test files

#### Coverage Approach

- Focus on meaningful coverage, not arbitrary percentages
- Test main execution paths, error handling, and public API behavior
- Don't force 100% coverage at expense of test quality
- Some complex integrations may be difficult to test in isolation

#### Singleton Testing

- **Never add testing-specific reset functions** to production code (e.g., `resetForTesting()`)
- For singletons with complex external dependencies, test only what's testable without internal state manipulation
- Focus on testing the public API and exported constants rather than internal singleton behavior
- Use `/* v8 ignore start */` comments around complex initialization code that can't be easily tested

## Development Guidelines

### Code Style

- **Package Manager**: Always use `pnpm` for Node.js tasks
- **Comments**: Avoid entirely - code should be self-explanatory. Only add in extremely rare cases for non-obvious logic or workarounds
- **Class Syntax**: Use `#` notation for private fields/methods, avoid `public` keyword
- **Constants**: Use CONSTANT_CASE with units in names (e.g., `CACHE_WRITE_BUFFER_MS`)
- **Utilities**: Prefer existing utilities from `src/utils/` over custom logic
- **Logging**: Use `logger` from `src/utils/logger.ts` instead of console methods
- **Type Safety**: Use `isObject()`, `getEnvironmentVariable()` and other type-safe utilities
- **Variable Naming**: Use descriptive names, avoid single-letter variables (e.g., use `field` instead of `f`, `item` instead of `i`)

### Key Utilities Available

- `isObject()` - Type-safe object checking
- `getEnvironmentVariable()` - Environment variables with type safety  
- `snakeToCamelCase()` - String case conversion
- `logger` - Structured logging with Pino
- Various music/queue utilities for common operations

### Environment Requirements

- Node.js version defined in `.nvmrc`
- Redis instance required (configured via `REDIS_URL`)
- Discord bot token required
- Spotify credentials for enhanced search
