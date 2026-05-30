import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { QUERY_CACHE_KEY } from "./query-client";
import type { AppSettings, StoredSecureSession } from "./mobile-types";

const ACCOUNTS_KEY = "moodle.mobile.accounts";
const ACTIVE_ACCOUNT_KEY = "moodle.mobile.active-account";
const SETTINGS_KEY = "moodle.mobile.settings";

export const storageKeys = {
  accounts: ACCOUNTS_KEY,
  activeAccountId: ACTIVE_ACCOUNT_KEY,
  settings: SETTINGS_KEY,
  queryCache: QUERY_CACHE_KEY,
};

export async function readAccounts<T>() {
  const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function writeAccounts(value: unknown) {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(value));
}

export async function readActiveAccountId() {
  return await AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

export async function writeActiveAccountId(value: string | null) {
  if (value == null) {
    await AsyncStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    return;
  }
  await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, value);
}

export async function readSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return { mergeSimilarCourses: true };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      mergeSimilarCourses: parsed.mergeSimilarCourses ?? true,
    };
  } catch {
    return { mergeSimilarCourses: true };
  }
}

export async function writeSettings(settings: AppSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * expo-secure-store only accepts keys matching [a-zA-Z0-9._-].
 * Account IDs are derived from site origins (URLs) and usernames, so they
 * contain characters like ":" and "/" that are rejected. Encode the id with
 * base64url (no padding) to produce a safe key while keeping it unique.
 */
function sanitizeSecureStoreKey(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function getSecureSessionKey(accountId: string) {
  return `moodle.mobile.session.${sanitizeSecureStoreKey(accountId)}`;
}

export async function readSecureSession(accountId: string) {
  const key = getSecureSessionKey(accountId);
  const raw = Platform.OS === "web"
    ? await AsyncStorage.getItem(key)
    : await SecureStore.getItemAsync(key);
  return raw ? (JSON.parse(raw) as StoredSecureSession) : null;
}

export async function writeSecureSession(accountId: string, value: StoredSecureSession) {
  const key = getSecureSessionKey(accountId);
  const serialized = JSON.stringify(value);
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, serialized);
  } else {
    await SecureStore.setItemAsync(key, serialized);
  }
}

export async function removeSecureSession(accountId: string) {
  const key = getSecureSessionKey(accountId);
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export async function clearAllPersistentState() {
  const accounts = (await readAccounts<{ id: string }[]>()) ?? [];
  await Promise.all(accounts.map((account) => removeSecureSession(account.id)));
  await Promise.all([
    AsyncStorage.removeItem(ACCOUNTS_KEY),
    AsyncStorage.removeItem(ACTIVE_ACCOUNT_KEY),
    AsyncStorage.removeItem(QUERY_CACHE_KEY),
    AsyncStorage.removeItem(SETTINGS_KEY),
  ]);
}
