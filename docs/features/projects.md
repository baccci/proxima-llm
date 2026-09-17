# Feature: projects

## Purpose

The project workspace. A project groups chats, attached files, and project-scoped memory under a
name, description, and appearance (an icon, a palette, and an icon color). `ProjectView` is the main
pane when a project is selected: a hero (name plus an edit button), a composer to start a new chat in
the project, the project's chats list, and two cards, Memories and Files. The appearance picker
(icon / icon-color / palette) is shared with the sidebar's create-project dialog.

**Location:** `src/mainview/features/projects/`

**Depends on:** shared root (`lib/{query-client,query-keys,rpc.client}`, several `components/*`
primitives and `components/icons/*`, `entities/project/{icon,palette}`, `hooks/use-is-dark`,
`utils/{tailwind-class-merge,error-message}`); shared-contracts
(`schemas/{project,project-file,memory-slice}.schema`); the memory feature (`MemorySliceList`,
`useMemorySlices`); the chat feature (`ComposerBody`, `useChats`, `CHAT_LIST_PREVIEW_LIMIT`); and
the root stores (`layout.store` for `sidebarOpen`, `navigation.store` for `selectChat` /
`openAllChats`).

## Structure

The standard feature shape minus `store` and `services`: the UI state it reads belongs to the shell,
not to projects, so it comes from the root stores, and there is no domain-service layer (writes are thin api wrappers, reads are query hooks). Domain logic for a
project's identity (icon keys, palette resolution) lives at the shared root in `entities/project/`.

| Path | Responsibility |
|---|---|
| `components/project-view.tsx` | The workspace main pane: drag bar, hero (name plus `EditAppearanceButton`), `ComposerBody`, chats list, Memories and Files cards. Holds the edit dialog whose body (`EditProjectForm`) is mounted only while open. |
| `components/project-appearance-picker.tsx` | The icon / icon-color / palette editor. Popover-driven: a `SwatchButton` grid, custom hex plus opacity slider, and a custom-palette (Light/Dark) editor. Shared by the edit dialog and the sidebar create dialog. |
| `components/memories-card.tsx` | The project's Memories card: a preview (summary or slice count) and a dialog wrapping the memory feature's `MemorySliceList` at project scope. |
| `components/files-card.tsx` | The attached-files card: upload (base64 over RPC), human size, list, delete. |
| `lib/project-icon.tsx` (plus `.test`) | `getProjectIcon`: maps a `ProjectIconKey` to its icon component. The map is `Record<ProjectIconKey, IconComponent>`, so it cannot drift from `PROJECT_ICON_KEYS`. |
| `hooks/use-projects.ts` | `useProjects` list read (also consumed by sidebar and chat). |
| `hooks/use-project-files.ts` | `useProjectFiles` read plus `useAddProjectFile` / `useDeleteProjectFile` mutations. |
| `hooks/use-memory-summary.ts` | `useMemorySummary`: the project's memory rollup. Project-specific, so it stayed here when the generic slice editor moved to the memory feature. |
| `projects.api.ts` | Writes only: `create`, `update` (each `req().X()` then invalidate the projects key). |

## Data flow

Reads go through the hooks (`useProjects`, `useProjectFiles`, `useMemorySummary`), each a `useQuery`
over the typed RPC client keyed by `queryKeys.*`. `ProjectView` finds its project from the
`useProjects` list by id. Writes go through `projects.api` (`create` / `update`) and the file
mutations, all invalidating their query key. Appearance edits flow from the picker's `onIconChange` /
`onPaletteChange` / `onIconColorChange` callbacks into `EditProjectForm`'s local state, then persist
through `projects.api.update`. Nothing lives in a store.

## Key decisions

- **Memory lives in its own feature.** `MemorySliceList` and `use-memory-slices` are in
  `features/memory/` because the generic slice editor is used by both settings (global memory) and
  projects (project memory), so it is not a projects concern. `use-memory-summary` stayed here: the
  project memory rollup genuinely is project-specific. See [../reference/memory.md](../reference/memory.md).
- **Projects is a foundational feature, so its cross-feature reads are accepted.** Sidebar and chat
  import `useProjects`; sidebar also imports `getProjectIcon`, `ProjectAppearancePicker`, and
  `projects.api`. These point at projects as the rightful owner of project data and identity, mirroring
  how the models feature's read hooks are consumed app-wide. Lifting a 400-line picker plus write api to
  the shared root would be a speculative restructure, so the edge stays.
- **The icon-key vocabulary is single-sourced.** `PROJECT_ICON_KEYS` (in `entities/project/icon`) is
  the source; `ICON_MAP` is typed `Record<ProjectIconKey, IconComponent>`, so adding a key without a
  matching icon is a compile error. `DEFAULT_ICON_KEY` names the `'folder'` fallback.
- **The edit dialog mounts its form only while open.** `EditProjectForm` renders inside `DialogContent`
  (Base UI unmounts the popup on close), so every open seeds fresh from the project through the
  `useState` / React Hook Form initializers, and cancel resets by unmounting. This removed a six-field
  manual re-seed and fixed the appearance draft (hex / custom palette) surviving across opens. Name and
  purpose use React Hook Form, matching the sibling `CreateProjectForm` in the sidebar.
- **`projects.api` is writes-only.** The dead `list` (superseded by the `useProjects` hook) and `remove`
  (no caller) methods were removed. The dead `remove` surfaced that project deletion has no UI yet.
- **Picker helpers dedupe the swatch grids.** `SwatchButton` owns the shared grid-button shape and
  selection ring for the four swatch grids; `customFromDraft` deduplicates the serialize construction;
  `selectCustom` was flattened to drop a double palette compute.

## Known limitations

- Project deletion has no UI yet.
- Picking a new icon-color base while opacity is at 0% snaps it to 100%
  (`composeIconColor(base, opacityPct || 100)` treats 0 as missing). Possibly intended, since a 0% icon
  is invisible.
