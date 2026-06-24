import { dlopen, FFIType } from 'bun:ffi';
import { ApplicationMenu, BrowserWindow, Updater } from 'electrobun/bun';
import { join } from 'path';
import { startControlServer, stopControlServer } from './control-server/server';
import { setupSchema } from './db/migrate';
import { seedModels } from './db/seed';
import {
  createRPC,
  pushModelsUpdated,
  setControlServerFns,
  setSendControlNavigate,
  setSendModelsUpdated,
} from './rpc';
import { setSendChatsUpdated, setSendToWebview } from './services/chat-stream.service';
import { syncOpenRouterModels } from './services/model-sync.service';
import * as settingsService from './services/settings.service';

const DEV_SERVER_PORT = 5173;

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === 'dev') {
    try {
      await fetch(`http://localhost:${DEV_SERVER_PORT}`, { method: 'HEAD' });
      console.log(`HMR enabled: http://localhost:${DEV_SERVER_PORT}`);
      return `http://localhost:${DEV_SERVER_PORT}`;
    } catch {
      console.log('Vite server not running — using bundled assets. Run "bun run dev:hmr" for HMR.');
    }
  }
  return 'views://mainview/index.html';
}

// Boot
setupSchema();
await seedModels();
// Non-blocking background sync — UI renders from DB cache instantly
syncOpenRouterModels(pushModelsUpdated).catch((err) =>
  console.error('OpenRouter sync failed (non-fatal):', err),
);

const rpc = createRPC();
const url = await getMainViewUrl();

export const mainWindow = new BrowserWindow({
  title: 'LLM Chat',
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
  setTrafficLightsPosition: {
    args: [FFIType.ptr, FFIType.f64, FFIType.f64],
    returns: FFIType.void,
  },
});

const TRAFFIC_LIGHT_X = 18;
const TRAFFIC_LIGHT_Y = 24;

function applyTrafficLights() {
  trafficLightsLib.symbols.setTrafficLightsPosition(
    mainWindow.ptr,
    TRAFFIC_LIGHT_X,
    TRAFFIC_LIGHT_Y,
  );
}

// Initial placement — deferred so the window ptr is ready
setTimeout(applyTrafficLights, 100);

// Re-apply after every resize; macOS resets native button positions on resize
let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
mainWindow.on('resize', () => {
  if (resizeDebounce) clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(applyTrafficLights, 50);
});

ApplicationMenu.setApplicationMenu([
  {
    label: 'LLM Chat',
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
setSendControlNavigate((msg) => {
  mainWindow.webview.rpc?.send.controlNavigate(msg);
});

// Register control server start/stop with rpc.ts so updateSettings can toggle it
setControlServerFns(startControlServer, stopControlServer);

// Auto-start control server if previously enabled
const initSettings = settingsService.getSettings();
if (initSettings.controlServerEnabled) {
  startControlServer(initSettings.controlServerPort ?? 7865);
}

console.log('LLM Chat started');
