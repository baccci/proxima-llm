import { randomBytes } from 'crypto';
import { z } from 'zod';
import { readSettingsBlob, writeSettingsBlob } from '../../infra/db/settings-store';

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
const TOKENS_KEY = 'control_server_tokens';

// In-memory pairing codes, ephemeral and never persisted.
interface PairingCode {
  code: string;
  expiresAt: number;
  used: boolean;
}

const pairingCodes = new Map<string, PairingCode>();

const ControlToken = z.object({
  token: z.string(),
  label: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type ControlToken = z.infer<typeof ControlToken>;

const ControlTokens = z.array(ControlToken);

function loadTokens(): ControlToken[] {
  const raw = readSettingsBlob(TOKENS_KEY);
  if (raw === undefined) {
    return [];
  }

  return ControlTokens.parse(raw);
}

function saveTokens(tokens: ControlToken[]): void {
  writeSettingsBlob(TOKENS_KEY, tokens);
}

// Make a short-lived, single-use pairing code the user reads out to authorize a
// new client. Codes live only in memory and expire after PAIRING_CODE_TTL_MS.
export function generatePairingCode(): { code: string; expiresAt: string } {
  const code = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + PAIRING_CODE_TTL_MS;
  pairingCodes.set(code, { code, expiresAt, used: false });
  return { code, expiresAt: new Date(expiresAt).toISOString() };
}

// Redeem a pairing code. Returns false for an unknown, already-used, or expired
// code; a successful redeem burns the code so it cannot be reused.
export function consumePairingCode(code: string): boolean {
  const entry = pairingCodes.get(code);
  if (!entry) {
    return false;
  }
  if (entry.used) {
    return false;
  }
  if (Date.now() > entry.expiresAt) {
    pairingCodes.delete(code);
    return false;
  }

  entry.used = true;
  pairingCodes.delete(code);
  return true;
}

// Issue a fresh bearer token for a paired client and persist it with the rest.
export function mintToken(label: string): string {
  const token = randomBytes(32).toString('hex');
  const tokens = loadTokens();
  tokens.push({ token, label, createdAt: new Date().toISOString(), lastUsedAt: null });
  saveTokens(tokens);
  return token;
}

// Check a bearer token against the stored set. On a match, stamp its last-used
// time so the tokens list can surface recent activity.
export function validateToken(bearer: string): boolean {
  const tokens = loadTokens();
  const entry = tokens.find((t) => t.token === bearer);
  if (!entry) {
    return false;
  }

  entry.lastUsedAt = new Date().toISOString();
  saveTokens(tokens);
  return true;
}

// Every issued control token, for the settings UI to list or revoke.
export function listTokens(): ControlToken[] {
  return loadTokens();
}

// Drop a token so it stops validating.
export function revokeToken(token: string): void {
  saveTokens(loadTokens().filter((t) => t.token !== token));
}
