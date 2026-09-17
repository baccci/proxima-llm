# Feature: sidebar

## Purpose

The left navigation rail. It lists your projects, your pinned chats, and all your chats
grouped by date (Today, Yesterday, and so on), with a footer that opens the models
marketplace and settings. Each section can collapse. The sidebar does not fetch anything
itself: the chat and project data is handed to it, and it just displays and selects.

**Location:** `src/mainview/features/sidebar/`

**Depends on:** shared root (`components/{collapsible,scroll-area,button,dialog,input}`,
`components/modal/modal-store`, `utils/time`, `utils/tailwind-class-merge`,
`hooks/{use-mount-effect,use-is-dark}`, `entities/project/{icon,palette}`, icons). By
composition it also reaches into sibling features: `chat` (`ChatRow`, `chat.api`,
`ChatActionsMenu`), `models` (`MARKETPLACE_MODAL_ID`), `settings` (`SETTINGS_MODAL_ID`), and
`projects` (`useProjects`, `projects.api`, `ProjectAppearancePicker`, `project-icon`). Selection
comes from the root `navigation.store`. See Key decisions for why that counts as composition and
not a layering leak.

## Structure

A presentational feature. There is no `services/` or `hooks/`: the data lives in sibling
features' query hooks, and the sidebar receives chat arrays as props and reads project data
directly.

| Path | Responsibility |
|---|---|
| `components/sidebar-chat-list.tsx` | Date-grouped chat list (a `ChatRow` per chat). Empty state when there are no chats. |
| `components/sidebar-pinned-chats.tsx` | Collapsible "Pinned" section; renders nothing when no chat is pinned. |
| `components/chat-row.tsx` | One chat row: the select button, the hover/menu-reveal actions, and the inline rename input (`ChatRowRename`). |
| `components/sidebar-projects.tsx` | Collapsible "Projects" section, the create-project dialog (`CreateProjectDialog` + `CreateProjectForm`), and `ProjectPill`. |
| `components/sidebar-footer.tsx` | Models and Settings launcher buttons (shared `FooterButton`). |
| `store/sidebar.store.ts` | UI-only collapse flags: `projectsCollapsed`, `pinnedCollapsed`. Not persisted. |
| `entities/helpers.ts` | `sortChats`, `groupChatsByDate` (produces `ChatGroup`), `chatTitle`. |

## Data flow

- **Chat list.** The caller supplies `chats: ChatDTO[]`; `groupChatsByDate` sorts by
  `lastMessageAt` and buckets each chat by date, emitting groups in the order of `DATE_GROUPS`
  (from `utils/time`).
- **Selection.** The root `navigation.store` through per-field selectors: `selectedChatId` /
  `selectChat` for chats, `selectProject` for project pills.
- **Rename.** `ChatRowRename` commits through `chat.update({ id, title })` on Enter or blur;
  Escape cancels.
- **Create project.** `CreateProjectForm` calls `projects.api.create(...)`, then
  `selectProject(created.id)` and closes.
- **Collapse.** `sidebar.store` toggles drive the two `CollapsibleRoot`s. These flags are
  ephemeral and not persisted, so both sections start expanded on each launch.

## Key decisions

- **Zustand is read through per-field selectors.** Reading a whole store
  (`const { a, b } = useNavigationStore()`) re-renders the component on every store change. Each
  field is taken with its own selector so the subscription stays narrow. See
  [conventions/data-and-state.md](../conventions/data-and-state.md).
- **Transient UI state resets by unmount, not by an effect.** Two spots rely on conditional
  mounting instead of syncing state with an effect:
  - `ChatRowRename` mounts only in the editing branch, seeds its draft in a `useState`
    initializer, and selects the text on mount via `useMountEffect`.
  - `CreateProjectForm` mounts inside the dialog popup, which Base UI unmounts on close, so submit
    and cancel just close and the form plus its appearance draft reset for free.
  - One accepted tradeoff: state now tears down on unmount, after the ~200ms dialog fade, so a
    closing form shows its typed values fading out rather than blanking instantly.
- **`DATE_GROUPS` is a single source.** `utils/time` exports one ordered `DATE_GROUPS` array that
  both the `DateGroup` type and the render order derive from, so the bucket list cannot drift.
- **Cross-feature imports here are composition, not a leak.** The sidebar is the nav shell, so
  pulling in `ChatActionsMenu`, `ProjectAppearancePicker`, and the chat and projects APIs is
  deliberate assembly of feature-owned UI, not shared logic that should be lifted. One arguable
  future move: `CreateProjectDialog` creates a project, so it could live in the `projects` feature.
