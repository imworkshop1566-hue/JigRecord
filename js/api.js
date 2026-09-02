import { delay } from "./utils.js";
import { POWER_AUTOMATE_URL } from "./config.js";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 1500;

export function isApiConfigured() {
  return /^https:\/\//i.test(POWER_AUTOMATE_URL) && !POWER_AUTOMATE_URL.includes("YOUR_POWER_AUTOMATE_URL");
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
