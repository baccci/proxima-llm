import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { settings } from '../db/schema';

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
const TOKENS_KEY = 'control_server_tokens';

// In-memory pairing codes — ephemeral, never persisted.
interface PairingCode {
  code: string;
  expiresAt: number;
  used: boolean;
}

const pairingCodes = new Map<string, PairingCode>();

export interface ControlToken {
  token: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function loadTokens(): ControlToken[] {
  const row = db.select().from(settings).where(eq(settings.key, TOKENS_KEY)).get();
  if (!row) return [];
  return (row.value as ControlToken[]) ?? [];
}

function saveTokens(tokens: ControlToken[]): void {
  db.insert(settings)
    .values({ key: TOKENS_KEY, value: tokens as unknown as string })
    .onConflictDoUpdate({ target: settings.key, set: { value: tokens as unknown as string } })
    .run();
}

export function generatePairingCode(): { code: string; expiresAt: string } {
  const code = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + PAIRING_CODE_TTL_MS;
  pairingCodes.set(code, { code, expiresAt, used: false });
  return { code, expiresAt: new Date(expiresAt).toISOString() };
}

export function consumePairingCode(code: string): boolean {
  const entry = pairingCodes.get(code);
  if (!entry) return false;
  if (entry.used) return false;
  if (Date.now() > entry.expiresAt) {
    pairingCodes.delete(code);
    return false;
  }
  entry.used = true;
  pairingCodes.delete(code);
  return true;
}

export function mintToken(label: string): string {
  const token = randomBytes(32).toString('hex');
  const tokens = loadTokens();
  tokens.push({ token, label, createdAt: new Date().toISOString(), lastUsedAt: null });
  saveTokens(tokens);
  return token;
}

export function validateToken(bearer: string): boolean {
  const tokens = loadTokens();
  const entry = tokens.find((t) => t.token === bearer);
  if (!entry) return false;
  // Update lastUsedAt
  entry.lastUsedAt = new Date().toISOString();
  saveTokens(tokens);
  return true;
}

export function listTokens(): ControlToken[] {
  return loadTokens().map(({ token, label, createdAt, lastUsedAt }) => ({
    token,
    label,
    createdAt,
    lastUsedAt,
  }));
}

export function revokeToken(token: string): void {
  saveTokens(loadTokens().filter((t) => t.token !== token));
}
