import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export function readOrCreateSecretKey(path, bytes = 32) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try { chmodSync(dirname(path), 0o700); } catch {}
  if (!existsSync(path)) {
    writeFileSync(path, randomBytes(bytes), { mode: 0o600 });
    try { chmodSync(path, 0o600); } catch {}
  }
  const key = readFileSync(path);
  if (key.length !== bytes) throw new Error(`secret key at ${path} must contain exactly ${bytes} bytes`);
  return key;
}
