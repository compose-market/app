import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const files = [".env", ".env.local"].map((name) => join(root, name));

function parse(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const index = trimmed.indexOf("=");
  if (index < 0) return null;
  const key = trimmed.slice(0, index).trim();
  const raw = trimmed.slice(index + 1).trim();
  const value = raw.replace(/^['"]|['"]$/g, "");
  return key ? [key, value] : null;
}

function env(): Record<string, string> {
  const values: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const entry = parse(line);
      if (entry) values[entry[0]] = entry[1];
    }
  }
  return values;
}

const values = env();
const token = values.VITE_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY || "";

if (!token.trim()) {
  throw new Error("Logo.dev chain logos require VITE_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY.");
}

if (/^sk[_-]/i.test(token.trim())) {
  throw new Error("Logo.dev chain logos require a publishable image key, not a secret sk_ key.");
}
