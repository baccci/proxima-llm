# Project personalization — icons + colors (design)

> Roadmap item #10 (pre-alpha-3). Give each project a visual identity (icon + color)
> so projects are scannable in the sidebar. v1 scope: the **sidebar project pill** and a
> shared appearance picker in create + edit flows.

## Goal

Let users assign an **icon** and a **color palette** to a project. Both are opt-in: a
project with neither set looks exactly as it does today ("native"). The identity renders
on the sidebar project pill — background from the palette, icon + text tinted to match.

## Decisions (settled in brainstorming)

1. **Curated bespoke icons**, not an icon library. `lucide-react` is a dependency but is
   imported nowhere; every icon in `src/mainview/components/icons/` is a hand-authored SVG
   component. New icons follow that same style. (Rejected: using lucide — would fork the
   icon system into two styles.)
2. **A defined 10-palette set.** The app currently has only one accent hue (purple); there
   is no multi-hue palette. We introduce one as a typed constant.
3. **Palettes are fixed aesthetic identities** (e.g. synthwave, hacker, terminal), applied
   the same regardless of the app's light/dark theme — with the option for a palette to
   carry distinct light and dark variants when it reads better that way.
4. **Color spreads to the whole sidebar pill**: `bg` fills the pill, `fr` colors the icon
   and the text. Nothing else in the UI is themed in v1 (no header banner, no chat view).
5. **Default = native.** New and existing projects render with today's default pill look
   until the user opts in. No deterministic auto-recolor. (Rejected: hash-name → palette —
   surprises users by recoloring all existing projects on upgrade.)
6. **Icon and palette are independent** nullable fields. A project can have a custom icon
   with native color, or a palette with the default folder icon. Default icon = folder.
   The palette sets the color of whatever icon is chosen.
7. **Picker lives in the existing create-project dialog**, plus an edit button on the
   project-view header that reopens the same picker in edit mode.

## Data model

Two nullable columns on the `projects` table (`src/bun/db/schema.ts`). Both store **keys**,
never raw hex — the hex lives only in the typed palette constant.

- `icon TEXT` — icon key (e.g. `"suitcase"`). `null` → default folder icon.
- `palette TEXT` — palette key (e.g. `"synthwave"`). `null` → native (default pill look).

Contract changes (`src/shared-contracts/schemas/project.schema.ts`):

- `ProjectDTO` gains `icon: string | null` and `palette: string | null`.
- `CreateProjectInput` and `UpdateProjectInput` gain `icon?` and `palette?`.

No new RPC: `updateProject` already exists (`src/bun/services/project.service.ts:45`) and
patches arbitrary fields.

## Typed constants — one source of truth

New file `src/shared-contracts/project-appearance.ts`. A single uniform palette shape (no
discriminated union — fixed palettes simply repeat the pair in both modes):

```ts
type Palette = {
  key: string
  name: string
  light: { bg: string; fr: string }
  dark: { bg: string; fr: string }
}
```

`native` is NOT an entry in this list — it is the `null` case, rendered with the existing
pill tokens.

### Palettes (10)

Fixed palettes set `light === dark`; adaptive palettes differ per mode.

| key       | mode     | light bg / fr          | dark bg / fr           |
| --------- | -------- | ---------------------- | ---------------------- |
| clay      | fixed    | `#F2EAD3` / `#E45049`  | `#F2EAD3` / `#E45049`  |
| paper     | fixed    | `#FBFBFB` / `#E65554`  | `#FBFBFB` / `#E65554`  |
| synthwave | fixed    | `#16002A` / `#CF3FB9`  | `#16002A` / `#CF3FB9`  |
| hacker    | fixed    | `#040F0A` / `#4CFB71`  | `#040F0A` / `#4CFB71`  |
| terminal  | fixed    | `#0A0A0A` / `#FAFAFA`  | `#0A0A0A` / `#FAFAFA`  |
| sunset    | fixed    | `#2A0A00` / `#FF8A3D`  | `#2A0A00` / `#FF8A3D`  |
| ocean     | adaptive | `#E0F2FE` / `#0369A1`  | `#082F49` / `#38BDF8`  |
| forest    | adaptive | `#DCFCE7` / `#15803D`  | `#052E16` / `#4ADE80`  |
| royal     | adaptive | `#EDE9FE` / `#6D28D9`  | `#1E1B4B` / `#A78BFA`  |
| slate     | adaptive | `#F1F5F9` / `#334155`  | `#1E293B` / `#CBD5E1`  |

(Palette values may be refined later; the set and structure are fixed.)

### Icons (~12)

Keys → bespoke SVG components. `palette` and `bot` reuse existing components; the rest are
new, authored in the existing icon style.

| key             | meaning        | source |
| --------------- | -------------- | ------ |
| folder          | default        | exists (`icon-folder-open`) |
| suitcase        | work           | new    |
| banknote        | cash           | new    |
| code            | programming    | new    |
| plane           | vacation       | new    |
| palette         | art            | reuse (`icon-palette`) |
| flask           | science        | new    |
| graduation-cap  | school         | new    |
| rocket          | —              | new    |
| book            | —              | new    |
| sparkles        | —              | new    |
| bot             | —              | reuse (`icon-bot`) |

## Resolution helpers

In `project-appearance.ts` (or a sibling):

- `resolvePalette(key: string | null, isDark: boolean): { bg: string; fr: string } | null`
  — `null` key → `null` (native). Otherwise `isDark ? p.dark : p.light`.
- `getProjectIcon(key: string | null): IconComponent` — folder fallback.

`useIsDark()` (renderer hook) mirrors `resolveDark` in `src/mainview/app/use-apply-theme.ts`
(reads `settings.theme` + `matchMedia('(prefers-color-scheme: dark)')`) so palette selection
matches the applied `<html class="dark">` state, including live `system` changes.

## UI

### Sidebar pill — `sidebar-projects.tsx`

For each project: resolve palette against `useIsDark()`.
- **Native (null):** render exactly as today (existing Tailwind classes, folder or chosen icon).
- **Palette set:** inline-style the pill `<button>` with `backgroundColor: bg`; icon and text
  get `color: fr`. (Inline style is required — the values are arbitrary hex, not Tailwind
  tokens.) Hover/active states layer over the custom bg.

Icon is always resolved via `getProjectIcon(project.icon)`.

### Appearance picker (shared component)

New `ProjectAppearancePicker` (icon grid + palette swatch row, including a "Native" swatch
that clears the palette). Emits `{ icon, palette }`. Reused by both entry points below.

### Create dialog — `sidebar-projects.tsx` (`CreateProjectDialog`)

Add the picker row under name/purpose. Selected `icon`/`palette` pass into `projectsApi.create`.

### Edit — project-view header

Add a pencil edit button near the project name (`project-view.tsx` ~line 43). It opens the
same dialog in edit mode, pre-filled, saving via `updateProject`.

## Out of scope (v1)

- Header/banner theming, chat-view theming (pill only).
- Free hex color picker; custom icon upload.
- Deterministic auto-defaults (hash name → palette).
- A dedicated project switcher avatar (no switcher component exists yet).

## Testing

- `resolvePalette` — native (null) → null; fixed key → same pair both modes; adaptive key →
  correct pair per `isDark`; unknown key → null (safe fallback).
- `getProjectIcon` — known key → its component; null/unknown → folder.
- DTO round-trip — create with icon+palette, read back, update to native (null), read back.
- Manual: create a project per palette, toggle app theme light/dark, confirm pill legibility
  and that native projects are visually unchanged from today.
