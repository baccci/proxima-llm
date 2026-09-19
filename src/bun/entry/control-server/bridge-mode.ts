// The dev browser bridge is dev-only: HMR=1 is what `bun run dev:hmr` sets, and outside
// it neither POST /rpc nor the /bridge socket exists. That is what keeps an
// unauthenticated surface off a release build, where a user can switch the control
// server on from settings.
export const BROWSER_BRIDGE_ENABLED = process.env.HMR === '1'
