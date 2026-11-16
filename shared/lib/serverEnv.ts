import fs from "node:fs";
import path from "node:path";

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function decodeEnvBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  const nullRatio = utf8.length === 0 ? 0 : (utf8.match(/\u0000/g)?.length ?? 0) / utf8.length;

  // Some Windows tools save env files in UTF-16LE.
  if (nullRatio > 0.1) {
    return buffer.toString("utf16le");
  }

  return utf8;
}

function parseEnvText(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    parsed[key] = stripWrappingQuotes(rawValue);
  }

  return parsed;
}

function readEnvFileFallback(): Record<string, string> {
  const cwd = process.cwd();
  const candidates: string[] = [];
  let cursor = cwd;
  let hops = 0;

  while (hops < 8) {
    candidates.push(path.join(cursor, ".env.local"));
    candidates.push(path.join(cursor, ".env"));

    const parent = path.dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
    hops += 1;
  }
  const merged: Record<string, string> = {};

  for (const filePath of candidates) {
    try {
      const buffer = fs.readFileSync(filePath);
      const text = decodeEnvBuffer(buffer);
      Object.assign(merged, parseEnvText(text));
    } catch {
      // Ignore missing files and continue.
    }
  }

  return merged;
}

export function getServerEnv(name: string): string | null {
  const runtimeValue = process.env[name];
  if (runtimeValue && runtimeValue.trim().length > 0) {
    return runtimeValue.trim();
  }

  const fallbackValue = readEnvFileFallback()[name];
  if (fallbackValue && fallbackValue.trim().length > 0) {
    return fallbackValue.trim();
  }

  return null;
}
