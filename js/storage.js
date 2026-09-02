const PENDING_KEY = "pendingJigData";
const ACTIVE_KEY = "activeJigRecord";
const THEME_KEY = "jigAppThemeCleanV1";

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`Unable to read ${key}`, error);
    return fallback;
  }
}

export function getPendingRecords() {
  const records = readJson(PENDING_KEY, []);
  return Array.isArray(records) ? records : [];
}

export function addPendingRecord(record) {
  const records = getPendingRecords();
  if (!records.some((item) => item.ID === record.ID)) {
    records.push(record);
    localStorage.setItem(PENDING_KEY, JSON.stringify(records));
  }
  return records;
}

export function removePendingRecord(id) {
  const records = getPendingRecords().filter((record) => record.ID !== id);
  localStorage.setItem(PENDING_KEY, JSON.stringify(records));
  return records;
}

export function saveActiveRecord(record) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(record));
}

export function getActiveRecord() {
  return readJson(ACTIVE_KEY, null);
}

export function clearActiveRecord() {
  localStorage.removeItem(ACTIVE_KEY);
}

export function getSavedTheme() {
  return localStorage.getItem(THEME_KEY);
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}
