// Lifted to shared-contracts so the renderer can name stages (the config surface). This
// re-export keeps existing `./stages` imports across the bun lifecycle layer unchanged.
export { LIFECYCLE_STAGE, type LifecycleStage } from '../../../shared-contracts/lifecycle/stages'
