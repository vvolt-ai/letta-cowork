
import {
  getEmailCredential,
  setEmailCredential,
  deleteEmailCredential,
  clearAllEmailCredentials,
} from '../services/settings/index.js';

export const APP_NAME = "MyElectronApp";
export const OAUTH_PORT = 4321;

console.log("process.env.EMAIL_SERVER_BASE_URL", process.env.EMAIL_SERVER_BASE_URL);
export const BASE_URL = process.env.EMAIL_SERVER_BASE_URL || "https://zoho.ngrok.app";

// ─── Getters ─────────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  return getEmailCredential('email_access_token');
}

export async function getRefreshToken(): Promise<string | null> {
  return getEmailCredential('email_refresh_token');
}

export async function getAccountId(): Promise<string | null> {
  return getEmailCredential('email_account_id');
}

export async function getInboxFolderId(): Promise<string | null> {
  return getEmailCredential('email_inbox_folder_id');
}

// ─── Setters ─────────────────────────────────────────────────────────────────

export async function saveAccessToken(token: string): Promise<void> {
  setEmailCredential('email_access_token', token);
}

export async function saveRefreshToken(token: string): Promise<void> {
  setEmailCredential('email_refresh_token', token);
}

export async function saveAccountId(accountId: string): Promise<void> {
  setEmailCredential('email_account_id', accountId);
}

export async function saveInboxFolderId(folderId: string): Promise<void> {
  setEmailCredential('email_inbox_folder_id', folderId);
}

// ─── Deleters ────────────────────────────────────────────────────────────────

export async function removeToken(): Promise<void> {
  deleteEmailCredential('email_access_token');
  deleteEmailCredential('email_refresh_token');
}

export async function clearEmailCredentials(): Promise<void> {
  clearAllEmailCredentials();
}
