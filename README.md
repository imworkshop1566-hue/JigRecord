# Jig Repair / Inspection

เว็บแอปแบบ Static สำหรับบันทึกงานซ่อมและตรวจสอบ Jig ออกแบบให้เปิดบน GitHub Pages และส่งข้อมูลจาก Browser ไปยัง Power Automate โดยตรง ไม่มี Backend, Node.js server หรือฐานข้อมูล

## Project Structure

```text
Jigweb/
├── index.html          # หน้าเว็บและโครงสร้างฟอร์ม
├── css/
│   └── style.css       # Responsive UI, dark/light theme
├── js/
│   ├── app.js          # Workflow, validation และ UI state
│   ├── config.js       # Power Automate URL configuration
│   ├── api.js          # Power Automate POST, timeout และ retry
│   ├── scanner.js      # Camera + USB HID scanner
│   ├── storage.js      # Pending/active record ใน localStorage
│   ├── timer.js        # Timestamp-based timer
│   └── utils.js        # Crypto ID, date และ duration helpers
├── .nojekyll           # ให้ GitHub Pages เสิร์ฟไฟล์ตรงตามโครงสร้าง
└── README.md
```

## How to Run

เปิด `index.html` ได้โดยตรงสำหรับการดู UI และใช้ฟังก์ชันทั่วไป แต่การใช้กล้องต้องเปิดเว็บผ่าน HTTPS หรือ `localhost` ตามข้อกำหนดของ Browser

สำหรับทดสอบในเครื่อง สามารถใช้ static file server ใดก็ได้ เช่น VS Code Live Server แล้วเปิด URL ที่ server แสดง ไม่ต้องมี Backend ของแอป

Workflow:

1. กด **SCAN**, ใช้ USB Scanner หรือกรอก Jig no. แล้วกด **ENTER** เพื่อบันทึก Start day/Start time และเริ่ม Timer อัตโนมัติ
2. ทำงาน กรอกข้อมูล และถ่าย/เลือกรูปได้ 0–3 รูป (ไม่บังคับแนบ)
3. สามารถกด **STOP** เพื่อหยุด Duration ก่อนส่ง หรือปล่อยให้ Timer นับต่อได้
4. กด **SEND DATA** เพื่อบันทึก Finish day/Finish time ณ เวลาที่กด และหยุด Timer อัตโนมัติหากยังนับอยู่
5. เมื่อสำเร็จ ฟอร์มจะล้างและสร้าง RID ใหม่โดยอัตโนมัติ

ค่า PIC จะถูกจำไว้ใน Browser และไม่ถูก Reset หลังส่งข้อมูลสำเร็จ เพื่อให้ผู้ปฏิบัติงานคนเดิมบันทึกรายการถัดไปได้ต่อเนื่อง

RID ใช้รูปแบบ `RID-XX123456789012345` โดยตัวอักษร `XX` สุ่มด้วย Web Crypto API (`crypto.getRandomValues`) เพียงครั้งแรกต่อ Browser แล้วเก็บใน `localStorage` key `jigRidPrefix` ตัวเลข 15 หลักด้านหลังสร้างจากเวลา millisecond คูณ 100 และเพิ่มลำดับย่อยเมื่อสร้างหลายรายการในช่วงเวลาเดียวกัน ค่าเวลาล่าสุดถูกเก็บใน `jigLastRidTimeValue` เพื่อให้ ID ใหม่เรียงเพิ่มขึ้นแม้นาฬิกาเครื่องถูกปรับย้อนหลัง

## How to Configure Power Automate

เปิด `js/config.js` แล้วแทนค่า Placeholder ด้วย HTTPS POST URL จาก Power Automate:

```javascript
export const POWER_AUTOMATE_URL = "YOUR_SEND_DATA_URL";
export const PIC_LIST_URL = "YOUR_PIC_LIST_URL";
export const CAUSE_LIST_URL = "YOUR_CAUSE_LIST_URL";
```

เมื่อใส่ URL และ Deploy แล้ว ผู้ใช้เปิดเว็บและใช้งานได้ทันทีโดยไม่ต้องตั้งค่าบนอุปกรณ์

- `POWER_AUTOMATE_URL` ใช้ส่ง Jig Record
- `PIC_LIST_URL` ใช้ HTTP POST เพื่อโหลดรายการ PIC ตอนเปิดเว็บ
- `CAUSE_LIST_URL` ใช้ HTTP POST เพื่อโหลดรายการ Cause ตอนเปิดเว็บ

PIC Flow ต้อง Response เป็น JSON array ตัวอย่าง:

```json
[
  { "ItemInternalId": "...", "PIC": "Fam" },
  { "ItemInternalId": "...", "PIC": " Poom " }
]
```

เว็บจะใช้เฉพาะค่า `PIC`, ตัดช่องว่างหน้า/หลัง, ลบชื่อซ้ำ และ Cache รายการล่าสุดใน `localStorage` เพื่อใช้งานขณะ Offline

Cause Flow ใช้รูปแบบเดียวกัน โดย Response เป็น JSON array ที่มี field `Cause`:

```json
[
  { "ItemInternalId": "...", "Cause": "Air cylinder" },
  { "ItemInternalId": "...", "Cause": " Wiring " }
]
```

เว็บจะใช้เฉพาะค่า `Cause`, ตัดช่องว่าง, ลบค่าซ้ำ และ Cache รายการล่าสุดสำหรับ Offline เช่นเดียวกับ PIC

### สร้าง Power Automate HTTP Trigger

1. สร้าง **Instant cloud flow** หรือ **Automated cloud flow**
2. เลือก Trigger **When an HTTP request is received**
3. ใส่ JSON Schema ด้านล่าง
4. เพิ่ม **Apply to each** โดยเลือก Body จาก HTTP Trigger
5. ภายใน loop เพิ่ม **Create item** สำหรับ Microsoft Lists
6. Map ชื่อ field จาก request ให้ตรงกับ column ใน Microsoft Lists
7. เพิ่ม action **Response** หลังการบันทึก โดยใช้ status `200`, header `Content-Type: application/json` และ body ตัวอย่าง:

```json
{
  "success": true,
  "id": "@{items('Apply_to_each')?['ID']}"
}
```

8. Save flow แล้วคัดลอก HTTP POST URL ไปใส่ใน `js/config.js`

> Power Automate และนโยบาย tenant อาจต้องตั้งค่า CORS/การเข้าถึงให้ Browser จากโดเมน GitHub Pages เรียก endpoint ได้ หาก Browser รายงาน CORS error ให้ตรวจ HTTP Trigger, tenant policy และ response headers กับผู้ดูแล Microsoft 365

### JSON Schema

```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "ID": { "type": "string" },
      "Start day": { "type": "string" },
      "Start time": { "type": "string" },
      "Finish day": { "type": "string" },
      "Finish time": { "type": "string" },
      "Jig no.": { "type": "string" },
      "Jig type": { "type": "string" },
      "Cause": { "type": "string" },
      "Detail": { "type": "string" },
      "Action": { "type": "string" },
      "Image": { "type": "string" },
      "Duration": { "type": "integer" },
      "PIC": { "type": "string" }
    },
    "required": [
      "ID", "Start day", "Start time", "Finish day", "Finish time",
      "Jig no.", "Jig type", "Cause", "Detail", "Action", "Image",
      "Duration", "PIC"
    ]
  }
}
```

Payload ที่เว็บส่งเป็น Array และใช้ชื่อ field ตรงตาม schema:

```json
[
  {
    "ID": "RID-VS631780990814276",
    "Start day": "2026-09-01",
    "Start time": "16:30:00",
    "Finish day": "2026-09-01",
    "Finish time": "16:42:00",
    "Jig no.": "JIG-001",
    "Jig type": "Repair",
    "Cause": "Connector",
    "Detail": "Pin damaged",
    "Action": "Replace connector",
    "Image": "[{\"name\":\"RID-VS631780990814276-01.jpg\",\"type\":\"image/jpeg\",\"content\":\"/9j/4AAQ...\"}]",
    "Duration": 720,
    "PIC": "Atibass"
  }
]
```

## Scanner

- **Camera:** กด SCAN แล้วอนุญาตสิทธิ์ Camera ระบบใช้ `html5-qrcode` จาก CDN และเลือกกล้องหลังเมื่ออุปกรณ์รองรับ
- **USB QR/Barcode Scanner:** รองรับอุปกรณ์แบบ Keyboard HID ที่ส่งค่าต่อเนื่องและปิดท้ายด้วย Enter
- **Manual:** พิมพ์ Jig no. ลงในช่องได้โดยตรง

Camera ต้องใช้ HTTPS (GitHub Pages รองรับ) และต้องเชื่อมต่ออินเทอร์เน็ตเพื่อโหลด scanner library จาก CDN หากต้องการใช้งานในเครือข่ายปิด ให้นำไฟล์ library มาเก็บในโปรเจกต์และเปลี่ยน `<script src>` ใน `index.html` เป็น local path

## Timer และ Refresh Protection

Timer คำนวณ Duration ด้วย timestamp จึงไม่สะสม drift จากการเพิ่มค่าทีละวินาที Start day/Start time มาจากเวลาที่ยืนยัน Jig no. ส่วน Finish day/Finish time มาจากเวลาที่กด SEND DATA ช่องวันเวลาเหล่านี้ไม่แสดงใน UI แต่ยังส่งใน JSON ตาม schema เดิม

ระบบบันทึก Draft ทุกช่อง รวมถึง Dropdown และรูปภาพ ลง `localStorage` อัตโนมัติแม้ยังไม่เริ่ม Timer เมื่อ Refresh หรือเปิดเว็บใหม่ ระบบจะกู้ Draft โดยอัตโนมัติ หาก Timer อยู่สถานะ RUNNING จะใช้ start timestamp เดิมและนับเวลาต่อทันที หากส่งข้อมูลสำเร็จ Draft จะถูกล้างและสร้าง RID ใหม่

## Pending Data และ Retry

- การส่งแต่ละครั้งมี timeout 15 วินาที
- ระบบ retry อัตโนมัติสูงสุด 3 ครั้ง ห่างกัน 1.5 วินาที
- ถ้ายังไม่สำเร็จ หรืออุปกรณ์ Offline ข้อมูลจะถูกเก็บใน `localStorage` key `pendingJigData`
- ID เป็น unique key; record ที่มี ID เดิมจะไม่ถูกเพิ่มซ้ำ
- กด **RETRY** ทีละรายการ หรือ **RETRY ALL** เมื่อกลับมา Online
- เมื่อส่งสำเร็จ record จะถูกลบออกจาก Pending Data

`localStorage` ผูกกับ Browser, อุปกรณ์ และ origin เดียวกัน การล้าง site data, private browsing หรือเปลี่ยนอุปกรณ์ทำให้ pending data ไม่ตามไปด้วย

## Images และ Power Automate

- รูปเป็นข้อมูล Optional รองรับการถ่ายหรือเลือกสูงสุด 3 รูปต่อ Record หากไม่แนบจะส่ง `"Image": ""`
- Browser ย่อด้านยาวไม่เกิน 1280px และบีบอัดแต่ละรูปเป็น JPEG ประมาณไม่เกิน 450 KB
- JSON field ยังคงชื่อ `Image` และชนิด string ตาม schema เดิม ภายใน string เป็น JSON array ของ `{ name, type, content }`
- `content` เป็น Base64 ที่ไม่มี Data URL prefix
- รูปถูกเก็บชั่วคราวร่วมกับ Active/Pending Record ใน `localStorage` จนกว่าจะส่งสำเร็จ

ตัวอย่างค่า `Image` หลังนำ string ไป Parse:

```json
[
  {
    "name": "RID-VS631780990814276-01.jpg",
    "type": "image/jpeg",
    "content": "/9j/4AAQ..."
  }
]
```

ใน Power Automate ให้ใช้ Parse JSON กับค่า `Image` จาก Record แล้ว Apply to each รูป จากนั้นใช้ SharePoint หรือ OneDrive action **Create file** โดยตั้ง File Name จาก `name` และ File Content ด้วย expression `base64ToBinary(item()?['content'])` หลังสร้างไฟล์จึงนำ Path/URL ที่ได้ไปบันทึกใน Microsoft Lists

ข้อจำกัด: Base64 ใช้พื้นที่มากกว่าไฟล์จริงและ `localStorage` มี quota จำกัด หากมี Pending Record พร้อมรูปหลายรายการจำนวนมาก Browser อาจพื้นที่ไม่พอ ควร Retry ส่งรายการค้างให้เร็วที่สุด

## How to Deploy to GitHub Pages

1. Push ไฟล์ทั้งหมดขึ้น GitHub repository โดยให้ `index.html` อยู่ที่ root
2. เปิด repository → **Settings** → **Pages**
3. ที่ **Build and deployment** เลือก **Deploy from a branch**
4. เลือก branch เช่น `main` และ folder `/(root)`
5. กด **Save** และรอ GitHub แสดง URL
6. เปิด URL ผ่าน HTTPS แล้วทดสอบ Camera permission และ Power Automate POST

ไม่ต้องใช้ build command, npm, Node.js, Express, PHP หรือ Python server ใน production

## Security Considerations

- เว็บไม่มี password หรือ API key อื่นใน Source Code
- Power Automate URL ใน `js/config.js` สามารถถูกผู้ใช้เว็บไซต์ดูได้ จึงไม่ถือเป็น Secret
- หาก URL เคยถูกเผยแพร่โดยไม่ตั้งใจ ต้องยกเลิก/สร้าง URL ใหม่ก่อนใช้งานจริง
- จำกัดผู้ที่เข้าถึงหน้าเว็บตามนโยบายองค์กร และใช้ Power Automate trigger ที่รองรับการยืนยันตัวตนหาก tenant มีให้ใช้งาน
- ใน Flow ควร validate โครงสร้างข้อมูล, ความยาว field, รูปแบบ RID และค่า ID ซ้ำก่อนสร้าง Microsoft Lists item
- ตั้ง ID column ใน Microsoft Lists ให้ unique หรือเพิ่มขั้นตอนค้นหา ID ก่อน Create item เพื่อป้องกัน duplicate ที่ฝั่งปลายทางด้วย
- ใช้ rate limiting/monitoring ของ Microsoft 365 และ rotate HTTP Trigger URL หากสงสัยว่ารั่วไหล
- อย่าส่งข้อมูลลับหรือข้อมูลส่วนบุคคลเกินความจำเป็นผ่าน endpoint สาธารณะ

## Known Limitations

- ต้องมี HTTPS และสิทธิ์ Camera สำหรับการสแกนด้วยกล้อง
- Scanner library โหลดจาก CDN จึงต้องมีอินเทอร์เน็ตในการเปิดครั้งแรก
- USB scanner ต้องทำงานแบบ Keyboard HID และควรตั้ง suffix เป็น Enter
- Browser อาจบล็อก Power Automate request หาก tenant/endpoint ไม่อนุญาต CORS
- Pending data และ active record อยู่เฉพาะ Browser เครื่องนั้น
- จำกัด 3 รูปต่อ Record และขึ้นอยู่กับพื้นที่ `localStorage` ของ Browser
- Static frontend ไม่สามารถซ่อน Power Automate endpoint ได้อย่างสมบูรณ์
