import { Utils } from 'electrobun/bun';
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

const LOG_RETENTION_DAYS = 14;
const LOG_DIR = Utils.paths.userLogs;

mkdirSync(LOG_DIR, { recursive: true });

let lastDateStr = '';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentFile(): string {
  return join(LOG_DIR, `proxima-${todayStr()}.log`);
}

function appendLine(line: Record<string, unknown>): void {
  try {
    appendFileSync(currentFile(), `${JSON.stringify(line)}\n`);
  } catch {
    // ignore write errors — never throw from the logger
  }
}

function cleanup(): void {
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    const files = readdirSync(LOG_DIR).filter((f) => f.endsWith('.log'));
    for (const file of files) {
      const filePath = join(LOG_DIR, file);
      try {
        if (statSync(filePath).mtimeMs < cutoff) {
          unlinkSync(filePath);
        }
      } catch {
        // ignore per-file errors
      }
    }
  } catch {
    // ignore readdir errors
  }
}

// Roll cleanup once per calendar day, on the first write of that day.
function maybeRollover(): void {
  const now = todayStr();
  if (now !== lastDateStr) {
    lastDateStr = now;
    cleanup();
  }
}

function write(
  level: 'error' | 'warn' | 'info',
  source: 'main' | 'renderer',
  msg: string,
  errOrCtx?: unknown,
): void {
  maybeRollover();

  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    source,
    msg,
  };

  if (errOrCtx instanceof Error) {
    line.msg = `${msg}: ${errOrCtx.message}`;
    line.stack = errOrCtx.stack;
  } else if (errOrCtx !== undefined) {
    line.context = errOrCtx;
  }

  appendLine(line);
}

function rendererError(msg: string, stack?: string, context?: Record<string, unknown>): void {
  maybeRollover();

  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level: 'error',
    source: 'renderer',
    msg,
  };
  if (stack) {
    line.stack = stack;
  }
  if (context) {
    line.context = context;
  }

  appendLine(line);
}

/**
 * The single entry point for all logging in the bun (main) process.
 * Renderer code can't import this — it logs over RPC via `logClientError`,
 * which lands here through `log.rendererError`.
 */
export const log = {
  // Level logging (main process)
  error: (msg: string, errOrCtx?: unknown) => write('error', 'main', msg, errOrCtx),
  warn: (msg: string, errOrCtx?: unknown) => write('warn', 'main', msg, errOrCtx),
  info: (msg: string, errOrCtx?: unknown) => write('info', 'main', msg, errOrCtx),

  // Errors forwarded from the renderer over RPC
  rendererError,

  // Lifecycle — call once during boot
  init: () => {
    lastDateStr = todayStr();
    cleanup();
  },
  installGlobalHandlers: () => {
    process.on('uncaughtException', (err) => {
      write('error', 'main', 'Uncaught exception', err);
    });
    process.on('unhandledRejection', (reason) => {
      write(
        'error',
        'main',
        'Unhandled rejection',
        reason instanceof Error ? reason : new Error(String(reason)),
      );
    });
  },

  // Introspection — used by the logs service for the Diagnostics UI
  dir: () => LOG_DIR,
  currentFile: () => currentFile(),
};
