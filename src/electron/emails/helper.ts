
import keytar from "keytar";

export const APP_NAME = "MyElectronApp";
export const OAUTH_PORT = 4321;

console.log("process.env.EMAIL_SERVER_BASE_URL" , process.env.EMAIL_SERVER_BASE_URL)
export const BASE_URL = process.env.EMAIL_SERVER_BASE_URL || "https://zoho.ngrok.app";



export async function getAccessToken() {
  return keytar.getPassword(APP_NAME, "email_access_token");
}

export async function getRefreshToken() {
  return keytar.getPassword(APP_NAME, "email_refresh_token");
}

export async function getAccountId() {
  return keytar.getPassword(APP_NAME, "email_account_id");
}

export async function getInboxFolderId() {
  return keytar.getPassword(APP_NAME, "email_inbox_folder_id");
}


export async function saveAccessToken(token: string) {
  return keytar.setPassword(APP_NAME, "email_access_token", token);
}

export async function saveRefreshToken(token: string) {
  return keytar.setPassword(APP_NAME, "email_refresh_token", token);
}

export async function saveAccountId(accountId: string) {
  return keytar.setPassword(APP_NAME, "email_account_id", accountId);
}

export async function saveInboxFolderId(folderId: string) {
  return keytar.setPassword(APP_NAME, "email_inbox_folder_id", folderId);
}

export async function removeToken() {
  await keytar.deletePassword(APP_NAME, "email_access_token");
  return keytar.deletePassword(APP_NAME, "email_refresh_token");
}

export async function clearEmailCredentials() {
  await Promise.all([
    keytar.deletePassword(APP_NAME, "email_access_token"),
    keytar.deletePassword(APP_NAME, "email_refresh_token"),
    keytar.deletePassword(APP_NAME, "email_account_id"),
    keytar.deletePassword(APP_NAME, "email_inbox_folder_id"),
  ]);
}
