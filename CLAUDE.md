# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Trilium Notes is a hierarchical note-taking application with synchronization, scripting, and rich text editing. TypeScript monorepo using pnpm with multiple apps and shared packages.

## Development Commands

```bash
# Setup
corepack enable && pnpm install

# Run
pnpm server:start              # Dev server at http://localhost:8080
pnpm desktop:start             # Electron dev app
pnpm standalone:start          # Standalone client dev

# Build
pnpm client:build              # Frontend
pnpm server:build              # Backend
pnpm desktop:build             # Electron

# Test
pnpm test:all                  # All tests (parallel + sequential)
pnpm test:parallel             # Client + most package tests
pnpm test:sequential           # Server, ckeditor5-mermaid, ckeditor5-math (shared DB)
pnpm --filter server test      # Single package tests
pnpm coverage                  # Coverage reports

# Lint & Format
pnpm dev:linter-check          # ESLint check
pnpm dev:linter-fix            # ESLint fix
pnpm dev:format-check          # Format check (stricter stylistic rules)
pnpm dev:format-fix            # Format fix
pnpm typecheck                 # TypeScript type check across all projects
```

**Running a single test file**: `pnpm --filter server test spec/etapi/search.spec.ts`

## Monorepo Structure

```
apps/
  client/               # Frontend (jQuery + Preact, shared by server & desktop)
  client-standalone/    # Standalone lightweight client
  server/               # Node.js backend (Express, better-sqlite3)
  desktop/              # Electron wrapper
  server-e2e/           # Playwright E2E tests for server
  web-clipper/          # Browser extension
  standalone-desktop/   # Standalone desktop app
  website/              # Project website
  db-compare/, dump-db/, edit-docs/, build-docs/, icon-pack-builder/

packages/
  trilium-core/         # Core business logic: entities, services, SQL, sync
  commons/              # Shared interfaces and utilities
  ckeditor5/            # Custom rich text editor bundle
  codemirror/           # Code editor integration
  highlightjs/          # Syntax highlighting
  share-theme/          # Theme for shared/published notes
  ckeditor5-admonition/, ckeditor5-footnotes/, ckeditor5-math/, ckeditor5-mermaid/
  ckeditor5-keyboard-marker/, express-partial-content/, pdfjs-viewer/, splitjs/
  turndown-plugin-gfm/
```

Use `pnpm --filter <package-name> <command>` to run commands in specific packages.

## Core Architecture

### Three-Layer Cache System

All data access goes through cache layers — never bypass with direct DB queries:

- **Becca** (`packages/trilium-core/src/becca/`): Server-side entity cache. Access via `becca.notes[noteId]`.
- **Froca** (`apps/client/src/services/froca.ts`): Client-side mirror synced via WebSocket. Access via `froca.getNote()`.
- **Shaca** (`apps/server/src/share/`): Optimized cache for shared/published notes.

**Critical**: Always use cache methods, not direct DB writes. Cache methods create `EntityChange` records needed for synchronization.

### Entity System

Core entities live in `packages/trilium-core/src/becca/entities/` (not `apps/server/`):

- `BNote` — Notes with content and metadata
- `BBranch` — Multi-parent tree relationships (cloning supported)
- `BAttribute` — Key-value metadata (labels and relations)
- `BRevision` — Version history
- `BOption` — Application configuration
- `BBlob` — Binary content storage

Entities extend `AbstractBeccaEntity<T>` with built-in change tracking, hash generation, and date management.

### Entity Change & Sync Protocol

Every entity modification creates an `EntityChange` record driving sync:
1. Login with HMAC authentication (document secret + timestamp)
2. Push changes → Pull changes → Push again (conflict resolution)
3. Content hash verification with retry loop

Sync services: `packages/trilium-core/src/services/sync.ts`, `syncMutexService`, `syncUpdateService`.

### Widget-Based UI

Frontend widgets in `apps/client/src/widgets/`:
- `BasicWidget` / `TypedBasicWidget` — Base classes (jQuery `this.$widget` for DOM)
- `NoteContextAwareWidget` — Responds to note changes
- `RightPanelWidget` — Sidebar widgets with position ordering
- Type-specific widgets in `type_widgets/` directory

**Widget lifecycle**: `doRenderBody()` for initial render, `refreshWithNote()` for note changes, `entitiesReloadedEvent({loadResults})` for entity updates. Uses jQuery — don't mix React patterns.

Fluent builder pattern: `.child()`, `.class()`, `.css()` chaining with position-based ordering.

### API Architecture

- **Internal API** (`apps/server/src/routes/api/`): REST endpoints, trusts frontend
- **ETAPI** (`apps/server/src/etapi/`): External API with basic auth tokens — maintain backwards compatibility
- **WebSocket** (`apps/server/src/services/ws.ts`): Real-time sync

### Platform Abstraction

`packages/trilium-core/src/services/platform.ts` defines `PlatformProvider` interface with implementations in `apps/desktop/`, `apps/server/`, and `apps/client-standalone/`. Singleton via `initPlatform()`/`getPlatform()`.

### Database

SQLite via `better-sqlite3`. SQL abstraction in `packages/trilium-core/src/services/sql/` with `DatabaseProvider` interface, prepared statement caching, and transaction support.

- Schema: `apps/server/src/assets/db/schema.sql`
- Migrations: `apps/server/src/migrations/YYMMDD_HHMM__description.sql`

### Attribute Inheritance

Three inheritance mechanisms:
1. **Standard**: `note.getInheritableAttributes()` walks parent tree
2. **Child prefix**: `child:label` on parent copies to children
3. **Template relation**: `#template=noteNoteId` includes template's inheritable attributes

Use `note.getOwnedAttribute()` for direct, `note.getAttribute()` for inherited.

## Important Patterns

- **Protected notes**: Check `note.isContentAvailable()` before accessing content; use `note.getTitleOrProtected()` for safe title access
- **Long operations**: Use `TaskContext` for progress reporting via WebSocket
- **Event system** (`packages/trilium-core/src/services/events.ts`): Events emitted in order (notes → branches → attributes) during load for referential integrity
- **Search**: Expression-based, scoring happens in-memory — cannot add SQL-level LIMIT/OFFSET without losing scoring
- **Widget cleanup**: Unsubscribe from events in `cleanup()`/`doDestroy()` to prevent memory leaks

## Code Style

- 4-space indentation, semicolons always required
- Double quotes (enforced by format config)
- Max line length: 100 characters
- Unix line endings
- Import sorting via `eslint-plugin-simple-import-sort`

## Testing

- **Server tests** (`apps/server/spec/`): Vitest, must run sequentially (shared DB), forks pool, max 6 workers
- **Client tests** (`apps/client/src/`): Vitest with happy-dom environment, can run in parallel
- **E2E tests** (`apps/server-e2e/`): Playwright, Chromium, server started automatically on port 8082
- **ETAPI tests** (`apps/server/spec/etapi/`): External API contract tests

## Documentation

- `docs/Script API/` — Auto-generated, never edit directly
- `docs/User Guide/` — Edit via `pnpm edit-docs:edit-docs`, not manually
- `docs/Developer Guide/` and `docs/Release Notes/` — Safe for direct Markdown editing

## Key Entry Points

- `apps/server/src/main.ts` — Server startup
- `apps/client/src/desktop.ts` — Client initialization
- `packages/trilium-core/src/becca/becca.ts` — Backend data management
- `apps/client/src/services/froca.ts` — Frontend cache
- `apps/server/src/routes/routes.ts` — API route registration
- `packages/trilium-core/src/services/sql/sql.ts` — Database abstraction
