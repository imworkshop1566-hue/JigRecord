import { formatDateParts, formatDuration } from "./utils.js";

export class WorkTimer {
  constructor({ onTick, onStateChange }) {
    this.onTick = onTick;
    this.onStateChange = onStateChange;
    this.state = "IDLE";
    this.startTimestamp = null;
    this.finishTimestamp = null;
    this.intervalId = null;
    this.emit();
  }

  start(timestamp = Date.now()) {
    if (this.state === "RUNNING") return this.snapshot();
    this.startTimestamp = timestamp;
    this.finishTimestamp = null;
    this.state = "RUNNING";
    this.startInterval();
    this.onStateChange?.(this.snapshot());
    return this.snapshot();
  }

  stop(timestamp = Date.now()) {
    if (this.state !== "RUNNING") return this.snapshot();
    this.finishTimestamp = Math.max(timestamp, this.startTimestamp);
    this.state = "STOPPED";
    this.clearInterval();
    this.emit();
    this.onStateChange?.(this.snapshot());
    return this.snapshot();
  }

  reset() {
    this.clearInterval();
    this.state = "IDLE";
    this.startTimestamp = null;
    this.finishTimestamp = null;
    this.emit();
    this.onStateChange?.(this.snapshot());
    return this.snapshot();
  }

  restore({ state, startTimestamp, finishTimestamp }) {
    this.clearInterval();
    this.state = state || "IDLE";
    this.startTimestamp = Number(startTimestamp) || null;
    this.finishTimestamp = Number(finishTimestamp) || null;
    if (this.state === "RUNNING" && this.startTimestamp) this.startInterval();
    this.emit();
    this.onStateChange?.(this.snapshot());
  }

  elapsed() {
    if (!this.startTimestamp) return 0;
    const end = this.state === "RUNNING" ? Date.now() : (this.finishTimestamp || this.startTimestamp);
    return Math.max(0, end - this.startTimestamp);
  }

  snapshot() {
    return {
      state: this.state,
      startTimestamp: this.startTimestamp,
      finishTimestamp: this.finishTimestamp,
      duration: formatDuration(this.elapsed()),
      start: this.startTimestamp ? formatDateParts(new Date(this.startTimestamp)) : null,
      finish: this.finishTimestamp ? formatDateParts(new Date(this.finishTimestamp)) : null,
    };
  }

  emit() {
    this.onTick?.(this.snapshot());
  }

  startInterval() {
    this.clearInterval();
    this.emit();
    this.intervalId = window.setInterval(() => this.emit(), 250);
  }

  clearInterval() {
    if (this.intervalId) window.clearInterval(this.intervalId);
    this.intervalId = null;
  }
}
