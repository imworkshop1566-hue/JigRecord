import { WorkTimer } from "./timer.js";
import { ScannerController } from "./scanner.js";
import { fetchCauseOptions, fetchPicOptions, isApiConfigured, sendWithRetry } from "./api.js";
import {
  addPendingRecord,
  clearActiveRecord,
  getCachedCauseOptions,
  getCachedPicOptions,
  getActiveRecord,
  getPendingRecords,
  getSavedPic,
  getSavedTheme,
  removePendingRecord,
  saveActiveRecord,
  saveCauseOptions,
  savePic,
  savePicOptions,
  saveTheme,
} from "./storage.js";
import { formatDateParts, generateRecordId, showToast } from "./utils.js";

const $ = (selector) => document.querySelector(selector);
const form = $("#recordForm");
const fields = {
  id: $("#recordId"), jigNo: $("#jigNo"), jigType: $("#jigType"),
  startDay: $("#startDay"), startTime: $("#startTime"), finishDay: $("#finishDay"),
  finishTime: $("#finishTime"), duration: $("#duration"), cause: $("#cause"),
  detail: $("#detail"), action: $("#action"), image: $("#imageUrl"), pic: $("#pic"),
};

let sending = false;
let selectedImages = [];
let suspendPersistence = false;
let draftSaveTimeout = null;
let picOptionsAvailable = false;
let causeOptionsAvailable = false;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 450 * 1024;

const timer = new WorkTimer({
  onTick: updateTimerView,
  onStateChange: (snapshot) => {
    updateTimerView(snapshot);
    persistActiveRecord();
  },
});

const scanner = new ScannerController({
  modal: $("#scannerModal"),
  readerElementId: "qrReader",
  messageElement: $("#scannerMessage"),
  onScan: (value, source) => confirmJigAndStart(value, source),
});

function updateTimerView(snapshot) {
  if (!snapshot) return;
  $("#floatingTimerDisplay").textContent = snapshot.duration;
  fields.duration.value = snapshot.duration;
  if (snapshot.start) {
    fields.startDay.value = snapshot.start.day;
    fields.startTime.value = snapshot.start.time;
  }
  const floatingState = $("#floatingTimerState");
  floatingState.textContent = snapshot.state;
  floatingState.className = `state-badge ${snapshot.state.toLowerCase()}`;
  $("#floatingStartButton").disabled = snapshot.state === "RUNNING" || sending;
  $("#floatingStopButton").disabled = snapshot.state !== "RUNNING" || sending;
}

function startWorkTimer() {
  timer.start();
  showToast("Timer started");
}

function stopWorkTimer() {
  timer.stop();
  persistActiveRecord();
  showToast("Timer stopped");
}

function hasValidJigSeparators(value) {
  const jigNumber = String(value || "");
  return (jigNumber.match(/-/g) || []).length === 3 && (jigNumber.match(/\./g) || []).length === 3;
}

function updateSendAvailability() {
  const jigNumber = fields.jigNo.value.trim();
  const invalidLabel = Boolean(jigNumber) && !hasValidJigSeparators(jigNumber);
  const sendButton = $("#sendButton");
  sendButton.disabled = sending || invalidLabel;
  sendButton.title = invalidLabel ? "Label ไม่ถูกต้อง" : "";
}

function confirmJigAndStart(value = fields.jigNo.value, source = "manual") {
  const jigNumber = String(value || "").trim();
  if (!jigNumber) {
    fields.jigNo.classList.add("field-error");
    fields.jigNo.focus();
    showToast("Please enter or scan a Jig number", "warning");
    return;
  }
  fields.jigNo.value = jigNumber;
  const validFormat = hasValidJigSeparators(jigNumber);
  fields.jigNo.classList.toggle("field-error", !validFormat);
  fields.jigNo.setAttribute("aria-invalid", String(!validFormat));
  fields.jigNo.dispatchEvent(new Event("input", { bubbles: true }));
  updateSendAvailability();
  const timerWasIdle = timer.state === "IDLE";
  if (timerWasIdle) {
    timer.start();
  }

  if (!validFormat) {
    showToast("Label ไม่ถูกต้อง", "warning");
  } else if (timerWasIdle) {
    const label = source === "usb" ? "USB scan" : source === "camera" ? "Scan" : "Jig confirmed";
    showToast(`${label}: ${jigNumber} — timer started`);
  } else if (timer.state === "RUNNING") {
    const label = source === "usb" ? "USB scan" : source === "camera" ? "Scan" : "Jig confirmed";
    showToast(`${label}: ${jigNumber} — timer continues`);
  } else if (timer.state === "STOPPED") {
    showToast(`Jig updated: ${jigNumber} — timer remains stopped`);
  } else {
    showToast(`Jig updated: ${jigNumber} — timer continues`);
  }
}

function readRecord() {
  return {
    "ID": fields.id.value.trim(),
    "Start day": fields.startDay.value,
    "Start time": fields.startTime.value,
    "Finish day": fields.finishDay.value,
    "Finish time": fields.finishTime.value,
    "Jig no.": fields.jigNo.value.trim(),
    "Jig type": fields.jigType.value.trim(),
    "Cause": fields.cause.value.trim(),
    "Detail": fields.detail.value.trim(),
    "Action": fields.action.value.trim(),
    "Image": fields.image.value.trim(),
    "Duration": fields.duration.value,
    "PIC": fields.pic.value.trim(),
  };
}

function validateRecord(record) {
  const inputByName = new Map(Object.values(fields).map((element) => [element.name, element]));
  document.querySelectorAll(".field-error").forEach((element) => element.classList.remove("field-error"));
  const missing = Object.entries(record)
    .filter(([name, value]) => name !== "Image" && !String(value).trim())
    .map(([name]) => name);
  if (timer.state === "IDLE" && !missing.includes("Start day")) missing.push("Timer has not started");
  missing.forEach((name) => inputByName.get(name)?.classList.add("field-error"));

  const summary = $("#validationSummary");
  if (missing.length) {
    summary.innerHTML = `<strong>Please enter:</strong> ${missing.join(", ")}`;
    summary.hidden = false;
    inputByName.get(missing[0])?.focus();
    return false;
  }
  if (!hasValidJigSeparators(record["Jig no."])) {
    fields.jigNo.classList.add("field-error");
    fields.jigNo.setAttribute("aria-invalid", "true");
    summary.textContent = "Label ไม่ถูกต้อง";
    summary.hidden = false;
    updateSendAvailability();
    fields.jigNo.focus();
    return false;
  }
  if (record.Image) {
    try {
      const images = JSON.parse(record.Image);
      if (!Array.isArray(images) || images.length === 0 || images.length > MAX_IMAGES) throw new Error("Invalid images");
    } catch {
      summary.innerHTML = `<strong>Images:</strong> The selected photos could not be processed. Please add them again.`;
      summary.hidden = false;
      $("#imageFile").focus();
      return false;
    }
  }
  summary.hidden = true;
  return true;
}

function serializeActiveRecord() {
  return {
    form: readRecord(),
    timerState: timer.state,
    startTimestamp: timer.startTimestamp,
    finishTimestamp: timer.finishTimestamp,
    savedAt: Date.now(),
  };
}

function persistActiveRecord() {
  if (suspendPersistence) return;
  const record = readRecord();
  const hasDraftData = timer.state !== "IDLE" || selectedImages.length > 0 || [
    "Jig no.", "Jig type", "Cause", "Detail", "Action", "PIC",
  ].some((name) => Boolean(record[name]));
  if (hasDraftData) saveActiveRecord(serializeActiveRecord());
  else clearActiveRecord();
}

function scheduleDraftPersistence() {
  window.clearTimeout(draftSaveTimeout);
  draftSaveTimeout = window.setTimeout(persistActiveRecord, 250);
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image compression failed")), "image/jpeg", quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Image reading failed"));
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
  const bitmap = await createImageBitmap(file);
  let maxDimension = 1280;
  let quality = 0.78;
  let blob;

  try {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvasToBlob(canvas, quality);
      if (blob.size <= MAX_IMAGE_BYTES) break;
      if (quality > 0.48) quality -= 0.1;
      else maxDimension = Math.round(maxDimension * 0.8);
    }
  } finally {
    bitmap.close();
  }

  if (!blob) throw new Error("Image compression failed");
  const dataUrl = await blobToDataUrl(blob);
  return {
    type: "image/jpeg",
    content: dataUrl.split(",")[1],
    preview: dataUrl,
    size: blob.size,
  };
}

function syncImageField() {
  const payload = selectedImages.map((image, index) => ({
    name: `${fields.id.value}-${String(index + 1).padStart(2, "0")}.jpg`,
    type: image.type,
    content: image.content,
  }));
  fields.image.value = payload.length ? JSON.stringify(payload) : "";
  fields.image.dispatchEvent(new Event("input", { bubbles: true }));
  $("#fileName").textContent = `${selectedImages.length} / ${MAX_IMAGES} photos`;
}

function renderImagePreviews() {
  const wrap = $("#imagePreviewWrap");
  wrap.hidden = selectedImages.length === 0;
  wrap.replaceChildren();
  selectedImages.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = "image-preview-item";
    const preview = document.createElement("img");
    preview.src = image.preview || `data:${image.type};base64,${image.content}`;
    preview.alt = `Selected photo ${index + 1}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "image-remove-button";
    remove.setAttribute("aria-label", `Remove photo ${index + 1}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      selectedImages.splice(index, 1);
      syncImageField();
      renderImagePreviews();
    });
    item.append(preview, remove);
    wrap.append(item);
  });
}

function restoreImages(imageValue) {
  try {
    const images = JSON.parse(imageValue || "[]");
    selectedImages = Array.isArray(images)
      ? images.slice(0, MAX_IMAGES).map((image) => ({ ...image, preview: `data:${image.type};base64,${image.content}` }))
      : [];
  } catch {
    selectedImages = [];
  }
  syncImageField();
  renderImagePreviews();
}

function restoreRecord(saved) {
  const record = saved.form || {};
  Object.values(fields).forEach((element) => {
    if (element.name && record[element.name] !== undefined) element.value = record[element.name];
  });
  restoreImages(record.Image);
  timer.restore({ state: saved.timerState, startTimestamp: saved.startTimestamp, finishTimestamp: saved.finishTimestamp });
  clearActiveRecord();
  persistActiveRecord();
  showToast(timer.state === "RUNNING" ? "Draft restored — timer continues" : "Draft restored");
}

function resetForm({ confirmActive = false, preserveActive = false } = {}) {
  if (confirmActive && timer.state !== "IDLE" && !window.confirm("Start a new record and discard the current active record?")) return;
  suspendPersistence = true;
  try {
    form.reset();
    timer.reset();
    fields.id.value = generateRecordId();
    fields.duration.value = "00:00:00";
    fields.cause.value = "";
    fields.pic.value = getSavedPic();
    $("#validationSummary").hidden = true;
    selectedImages = [];
    syncImageField();
    renderImagePreviews();
    if (!preserveActive) clearActiveRecord();
  } finally {
    suspendPersistence = false;
  }
  fields.jigNo.focus();
}

async function submitRecord(event) {
  event.preventDefault();
  if (sending) return;
  const sendTimestamp = Date.now();
  const sendDateTime = formatDateParts(new Date(sendTimestamp));
  const draftRecord = {
    ...readRecord(),
    "Finish day": sendDateTime.day,
    "Finish time": sendDateTime.time,
  };
  if (!validateRecord(draftRecord)) return;

  if (timer.state === "RUNNING") timer.stop(sendTimestamp);
  fields.finishDay.value = sendDateTime.day;
  fields.finishTime.value = sendDateTime.time;
  persistActiveRecord();
  const record = readRecord();

  if (!navigator.onLine) {
    addPendingRecord(record);
    renderPending();
    showToast("Offline — record saved to pending data", "warning");
    return;
  }

  sending = true;
  setSendingState(true, "Sending…");
  try {
    await sendWithRetry(record, (attempt, max) => setSendingState(true, `Sending… ${attempt}/${max}`));
    showToast("✓ Data Sent Successfully");
    clearActiveRecord();
    resetForm();
  } catch (error) {
    addPendingRecord(record);
    renderPending();
    const message = error.message === "NOT_CONFIGURED"
      ? "Power Automate URL is not configured — saved to pending data"
      : "✕ Sending Failed — saved to pending data";
    showToast(message, "error");
  } finally {
    sending = false;
    setSendingState(false);
    updateTimerView(timer.snapshot());
  }
}

function setSendingState(active, label = "SEND DATA") {
  const button = $("#sendButton");
  button.disabled = active;
  button.querySelector("span").textContent = label;
  form.querySelectorAll("input, textarea, select, button").forEach((element) => {
    if (element !== button) element.disabled = active;
  });
  fields.pic.disabled = active;
  $("#floatingStartButton").disabled = active;
  $("#floatingStopButton").disabled = active;
  $("#floatingResetButton").disabled = active;
  if (!active) {
    form.querySelectorAll("input, textarea, select, button").forEach((element) => { element.disabled = false; });
    fields.cause.disabled = !causeOptionsAvailable;
    fields.pic.disabled = !picOptionsAvailable;
    fields.id.readOnly = true;
    [fields.startDay, fields.startTime, fields.finishDay, fields.finishTime, fields.duration].forEach((element) => { element.readOnly = true; });
    $("#floatingResetButton").disabled = false;
    button.querySelector("span").textContent = "SEND DATA";
    updateSendAvailability();
  }
}

async function retryPending(id) {
  if (!navigator.onLine) {
    showToast("Cannot retry while offline", "warning");
    return false;
  }
  const record = getPendingRecords().find((item) => item.ID === id);
  if (!record) return true;
  const button = document.querySelector(`[data-retry-id="${CSS.escape(id)}"]`);
  if (button) { button.disabled = true; button.textContent = "SENDING…"; }
  try {
    await sendWithRetry(record, (attempt, max) => { if (button) button.textContent = `${attempt}/${max}`; });
    removePendingRecord(id);
    renderPending();
    showToast(`Sent ${id}`);
    return true;
  } catch (error) {
    showToast(error.message === "NOT_CONFIGURED" ? "Configure the Power Automate URL first" : `Retry failed: ${id}`, "error");
    if (button) { button.disabled = false; button.textContent = "RETRY"; }
    return false;
  }
}

async function retryAll() {
  for (const record of getPendingRecords()) {
    const success = await retryPending(record.ID);
    if (!success && !navigator.onLine) break;
  }
}

function renderPending() {
  const records = getPendingRecords();
  $("#pendingCount").textContent = `(${records.length})`;
  $("#retryAllButton").hidden = records.length === 0;
  if (!records.length) {
    $("#pendingList").innerHTML = `<div class="empty-state"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7 10 17l-5-5"/></svg><p>No pending records</p><small>Failed submissions will be stored safely on this device.</small></div>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  records.forEach((record) => {
    const item = document.createElement("article");
    item.className = "pending-item";
    const id = document.createElement("p");
    id.className = "pending-id";
    id.textContent = record.ID;
    const meta = document.createElement("div");
    meta.className = "pending-meta";
    const jig = document.createElement("strong");
    jig.textContent = record["Jig no."] || "No jig number";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button ghost";
    retry.dataset.retryId = record.ID;
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => retryPending(record.ID));
    const saved = document.createElement("small");
    saved.textContent = `${record["Start day"] || "—"} · ${record["PIC"] || "No PIC"}`;
    meta.append(jig, retry);
    item.append(id, meta, saved);
    fragment.append(item);
  });
  $("#pendingList").replaceChildren(fragment);
}

function updateNetworkStatus() {
  const status = $("#networkStatus");
  const online = navigator.onLine;
  status.className = `network-status ${online ? "online" : "offline"}`;
  status.innerHTML = '<span class="status-dot"></span>';
  status.setAttribute("aria-label", online ? "Online" : "Offline");
  status.title = online ? "Online" : "Offline";
  if (online && getPendingRecords().length) showToast("Pending data available — ready to retry", "warning");
}

function initializeTheme() {
  const saved = getSavedTheme();
  const theme = saved || "light";
  document.documentElement.dataset.theme = theme;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  saveTheme(next);
}

function renderPicOptions(options, preferredPic = "") {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select PIC";
  placeholder.disabled = true;
  placeholder.selected = true;
  const optionElements = options.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    return option;
  });
  fields.pic.replaceChildren(placeholder, ...optionElements);
  picOptionsAvailable = options.length > 0;
  fields.pic.disabled = !picOptionsAvailable || sending;
  if (options.includes(preferredPic)) fields.pic.value = preferredPic;
}

async function loadPicOptions(preferredPic = getSavedPic()) {
  fields.pic.disabled = true;
  fields.pic.replaceChildren(Object.assign(document.createElement("option"), {
    value: "",
    textContent: "Loading PIC…",
  }));

  const cachedOptions = getCachedPicOptions();
  try {
    const options = await fetchPicOptions();
    savePicOptions(options);
    renderPicOptions(options, preferredPic);
  } catch (error) {
    if (cachedOptions.length) {
      renderPicOptions(cachedOptions, preferredPic);
      showToast("Using cached PIC list", "warning");
      return;
    }
    picOptionsAvailable = false;
    fields.pic.replaceChildren(Object.assign(document.createElement("option"), {
      value: "",
      textContent: "PIC unavailable",
    }));
    fields.pic.disabled = true;
    const message = error.message === "PIC_NOT_CONFIGURED" ? "PIC_LIST_URL is not configured" : "Unable to load PIC list";
    showToast(message, "error");
  }
}

function renderCauseOptions(options, preferredCause = "") {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select cause";
  placeholder.disabled = true;
  placeholder.selected = true;
  const optionElements = options.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    return option;
  });
  fields.cause.replaceChildren(placeholder, ...optionElements);
  causeOptionsAvailable = options.length > 0;
  fields.cause.disabled = !causeOptionsAvailable || sending;
  if (options.includes(preferredCause)) fields.cause.value = preferredCause;
}

async function loadCauseOptions(preferredCause = "") {
  fields.cause.disabled = true;
  fields.cause.replaceChildren(Object.assign(document.createElement("option"), {
    value: "",
    textContent: "Loading Cause…",
  }));

  const cachedOptions = getCachedCauseOptions();
  try {
    const options = await fetchCauseOptions();
    saveCauseOptions(options);
    renderCauseOptions(options, preferredCause);
  } catch (error) {
    if (cachedOptions.length) {
      renderCauseOptions(cachedOptions, preferredCause);
      showToast("Using cached Cause list", "warning");
      return;
    }
    causeOptionsAvailable = false;
    fields.cause.replaceChildren(Object.assign(document.createElement("option"), {
      value: "",
      textContent: "Cause unavailable",
    }));
    fields.cause.disabled = true;
    const message = error.message === "CAUSE_NOT_CONFIGURED" ? "CAUSE_LIST_URL is not configured" : "Unable to load Cause list";
    showToast(message, "error");
  }
}

$("#floatingStartButton").addEventListener("click", startWorkTimer);
$("#floatingStopButton").addEventListener("click", stopWorkTimer);
$("#floatingResetButton").addEventListener("click", () => {
  if (timer.state !== "IDLE" && !window.confirm("Reset the timer and clear its date/time values?")) return;
  timer.reset();
  [fields.startDay, fields.startTime, fields.finishDay, fields.finishTime].forEach((field) => { field.value = ""; });
  fields.duration.value = "00:00:00";
  persistActiveRecord();
});
$("#confirmJigButton").addEventListener("click", () => confirmJigAndStart());
fields.jigNo.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  confirmJigAndStart();
});
$("#scanButton").addEventListener("click", () => scanner.open());
$("#closeScannerButton").addEventListener("click", () => scanner.close());
$("#cancelScannerButton").addEventListener("click", () => scanner.close());
$("#retryAllButton").addEventListener("click", retryAll);
$("#themeToggle").addEventListener("click", toggleTheme);
form.addEventListener("submit", submitRecord);
form.addEventListener("input", () => {
  scheduleDraftPersistence();
  updateSendAvailability();
  $("#validationSummary").hidden = true;
});
fields.pic.addEventListener("input", () => {
  savePic(fields.pic.value);
  scheduleDraftPersistence();
  $("#validationSummary").hidden = true;
});
$("#imageFile").addEventListener("change", async (event) => {
  const availableSlots = MAX_IMAGES - selectedImages.length;
  const files = Array.from(event.target.files || []).slice(0, availableSlots);
  event.target.value = "";
  if (!files.length) {
    showToast(`Maximum ${MAX_IMAGES} photos per record`, "warning");
    return;
  }

  $("#fileName").textContent = "Compressing…";
  try {
    for (const file of files) selectedImages.push(await compressImage(file));
    syncImageField();
    renderImagePreviews();
    showToast(`${files.length} photo${files.length > 1 ? "s" : ""} ready`);
  } catch (error) {
    console.error(error);
    syncImageField();
    renderImagePreviews();
    showToast(error.message || "Unable to process image", "error");
  }
});
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("online", () => loadPicOptions(fields.pic.value || getSavedPic()));
window.addEventListener("online", () => loadCauseOptions(fields.cause.value));
window.addEventListener("offline", updateNetworkStatus);
window.addEventListener("pagehide", persistActiveRecord);

const floatingTimer = $("#floatingTimer");
floatingTimer.setAttribute("aria-hidden", "false");
floatingTimer.querySelectorAll("button").forEach((button) => { button.tabIndex = 0; });

const storedActiveRecord = getActiveRecord();
initializeTheme();
resetForm({ preserveActive: Boolean(storedActiveRecord) });
renderPending();
updateNetworkStatus();
if (storedActiveRecord) restoreRecord(storedActiveRecord);
updateSendAvailability();
loadPicOptions(storedActiveRecord?.form?.PIC || getSavedPic());
loadCauseOptions(storedActiveRecord?.form?.Cause || "");
