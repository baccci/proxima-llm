const overrides = new Map<string, number | string | boolean>();

export function setOverride(key: string, value: number | string | boolean | null): void {
  if (value === null) {
    overrides.delete(key);
  } else {
    overrides.set(key, value);
  }
}

export function getOverride<T extends number | string | boolean>(key: string): T | undefined {
  return overrides.get(key) as T | undefined;
}
