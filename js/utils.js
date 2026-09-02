const RID_PREFIX_KEY = "jigRidPrefix";
const RID_TIME_KEY = "jigLastRidTimeValue";

function createRandomPrefix() {
  const letterBytes = new Uint8Array(2);
  crypto.getRandomValues(letterBytes);
  return Array.from(letterBytes, (value) => String.fromCharCode(65 + (value % 26))).join("");
}

function getDevicePrefix() {
  try {
    const savedPrefix = localStorage.getItem(RID_PREFIX_KEY);
    if (/^[A-Z]{2}$/.test(savedPrefix || "")) return savedPrefix;
    const newPrefix = createRandomPrefix();
    localStorage.setItem(RID_PREFIX_KEY, newPrefix);
    return newPrefix;
  } catch {
    return createRandomPrefix();
  }
}

function getNextTimeValue() {
  const currentTimeValue = Date.now() * 100;
  try {
    const previousTimeValue = Number(localStorage.getItem(RID_TIME_KEY)) || 0;
    const nextTimeValue = Math.max(currentTimeValue, previousTimeValue + 1);
    localStorage.setItem(RID_TIME_KEY, String(nextTimeValue));
    return String(nextTimeValue).padStart(15, "0");
  } catch {
    return String(currentTimeValue).padStart(15, "0");
  }
}

export function generateRecordId() {
  return `RID-${getDevicePrefix()}${getNextTimeValue()}`;
}

export function formatDateParts(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  };
}

export function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function showToast(message, type = "success") {
  const region = document.querySelector("#toastRegion");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 4500);
}
