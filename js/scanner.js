export class ScannerController {
  constructor({ modal, readerElementId, messageElement, onScan }) {
    this.modal = modal;
    this.readerElementId = readerElementId;
    this.messageElement = messageElement;
    this.onScan = onScan;
    this.scanner = null;
    this.usbBuffer = "";
    this.lastKeyTime = 0;
    this.handleKeyboardInput = this.handleKeyboardInput.bind(this);
    document.addEventListener("keydown", this.handleKeyboardInput, true);
  }

  async open() {
    this.modal.hidden = false;
    document.body.style.overflow = "hidden";
    this.messageElement.textContent = "Starting camera…";
    if (!window.Html5Qrcode) {
      this.messageElement.textContent = "Scanner library could not be loaded. Check the internet connection.";
      return;
    }

    this.scanner = new window.Html5Qrcode(this.readerElementId);
    try {
      await this.scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 180 } },
        (decodedText) => this.complete(decodedText),
        () => {},
      );
      this.messageElement.textContent = "Point the camera at the QR code or barcode.";
    } catch (error) {
      console.error(error);
      this.messageElement.textContent = "Camera unavailable. Allow camera permission or use a USB scanner.";
    }
  }

  async close() {
    if (this.scanner) {
      try {
        if (this.scanner.isScanning) await this.scanner.stop();
        this.scanner.clear();
      } catch (error) {
        console.warn("Scanner cleanup failed", error);
      }
    }
    this.scanner = null;
    this.modal.hidden = true;
    document.body.style.overflow = "";
  }

  async complete(value) {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) return;
    await this.close();
    this.onScan(cleanValue, "camera");
  }

  handleKeyboardInput(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const now = performance.now();
    if (now - this.lastKeyTime > 80) this.usbBuffer = "";
    this.lastKeyTime = now;

    if (event.key === "Enter") {
      const value = this.usbBuffer.trim();
      this.usbBuffer = "";
      if (value.length >= 3) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.onScan(value, "usb");
      }
      return;
    }
    if (event.key.length === 1) this.usbBuffer += event.key;
  }
}
