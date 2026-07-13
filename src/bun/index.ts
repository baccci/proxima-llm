import { dlopen, FFIType } from 'bun:ffi';
import { ApplicationMenu, BrowserWindow, Updater } from 'electrobun/bun';
import { join } from 'path';
import { setSendChatsUpdated, setSendToWebview } from './engine/chat-stream/chat-stream.service';
import { regenerateProjectSummary } from './engine/memory-summary.service';
import { startControlServer, stopControlServer } from './entry/control-server/server';
import {
  createRPC,
  pushModelsUpdated,
  setControlServerFns,
  setSendControlNavigate,
  setSendMemoryChanged,
  setSendModelsUpdated,
} from './entry/rpc';
import { setMemoryRegenHook } from './features/memory/memory-notify';
import { syncOpenRouterModels } from './features/model/model-sync.service';
import * as settingsService from './features/settings/settings.repository';
import { setupSchema } from './infra/db/migrate';
import { seedModels } from './infra/db/seed';
import { log } from './infra/logging/logger';

log.init();
log.installGlobalHandlers();

const DEV_SERVER_PORT = 5173;
const HEAD_PROBE_TIMEOUT_MS = 500;
const RETRY_BACKOFF_MS = 250;
const HMR_POLL_ATTEMPTS = 20;
// dev:hmr sets HMR=1. Under it, Vite and electrobun boot in parallel, so poll for the
// dev server instead of probing once (the one-shot check lost the race and fell back to
// stale bundled assets). Outside HMR there's no server to wait for, so probe just once.
const HMR_EXPECTED = process.env.HMR === '1';

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === 'dev') {
    const attempts = HMR_EXPECTED ? HMR_POLL_ATTEMPTS : 1;
    for (let i = 0; i < attempts; i++) {
      try {
        await fetch(`http://localhost:${DEV_SERVER_PORT}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(HEAD_PROBE_TIMEOUT_MS),
        });
        console.log(`HMR enabled: http://localhost:${DEV_SERVER_PORT}`);
        return `http://localhost:${DEV_SERVER_PORT}`;
      } catch {
        if (i < attempts - 1) {
          await Bun.sleep(RETRY_BACKOFF_MS);
        }
      }
    }
    console.log('Vite server not running — using bundled assets. Run "bun run dev:hmr" for HMR.');
  }
  return 'views://mainview/index.html';
}

// Boot
setupSchema();
await seedModels();
// Non-blocking background sync: UI renders from DB cache instantly
syncOpenRouterModels(pushModelsUpdated).catch((err) =>
  log.error('OpenRouter sync failed (non-fatal)', err),
);

const rpc = createRPC();
const url = await getMainViewUrl();

export const mainWindow = new BrowserWindow({
  title: 'Proxima',
  url,
  rpc,
  titleBarStyle: 'hiddenInset',
  frame: {
    width: 1280,
    height: 800,
    x: 100,
    y: 100,
  },
});

const trafficLightsLib = dlopen(join(import.meta.dir, '../native/libTrafficLights.dylib'), {
  setupTrafficLights: {
    args: [FFIType.ptr, FFIType.f64, FFIType.f64],
    returns: FFIType.void,
  },
});

const TRAFFIC_LIGHT_X = 18;
const TRAFFIC_LIGHT_Y = 24;

trafficLightsLib.symbols.setupTrafficLights(mainWindow.ptr, TRAFFIC_LIGHT_X, TRAFFIC_LIGHT_Y);

ApplicationMenu.setApplicationMenu([
  {
    label: 'Proxima',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'showAll' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
]);

// Wire bun → webview push (for streaming chunks, model updates, control navigate)
setSendToWebview((msg) => {
  mainWindow.webview.rpc?.send.streamChunk(msg);
});
setSendModelsUpdated(() => {
  mainWindow.webview.rpc?.send.modelsUpdated({});
});
setSendChatsUpdated(() => {
  mainWindow.webview.rpc?.send.chatsUpdated({});
});
setSendMemoryChanged((scope, projectId) => {
  mainWindow.webview.rpc?.send.memoryChanged({ scope, projectId });
});
// Project-summary regen coordinates model + project + llm, so the workflow lives
// in engine/; wire it into the memory feature's change notifier here.
setMemoryRegenHook(regenerateProjectSummary);
setSendControlNavigate((msg) => {
  mainWindow.webview.rpc?.send.controlNavigate(msg);
});

// Register control server start/stop with rpc.ts so updateSettings can toggle it
setControlServerFns(startControlServer, stopControlServer);

// Auto-start control server if previously enabled
const initSettings = settingsService.getSettings();
if (initSettings.controlServerEnabled) {
  startControlServer(initSettings.controlServerPort);
}

log.info('Proxima started');
