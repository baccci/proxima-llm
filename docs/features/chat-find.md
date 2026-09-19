# Feature: chat-find

## Purpose

In-chat find: the classic Cmd+F, scoped to the chat currently open. A floating bar over the
messages takes a query, reports how many times it occurs (`3/47`), steps through the
occurrences with Enter / Shift+Enter or Cmd+G / Cmd+Shift+G, scrolls the message list onto
each one, and paints every match amber with the current one solid.

It is not the same thing as the Cmd+K search palette. That one is a server-side SQLite FTS5
query across every chat, and it answers "which chat said this". This one never leaves the
open chat, never touches the database, and answers "where in this chat".

**Location:** `src/mainview/features/chat-find/`

**Depends on:** the shared `message.schema` (`MessageDTO` / `PartKind`), the root
`navigation.store`, the shared `use-mount-effect` hook, root icons, and `cn`. Notably it
imports **nothing** from the `chat` feature: it is handed the messages to scan and the
container to paint into, so the dependency runs the other way. `chat-view` mounts the bar
and computes the results, `message-list` hosts the painter, `message-part-renderer` marks the
text the painter is allowed to walk, and `main.tsx` installs the navigation reset. See [conventions/architecture.md](../conventions/architecture.md) for why
that one import from `chat` into `chat-find` is the deliberate shape.

## Why it cannot use the browser's own find

The message list is virtualized (`use-message-virtualizer`, `overscan: 6`): only the rows near
the viewport exist in the DOM, so in a four-hundred-message chat maybe fifteen are mounted.
WebKit's built-in find can only see those fifteen. That single fact shapes the whole feature,
because it splits into two layers that cannot be merged:

- **Matching** runs over the message *data*, which is complete. `useMessages` loads the whole
  chat in one query with no pagination, so every message is already in the TanStack cache and
  the scan is a pure client-side pass. This layer owns the count and the next/prev ordering.
- **Painting** runs over the *DOM*, which is partial by construction. It can only ever
  highlight rows the virtualizer has mounted, and it repaints as scrolling changes which
  those are.

## Structure

| Path | Responsibility |
|---|---|
| `constants.ts` | `FIND_MIN_QUERY_LENGTH`, the two `CSS.highlights` registry names, the `data-find-message-id` row attribute and the `data-find-text` text-part attribute. The names have one home here and are read by `global.css`, `message-list` and `message-part-renderer` respectively. |
| `entities/find-match.ts` | The `FindMatch` domain type: which message, its index in the chat, and the offset within it. |
| `helpers/find-matches.ts` | `findMatches` (pure scan over `MessageDTO[]`, case-insensitive and literal) and `firstMatchIndexByMessage` (the global index each message's matches start at, which is how the painter tells the active one apart). |
| `helpers/find-across-segments.ts` | `findAcrossSegments`: every occurrence of the query across a run of adjacent text segments read as one string, returned as the segment and offset each end falls on. The part of the painter that can be wrong, kept away from the DOM so it can be tested. |
| `store/chat-find.store.ts` | UI-only: `isOpen`, `query`, `activeIndex`, and a `focusRequestId` nonce. `step(delta, total)` wraps around. |
| `hooks/use-find-matches.ts` | Derives `{ matches, needle, activeIndex }` from the messages and the deferred query. Clamps the index so every reader agrees. |
| `hooks/use-find-shortcut.ts` | Binds Cmd+F and Cmd+G / Cmd+Shift+G for the chat view's lifetime, reading its deps through a latest-ref. |
| `hooks/use-focus-find-input.ts` | Focuses and selects the field on open and on every later Cmd+F. |
| `hooks/use-paint-find-highlights.ts` | The painter. Walks the text parts of the mounted rows, builds `Range`s that may span element boundaries, and hands them to the highlight registry. |
| `components/find-bar.tsx` | The floating bar: field, counter, prev/next, close. Private children: `MatchCounter`, `StepButton`. |
| `lib/find-highlight-registry.ts` | The two `Highlight` objects, created once and mutated for the life of the window. Owns the WebKit workaround: never replace a registered highlight, empty it. Also answers `activeFindRect()`, where the current match is on screen, which is what the message list scrolls onto. |
| `lib/reset-find-on-navigation.ts` | Closes find when the open chat changes, by subscribing to `navigation.store`. |

## Data flow

- `chat-view` calls `useFindMatches(messages)` **once** and hands the result to both the bar
  and the message list, so the number the user reads and the highlights they see come from
  the same pass.
- The query is run through `React.useDeferredValue`, so a burst of keystrokes coalesces into
  one scan instead of one per character. The painter highlights that deferred query, not the
  live field, or the ranges would disagree with the count beside them.
- `message-list` passes the active match down to `use-message-virtualizer` along with
  `activeFindRect`, and the virtualizer lands on the painted match rather than on the row.
- `main.tsx` installs `initFindResetOnNavigation`, so changing chats closes the bar. The
  navigation store never reaches into a feature; the feature subscribes.

## Key decisions

- **The CSS Custom Highlight API, not `<mark>` elements.** A rehype plugin wrapping matches in
  markup was the obvious alternative and was rejected for one decisive reason: the `pre`
  override in `lib/markdown.tsx` pulls raw code out and hands it to `CodeBlock`, which injects
  Shiki's HTML through `dangerouslySetInnerHTML`. A `<mark>` is destroyed on that path, so
  code blocks would have counted matches they never highlighted. `CSS.highlights` paints over
  live text without mutating the DOM, which reaches inside Shiki, avoids re-parsing markdown
  on every keystroke, and means the painter cannot trigger its own mutation observer. The
  cost is that `::highlight()` honours only flat properties, so there is no rounded corner on
  a match. Requires WebKit 17.2+; where the registry is missing, find still counts and jumps
  and only the paint is absent. The landing reads the `Range`s the painter built rather than the
  registry it hands them to, so scrolling onto a match keeps working even there.
- **`package.json` overrides lightningcss to 1.33.0, because of those two `::highlight()` rules.**
  1.32.0 does not know the Custom Highlight API selector, so every build printed four warnings about
  it: two from Tailwind's optimize pass and two from Vite's minify step, which share one hoisted
  copy. The rules were passed through unchanged either way, so this was noise and not breakage, but
  there was no switch to turn it off. 1.33.0 parses the selector and warns about nothing. The
  override is the only lever available, because `@tailwindcss/node` pins lightningcss exactly, 4.3.3
  included, so upgrading Tailwind cannot reach it. The single difference it makes to the built CSS
  is `.rounded-full`: its `calc(infinity * 1px)` now clamps to `2147483647px` rather than
  `3.40282e38px`, and both sit far past the half-the-box ceiling browsers put on `border-radius`.
- **The landing aims at the match, not at the message row holding it.** `pendingScroll`, which
  the Cmd+K search landing uses, is a one-shot consumed at mount by the virtualizer's
  `didInitRef` and cleared by any navigation: the wrong shape for repeated jumps inside a list
  that is already open. Aiming at the row instead, the way that landing does, is wrong for a
  different reason. A row landing has only one destination per message, and a match can sit
  thousands of pixels into a long one, so the match ends up off screen after a large jump; and
  two matches inside one message resolve to the same destination, so the step between them
  computes the scroll position it is already at and nothing moves at all. `use-message-virtualizer`
  therefore reads `activeFindRect()` and scrolls onto the match's own rect. The painter has
  already built the exact `Range`, so this costs no second search.
- **The landing loop converges on the rect, not on the scroll position.** One `requestAnimationFrame`
  loop covers both halves of the job because both end at the same test. A match with no painted
  rect is in a row the virtualizer has not mounted, so the loop scrolls that row in with
  `scrollToIndex` and looks again next frame. Once the rect exists the loop corrects onto it,
  and re-reads it every frame, which absorbs the same `estimateMessageHeight` drift `landOnIndex`
  exists to correct: rows above the target mount, measure taller than their guess, and push the
  match down. It starts a frame late on purpose, because the painter's effect is registered
  after the virtualizer's and the registry still holds the previous match until it runs.
- **A match already in view does not move the page.** `landingScrollDelta` returns 0 when the
  match sits inside the band the header leaves clear, and the loop stops there without writing a
  scroll position. A match that does have to move parks a third of the way down that band rather
  than at an edge. The arithmetic is pure and unit-tested in
  `features/chat/helpers/landing-scroll-delta.ts`; the row landing had no such rest state, which
  is why every step used to throw the page around even when the next match was already on screen.
- **The match index is passed to the virtualizer alongside the message id.** Stepping between
  two matches inside one long message does not change the id, so keying on the id alone would
  make the key look dead. The index changes every step.
- **A mutation observer, coalesced per frame.** Rows rewrite themselves after the painter has
  run: Shiki swaps in a highlighted `<pre>` when its async highlight resolves, images settle, a
  thinking block expands. Each replaces the very text nodes the ranges point at. The observer
  repaints; painting never touches the DOM, so it cannot feed itself.
- **The painter searches runs of inline-adjacent text nodes, not single nodes.** Shiki wraps
  every token of a code block in its own `<span>`, so searching one text node at a time could
  never match `const saved`: the two halves live in different nodes, and in a code block that is
  almost every multi-word query. The painter joins each run of inline-adjacent text nodes into
  one string, finds the matches there (`helpers/find-across-segments.ts`, pure and tested), and
  maps each hit back to a `Range` with `setStart` and `setEnd` on two different nodes, which
  Ranges support natively. A run stops at anything that starts a new line, or a query would
  match across the seam between two paragraphs, where the words are not adjacent on screen and
  the data pass counted nothing.
- **The painter walks only the rendered text parts, marked with `data-find-text`.** A mounted
  row renders far more than the message's text: a thinking trace, tool payloads, sources, the
  token counts, the hover actions. The data pass scans text parts and nothing else, so a hit
  anywhere in that chrome would take a number belonging to a real match and push the active
  highlight onto the wrong word. Scoping the walk to the same ground the data pass covers makes
  the two agree by construction, rather than by a blacklist that the next piece of chrome
  quietly breaks.
- **Two `Highlight` objects, mutated, never replaced.** Registering a fresh
  `new Highlight(...ranges)` under the same name leaves WebKit painting the ranges the previous
  object held: the registry reads correctly and only the pixels are stale, the missed-repaint
  family in [conventions/webkit-quirks.md](../conventions/webkit-quirks.md). `lib/find-highlight-registry.ts`
  keeps one object per name for the life of the window and empties it with `clear()` instead, so
  WebKit invalidates the ranges it drops. Nothing is ever deleted from the registry either,
  since deletion is the same unrepainted removal.
- **A bar, not a modal.** Find has to leave the chat visible and scrollable behind it, which a
  focus-trapping modal cannot do. It sits at `top-14` to clear the full-width drag handle
  `app.tsx` fixes over the first 56px. It is built from `bg-panel` / `border-border`, the pair
  the sidebar and the composer share, not the `floating` tokens: those are a dark translucent
  pill for an overlay button on light content (scroll-to-bottom), and a whole bar in them reads
  as borrowed from another app on a light theme.
- **Reasoning traces and tool payloads are out of scope.** Both render collapsed, so a match
  inside one could be counted but never shown. Fenced code *is* in scope, and comes for free:
  it lives inside the same text parts as the prose.

## Known limitations

- **The count can be off by one inside a message whose markdown syntax splits a match.** Match
  offsets index the markdown source; ranges are painted over rendered text, where the syntax
  characters are gone. So `**find**ing` is one word on screen and two runs in the source. The
  data pass owns count and ordering and the painter re-searches each mounted text part for its
  own ranges, which agree for plain prose and code — effectively all real usage. A
  position-mapper is the fix if it ever actually bites.
- **A match spanning two text parts is counted but not painted.** `findMatches` reads a
  message's text parts as one string, while the painter searches each rendered part on its own,
  so a match straddling the join between two of them has no range. Messages almost always carry
  a single text part, so this is theoretical today.
- **A match the painter cannot place also cannot be landed on precisely.** Both cases above leave
  a counted match with no `Range`, and the landing aims at the `Range`. It degrades rather than
  fails: the loop still scrolls the message's row to the top of the viewport, which is where every
  match used to land, and then gives up after `FIND_LANDING_ATTEMPTS` frames.
- **The streaming reply is not searched.** It lives outside the virtual list, in the live zone,
  and is not stamped with a row attribute.
- **Searching is limited to the open chat.** Cmd+K remains the way to search across chats.
