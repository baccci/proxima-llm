# Data fetching & renderer state

- **Server reads & mutations → TanStack Query** (`useQuery` / `useMutation` wrapping the
  typed RPC client). Never fetch inside a `useEffect`.
- **Forms → React Hook Form.**
- **UI state → Zustand**, one store per feature, UI-only (selection, open/closed flags,
  in-flight stream cache). Stores are *not* the source of truth for server data — they
  cache it; the query layer owns freshness.

See [../local-docs/ARCHITECTURE.md](../local-docs/ARCHITECTURE.md) §12 for the
store-per-feature model and §10 for the streaming / IPC design.
