import { readFile } from "node:fs/promises";
import type { CourseGradesCredentials } from "./types";

const URL_PATTERN = /^https?:\/\//i;

export async function loadCredentialsFromFile(path: string) {
  const text = await readFile(path, "utf8");
  return parseCredentials(text);
}

export function parseCredentials(text: string): CourseGradesCredentials {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Credentials file is empty");
  }

  const parsedJson = parseJsonCredentials(trimmed);
  if (parsedJson) return parsedJson;

  const values = new Map<string, string>();
  const loose: string[] = [];

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([^:=\s]+)\s*[:=]\s*(.+)$/);
    if (!match) {
      loose.push(line);
      continue;
    }

    values.set(normalizeKey(match[1]!), unquote(match[2]!.trim()));
  }

  for (const line of loose) {
    if (URL_PATTERN.test(line) && !values.has("siteorigin")) {
      values.set("siteorigin", line);
    }
  }

  const credentials = {
    siteOrigin:
      pick(values, "siteorigin", "site", "url", "origin", "moodle") ?? "",
    username: pick(values, "username", "user", "login", "neptun"),
    password: pick(values, "password", "pass"),
    token: pick(values, "token", "wstoken"),
    privateToken: pick(values, "privatetoken", "private_token"),
  };

  assertCredentials(credentials);
  return credentials;
}

function parseJsonCredentials(text: string) {
  try {
    const value = JSON.parse(text) as Partial<CourseGradesCredentials>;
    const credentials = {
      siteOrigin: value.siteOrigin ?? "",
      username: value.username,
      password: value.password,
      token: value.token,
      privateToken: value.privateToken,
    };
    assertCredentials(credentials);
    return credentials;
  } catch {
    return undefined;
  }
}

function assertCredentials(
  credentials: CourseGradesCredentials,
): asserts credentials is CourseGradesCredentials {
  if (!credentials.siteOrigin) {
    throw new Error("Missing Moodle site origin in credentials");
  }
  if (!credentials.token && (!credentials.username || !credentials.password)) {
    throw new Error("Credentials need either token or username and password");
  }
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(values: ReadonlyMap<string, string>, ...keys: string[]) {
  for (const key of keys.map(normalizeKey)) {
    const value = values.get(key);
    if (value) return value;
  }
  return undefined;
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
