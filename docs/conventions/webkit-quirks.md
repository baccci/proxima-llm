# WebKit / Electrobun renderer quirks

The renderer runs in WKWebView (WebKit), not Chromium. A few rendering behaviors differ from
Chrome and have bitten us. They are collected here with the symptom, the cause, and the fix, so
the family is quick to recognize next time.

## Stale compositing layer from opacity transitions (ghost elements)

**Symptom.** A hover-reveal control (the per-message retry/edit/copy buttons) stays painted on
screen after the pointer leaves, in some chats only. A fast pass is fine; dwelling long enough to
open a tooltip pins it. Scrolling does not clear it, resizing the window does.

**Cause.** The element is hidden with `opacity-0` and animated with `transition-opacity`. The
opacity animation promotes the element to its own GPU compositing layer. When a transient overlay
(the Base UI tooltip portal) opens and closes over it, WebKit skips the repaint that should hide the
element as opacity returns to 0, so the last painted frame stays on screen. The style is correct
(computed opacity is 0), only the pixels are stale, which is why a forced repaint is the only thing
that clears them. A window resize forces a full relayout and repaint and clears it. A scroll only
re-composites existing layers on the GPU and reuses the stale one, so it does not.

**Why chat-dependent.** Chats heavy with `dangerouslySetInnerHTML` content (Shiki code blocks,
rendered markdown) raise compositing pressure, which is what makes WebKit drop the repaint. Light
chats never trip it. Same repaint family as the innerHTML-scrollbar quirk below.

**Fix.** Hide with opacity only and do not animate it. Drop `transition-opacity`. An instant opacity
toggle lets WebKit repaint the hide correctly, so no stale layer forms. See `message-bubble.tsx`,
both reveal wrappers.

**Do not hide these with `visibility`, `display:none`, or by unmounting.** All three remove the
element from the keyboard tab order, which breaks the `focus-within` reveal that lets keyboard users
reach the buttons. `opacity-0` is the only hide that keeps an element focusable while invisible. A
`visibility` attempt broke tabbing and did not even fix the ghost.

**Fade tradeoff.** No transition means no fade in or out. The fade-out (animating opacity to 0) is the
exact trigger, so it must stay gone. A fade-in only is safe in principle, since it ends at a fully
painted state, and can be done with asymmetric transition durations (0ms in the hidden state, ~150ms
in the shown state), but it is untested against this bug, so verify on the real app before trusting it.

## Missed repaint after `dangerouslySetInnerHTML` (scrollbar)

WebKit will not repaint a scroll container's scrollbar after its content is replaced via
`dangerouslySetInnerHTML` (Shiki code blocks in `markdown.tsx`). Force a re-render to nudge the
repaint. Same repaint family as the ghost-layer quirk above.

## Plain `<button>` is not keyboard-tabbable without `tabindex`

WKWebView excludes a native `<button>` from the sequential Tab order unless it carries an explicit
`tabindex`. `use-webkit-tab-focus.ts` normalizes every plain button to `tabindex="0"` on mount and
via a MutationObserver for later ones. Base UI controls set their own tabindex, so `:not([tabindex])`
skips them.

## Native `window.confirm` / `alert` / `prompt` are silent no-ops

**Symptom.** A button guarded by `if (!window.confirm(...)) return` does nothing when clicked: no
dialog appears and the action never runs. Bit the remove-API-key and clear-logs buttons.

**Cause.** Electrobun's WKWebView ships no JS-dialog UI delegate, so WebKit never shows the panel and
`window.confirm` returns `false` (and `alert` / `prompt` are inert too). The guard therefore always
takes the early return.

**Fix.** Use the in-app dialog, not the native one: `DialogRoot` + `DialogContent` from
`@/components/dialog`, driven by a `React.useState` boolean (the chat-delete pattern). It is a portaled
React surface, so it works.

**Gotcha inside a Modal.** The Settings screen is itself a `Modal` (`z-modal`, 25). A `DialogContent`
backdrop sits at `z-overlay` (20), below the Modal, so the Modal paints over the dim and the overlay is
lost. Pass the `overModal` prop, which lifts backdrop and popup into the `z-popover` band (28). See the
z-index scale in `global.css`.
