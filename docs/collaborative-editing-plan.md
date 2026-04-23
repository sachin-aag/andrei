# Real-Time Collaborative Editing Implementation Plan

## Architecture Overview

**Stack**: PartyKit (Cloudflare) + Yjs CRDT + TipTap Collaboration extensions
**Scale**: 2-5 concurrent users per report
**Cost**: ~$5/mo (Cloudflare Workers Paid plan)
**Existing stack preserved**: Neon PostgreSQL, TipTap editors, comment anchoring, track changes

### How It Works

```
Browser A ──WebSocket──┐
                       ├── PartyKit Room (1 per section) ── Yjs Doc ── CRDT merge
Browser B ──WebSocket──┘
                       │
                       └── On idle/close: serialize Yjs → JSON → POST to Neon DB
```

Each DMAIC section gets its own PartyKit room (`report-{reportId}-{sectionType}`), so users editing different sections don't interfere. Users editing the **same** section get real-time CRDT merging.

---

## Phase 1: PartyKit Server (Days 1-3)

### 1.1 Create PartyKit project

Create `partykit/` directory at repo root with:

```
partykit/
├── package.json          # partykit, y-partyserver, yjs deps
├── partykit.json         # config (port, main entry)
├── tsconfig.json
└── src/
    └── server.ts         # y-partyserver based WebSocket server
```

### 1.2 Server implementation (`partykit/src/server.ts`)

- Extend `YPartyKitServer` from `y-partyserver`
- Room naming convention: `report-{reportId}-{sectionType}`
- **Auth**: Validate session token on WebSocket `onConnect` — reject unauthorized users
- **Persistence**:
  - On room close/idle → serialize Yjs doc to TipTap-compatible JSON
  - POST to existing API: `PATCH /api/reports/{reportId}/sections/{sectionType}`
  - Use a shared secret (`PARTYKIT_SECRET`) for server-to-server auth
- **Initial load**: On first connection to a room, fetch current section content from DB and initialize Yjs doc

### 1.3 Deploy

```bash
cd partykit && npx partykit deploy
```

Environment variables needed:
- `PARTYKIT_SECRET` — shared secret for server-to-server persistence calls
- `APP_URL` — base URL of the Next.js app (for API calls)

---

## Phase 2: Client Integration (Days 4-7)

### 2.1 Install dependencies (in main app)

```bash
npm install yjs y-partykit @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
```

### 2.2 Create `useCollaborativeEditor` hook

**File**: `src/hooks/use-collaborative-editor.ts`

```typescript
// Returns:
// - ydoc: Y.Doc instance
// - provider: YPartyKitProvider (WebSocket connection)
// - collaborationExtensions: [Collaboration, CollaborationCursor] TipTap extensions
// - connectionStatus: "connected" | "connecting" | "disconnected"
// - connectedUsers: { name, color }[]
```

Key behaviors:
- Creates `Y.Doc` and `YPartyKitProvider` on mount
- Connects to room `report-{reportId}-{sectionType}`
- Passes session token for auth
- On disconnect/reconnect, provider auto-resyncs via Yjs protocol
- Cleanup on unmount (destroy provider, doc)

### 2.3 Modify `TiptapSectionField`

**File**: `src/components/report/tiptap-section-field.tsx`

Changes:
- Accept optional `ydoc` / collaboration extensions from hook
- When collaboration is active:
  - Editor content comes from Yjs doc (not `value` prop)
  - Remove `applyExternalValueToEditor` effect (Yjs is source of truth)
  - `onUpdate` still fires for local state sync, but save is handled by PartyKit
- When collaboration is inactive (offline fallback):
  - Current behavior preserved exactly

### 2.4 Adapt `useAutoSave` / `useSectionSave`

**File**: `src/hooks/use-section-save.ts`

When collaborative mode is active:
- Reduce autosave to a **periodic backup** (every 30s instead of 1.5s debounce)
- Primary persistence is via PartyKit server on room idle/close
- Beacon save on page unload still works as safety net

---

## Phase 3: Collaboration API & Auth (Days 8-9)

### 3.1 Server-to-server persistence endpoint

**File**: `src/app/api/reports/[reportId]/sections/[sectionType]/collaborate/route.ts`

- Accepts POST from PartyKit server
- Validates `PARTYKIT_SECRET` header
- Saves Yjs-serialized content to `reportSections` table
- Returns current content for initial room load (GET)

### 3.2 Auth flow for WebSocket

- Client sends session cookie value as query param on WebSocket connect
- PartyKit server validates by calling `GET /api/auth/validate?token={token}`
- Or: use a simple JWT signed with shared secret

---

## Phase 4: Comment Anchor Stability (Days 10-11)

### 4.1 Convert positions to Yjs RelativePosition

**File**: `src/lib/tiptap/comment-highlights.ts`

Current: comments use absolute positions (`fromPos`, `toPos`) which break when other users edit text before the comment anchor.

Solution:
- When creating a comment: convert absolute pos → `Y.RelativePosition` using `Y.createRelativePositionFromTypeIndex(ytext, pos)`
- Store relative position JSON alongside absolute in the comment record
- On each doc update: resolve relative positions back to absolute for rendering decorations

### 4.2 Schema changes

**File**: `src/db/schema/index.ts`

Add to `comments` table:
```typescript
fromPosRelative: jsonb("from_pos_relative"),  // Y.RelativePosition JSON
toPosRelative: jsonb("to_pos_relative"),       // Y.RelativePosition JSON
```

### 4.3 Backfill existing comments

Script to convert existing `fromPos`/`toPos` to relative positions using current doc state.

---

## Phase 5: UI Polish (Days 12-14)

### 5.1 Connection status indicator

Show in section header:
- Green dot: connected, N users editing
- Yellow dot: reconnecting...
- Gray dot: offline (local-only mode)

### 5.2 Collaboration cursors

- Each user gets a colored cursor with their name label
- Colors assigned deterministically from user ID
- Uses `@tiptap/extension-collaboration-cursor`

### 5.3 Offline/reconnection handling

- Yjs queues changes locally when disconnected
- On reconnect, provider auto-syncs (CRDT merge)
- If offline for extended period, fall back to direct DB save

---

## Key Files Summary

| File | Change Type | Description |
|------|------------|-------------|
| `partykit/` | NEW directory | PartyKit server with y-partyserver |
| `partykit/src/server.ts` | NEW | Yjs WebSocket server, room management, persistence |
| `partykit/package.json` | NEW | PartyKit dependencies |
| `partykit/partykit.json` | NEW | PartyKit config |
| `src/hooks/use-collaborative-editor.ts` | NEW | Yjs provider lifecycle hook |
| `src/components/report/tiptap-section-field.tsx` | MODIFY | Add Collaboration extension, Yjs integration |
| `src/hooks/use-section-save.ts` | MODIFY | Adapt as backup alongside Yjs sync |
| `src/hooks/use-auto-save.ts` | MINOR | No changes needed (used via use-section-save) |
| `src/lib/tiptap/comment-highlights.ts` | MODIFY | Y.RelativePosition for anchor stability |
| `src/app/api/reports/[reportId]/sections/[sectionType]/collaborate/route.ts` | NEW | Server-to-server persistence endpoint |
| `src/db/schema/index.ts` | MODIFY | Add relative position columns to comments |
| `src/lib/tiptap/suggestion-marks.ts` | VERIFY | Should work under Yjs (likely no changes) |
| `src/providers/report-provider.tsx` | MINOR | Pass collaboration state down |

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_PARTYKIT_HOST` | Client | PartyKit server URL (e.g., `your-project.username.partykit.dev`) |
| `PARTYKIT_SECRET` | Both | Shared secret for server-to-server API calls |
| `APP_URL` | PartyKit server | Next.js app URL for persistence API calls |

---

## Verification Checklist

1. Open same report in 2 browser windows as different users
2. Edit same section in both — verify text merges without conflicts
3. Edit different sections simultaneously — verify independence
4. Add a comment in one window — verify anchor position survives edits in other window
5. Use track changes in both windows — verify suggestion marks sync correctly
6. Close one window, continue editing in other — verify changes persist to DB
7. Disconnect network briefly — verify reconnection resyncs
8. Refresh page — verify content loads from DB correctly
9. Both users add comments on same paragraph — verify no position collisions

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| PartyKit downtime | Fallback to current direct-save mode (offline mode) |
| Yjs doc grows too large | Periodic Yjs GC; reset doc from DB on room restart |
| Track changes marks conflict | Yjs CRDT handles mark merging; each mark has unique ID |
| Comment positions drift | Y.RelativePosition tracks position relative to content, not absolute offset |
| Auth token expires during editing | Reconnect handler re-authenticates |
