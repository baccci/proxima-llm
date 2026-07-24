# Data and state

There are three sources of truth in the renderer, and it matters which one you use for a
given piece of state.

**Server reads and mutations go through TanStack Query** (`useQuery` and `useMutation`
wrapping the typed RPC client). Never fetch inside a `useEffect`. The query layer owns
caching, refetching, and invalidation, and it is the part that knows whether data is fresh.

**Forms go through React Hook Form.**

**UI state goes in Zustand, one store per feature, and it stays UI-only:** selection, open
and closed flags, the in-flight stream cache. A store is not the source of truth for server
data. It may cache server data, but freshness is the query layer's job, not the store's.

**Read a store through a selector, never by destructuring the whole thing.** Take each field
with `useStore((s) => s.field)`. A selector-less `useStore()` hands back the entire state
object, and because Zustand compares snapshots by identity (a fresh object after every `set`),
the component then re-renders on *every* store update, not just on the fields it reads. This
bites hardest on hot stores: `chat.store` changes on every streaming token, so a selector-less
read there re-renders the whole subtree on every token. A per-field selector narrows the
subscription down to what the component actually uses.

For the store-per-feature model and how streaming and IPC fit together, see the
[architecture overview](../architecture.md).
