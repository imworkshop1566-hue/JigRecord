import { delay } from "./utils.js";
import { CAUSE_LIST_URL, PIC_LIST_URL, POWER_AUTOMATE_URL } from "./config.js";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 1500;

export function isApiConfigured() {
  return /^https:\/\//i.test(POWER_AUTOMATE_URL) && !POWER_AUTOMATE_URL.includes("YOUR_POWER_AUTOMATE_URL");
}

export function isPicListConfigured() {
  return /^https:\/\//i.test(PIC_LIST_URL) && !PIC_LIST_URL.includes("YOUR_PIC_LIST_URL");
}

export function isCauseListConfigured() {
  return /^https:\/\//i.test(CAUSE_LIST_URL) && !CAUSE_LIST_URL.includes("YOUR_CAUSE_LIST_URL");
}

async function fetchLookupOptions(url, fieldName, notConfiguredError) {
  if (!navigator.onLine) throw new Error("OFFLINE");
  if (!/^https:\/\//i.test(url) || url.includes("YOUR_")) throw new Error(notConfiguredError);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${fieldName} HTTP ${response.status}`);
    const body = await response.json();
    const rows = Array.isArray(body) ? body : (Array.isArray(body?.value) ? body.value : []);
    const values = rows.map((row) => String(row?.[fieldName] || "").trim()).filter(Boolean);
    const uniqueValues = [...new Set(values)];
    if (!uniqueValues.length) throw new Error(`${fieldName} list is empty`);
    return uniqueValues;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchPicOptions() {
  return fetchLookupOptions(PIC_LIST_URL, "PIC", "PIC_NOT_CONFIGURED");
}

export async function fetchCauseOptions() {
  return fetchLookupOptions(CAUSE_LIST_URL, "Cause", "CAUSE_NOT_CONFIGURED");
}

async function postOnce(record) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(POWER_AUTOMATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([record]),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await response.json();
      if (body?.success === false) throw new Error("Power Automate reported failure");
      return body;
    }
    return { success: true, id: record.ID };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function sendWithRetry(record, onAttempt = () => {}) {
  if (!navigator.onLine) throw new Error("OFFLINE");
  if (!isApiConfigured()) throw new Error("NOT_CONFIGURED");

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    onAttempt(attempt, MAX_ATTEMPTS);
    try {
      return await postOnce(record);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await delay(RETRY_DELAY_MS);
    }
  }
  throw lastError || new Error("Sending failed");
}
