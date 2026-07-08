import { Utils } from 'electrobun/bun';
import { readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { log } from '../../core/logging/logger';

export function getLogInfo(): { dir: string; sizeBytes: number; fileCount: number } {
  const dir = log.dir();
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.log'));
    const sizeBytes = files.reduce((sum, file) => {
      try {
        return sum + statSync(join(dir, file)).size;
      } catch {
        return sum;
      }
    }, 0);
    return { dir, sizeBytes, fileCount: files.length };
  } catch {
    return { dir, sizeBytes: 0, fileCount: 0 };
  }
}

export function openLogsFolder(): void {
  Utils.openPath(log.dir());
}

export function openLogFile(): void {
  Utils.openPath(log.currentFile());
}

export function clearLogs(): void {
  const dir = log.dir();
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.log'));
    for (const file of files) {
      try {
        unlinkSync(join(dir, file));
      } catch {
        // ignore per-file errors
      }
    }
  } catch {
    // ignore readdir errors
  }
}

export function logClientError(input: {
  msg: string;
  stack?: string;
  context?: Record<string, unknown>;
}): void {
  log.rendererError(input.msg, input.stack, input.context);
}
