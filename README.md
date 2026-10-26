# OLD SCHOOL Coffee POS

ระบบ POS ภาษาไทยสำหรับลูกค้า พนักงาน และผู้ดูแลร้าน ใช้ React 19, TypeScript, Vinext, Cloudflare Workers, D1 และ R2

## เริ่มใช้งาน

- `/` หน้าร้าน • `/?table=3` รับหมายเลขโต๊ะจาก QR
- `/cart` ตะกร้าและยืนยันสั่งทันที (`/checkout` เดิมเปิดตะกร้าเดียวกัน)
- `/admin` หน้าทำงานเดียว: รับออเดอร์เป็นแท็บเริ่มต้น พร้อมเมนูสินค้า ยอดขาย โต๊ะ รายงาน บัญชี และตั้งค่าร้าน
- `/staff` ลิงก์เดิม เปิดหน้าทำงานเดียวกัน (พนักงานเห็นเฉพาะรับออเดอร์และประวัติ)
- `/login` เข้าสู่ระบบ • `/install` วิธีเพิ่มเว็บลงหน้าจอโฮม
- การติดตามออเดอร์อยู่ในปุ่ม “ออเดอร์ของฉัน” เก็บสิทธิ์ใน HttpOnly guest cookie ของอุปกรณ์นั้น

## บัญชีผู้ดูแลครั้งแรก

ไม่มีบัญชีหรือรหัสผ่านเริ่มต้นที่ฝังในโค้ด
1. ตั้งค่า `POS_SETUP_KEY` เป็นค่าสุ่มฝั่ง Server
2. เปิด `/login` แล้วกด “ตั้งค่าร้านครั้งแรก”
3. ใส่ Setup key และตั้งรหัสผ่านอย่างน้อย 10 ตัวอักษรด้วยตัวเอง
4. เข้าสู่ระบบด้วยชื่อ `owner` แล้วสร้างบัญชีพนักงานใน Admin

Setup ใช้ได้เมื่อยังไม่มีผู้ใช้เท่านั้น หลังตั้งค่าแล้วลบ `POS_SETUP_KEY` ออกจาก environment ได้ ข้อมูลตั้งค่าของ checkout นี้อยู่ใน `.local-access.md` ซึ่งไม่ถูกส่งขึ้น repository

## พัฒนาในเครื่อง

ต้องใช้ Node.js >=22.13 และ npm

```sh
npm ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_round_rick_jones.sql
npm run dev
```

ใช้ migration ครั้งเดียวต่อฐานข้อมูลใหม่ ไฟล์ `.dev.vars` เก็บ secrets สำหรับ local เท่านั้น `npm start -- --port 5173` เปิด build จริงเพื่อ QA โดยใช้ฐานข้อมูล local เดียวกัน

```sh
npx tsc --noEmit
node tests/integration.mjs
node tests/catalog-options.mjs
```

Integration test เขียนออเดอร์และบัญชีทดสอบในฐานข้อมูล local จึงไม่ควรใช้ URL production; มันตรวจราคาฝั่ง Server, concurrent idempotency, guest isolation, role enforcement, invalid options, optimistic concurrency, payment และการปิดบัญชี ใช้ `.test-password` ที่ถูก ignore เพื่อทดสอบฐานข้อมูลเดิมซ้ำ

## โครงสร้าง

- `lib/catalog.ts`: เมนูจริง 42 รายการ ราคา รูปแบบ และข้อมูลเริ่มต้น
- `lib/server.ts`: ฐานข้อมูล guest/session auth, PBKDF2 และการตรวจราคาตะกร้า
- `lib/push.ts`: มาตรฐาน Web Push พร้อม payload เข้ารหัส RFC 8291, VAPID และ durable outbox ผูกอุปกรณ์กับออเดอร์
- `lib/client.ts`: API client และรูปแบบข้อมูลแสดงผล
- `components/pos/`: หน้าร้าน กล่องเลือกสินค้า และ QR โต๊ะ
- `app/page.tsx`: state และหน้าจอการทำงานของแต่ละบทบาท
- `app/api/pos/route.ts`: API ที่ตรวจสิทธิ์และ business rules
- `app/api/upload/`: รูปที่ผู้ดูแลอัปโหลดเท่านั้น, JPG/PNG/WebP สูงสุด 5MB
- `db/schema.ts`, `drizzle/`: schema และ migration
- `public/sw.js`, `public/manifest.webmanifest`: PWA และ Push

D1 แยก orders, users, sessions, audit และ subscriptions ส่วน catalog/settings เป็น config aggregate สำหรับร้านขนาดเล็ก ไม่ใช้ localStorage เก็บออเดอร์กลาง; localStorage เก็บเพียงตะกร้าและ idempotency key

## การสั่งจาก QR

- QR โต๊ะ: `/?table=3` ผูกโต๊ะ 3 โดยอัตโนมัติ
- QR รับกลับบ้าน: `/?type=takeaway` ไม่ผูกหมายเลขโต๊ะ ดาวน์โหลดได้จาก Admin > โต๊ะ / QR
- ลูกค้ายืนยันสั่งจากตะกร้าได้เลย ไม่มีหน้าเลือกรูปแบบรับสินค้า โต๊ะ หรือช่องทางชำระเงิน
- เก็บบริบท QR ใน sessionStorage ของแท็บเพื่อให้รีเฟรชแล้วโต๊ะไม่หาย QR ใหม่มีสิทธิ์แทนบริบทเดิมเสมอ
- ลิงก์ที่ไม่มี QR หรือบริบทเดิมดูเมนูได้ แต่ต้องสแกน QR ก่อนส่งออเดอร์
- พนักงานเลือกเงินสดหรือ QR ตอนยืนยันรับชำระที่เคาน์เตอร์

## สินค้าหมดและราคาเบเกอรี่

- หน้าทำงาน > เมนูสินค้า มีช่องติ๊ก “สินค้าหมดชั่วคราว” ในแต่ละแถว และในฟอร์มแก้ไข
- สินค้าหมดยังอยู่บนหน้าลูกค้า มีสีเทาทับรูปและป้าย กดไม่ได้ ต่างจาก “ซ่อนจากหน้าร้าน”
- หน้าลูกค้าอัปเดต catalog ทุก 10 วินาที Server ปฏิเสธสินค้าหมดแม้อยู่ในตะกร้ามาก่อน
- เลือกหมวดเบเกอรี่จะใช้ “ราคาปกติ” เป็นค่าเริ่มต้น หรือเลือกรูปแบบราคาด้วยตัวเองสำหรับสินค้าอื่น
- การเปิดแก้ไขเบเกอรี่เดิมที่ใช้ราคาเย็น จะนำราคานั้นมาแสดงในช่องราคาปกติ รอเจ้าของกดบันทึก โดยไม่แก้ข้อมูลเดิมอัตโนมัติ
- เบเกอรี่ไม่บังคับร้อน/เย็น/ปั่นหรือความหวาน และบันทึกหน่วยเป็นชิ้นเพื่อไม่นับเป็นแก้วในรายงาน

## กฎสำคัญ

- ราคาร้อน/เย็น/ปั่นแยกกัน มอคค่าร้อน 55 บาท เย็น 60 บาท ไม่มีท็อปปิ้ง
- แต่ละเมนูเปิด/ปิดความหวาน กำหนดเปอร์เซ็นต์ ราคา และรูปแบบได้
- Server ใช้ราคาปัจจุบันจาก catalog แล้วบันทึก snapshot ลงออเดอร์
- Unique idempotency key ป้องกันออเดอร์ซ้ำ พร้อม compare-and-swap version ป้องกันสถานะซ้ำ
- พร้อมรับ -> เสร็จสิ้น ต้องรับชำระแล้ว
- การยืนยันเงินสด/QR เป็นการตรวจโดยพนักงาน ไม่มีตรวจสลิปหรือเชื่อมบัญชีธนาคารอัตโนมัติ
- ลูกค้าเข้าถึงเฉพาะออเดอร์ที่ owner cookie ตรงกัน ไม่ใช้หมายเลขออเดอร์เป็นสิทธิ์เข้าถึง
- PBKDF2-SHA256 รหัสผ่าน, HttpOnly cookies, same-origin mutation checks, login attempt limit และ server-side roles
- รายงานกรองวันที่ตาม Asia/Bangkok; API ส่งประวัติล่าสุดสูงสุด 500 ออเดอร์ (ต้องเพิ่ม pagination สำหรับข้อมูลเกินนี้)

## Web Push และ PWA

ใช้มาตรฐาน Web Push บน Cloudflare Workers ผ่าน WebCrypto ไม่ต้องมีบัญชี Firebase หรือ Apple Developer เพิ่ม และไม่มี Service Account ใน frontend

- `VAPID_PUBLIC_KEY`: P-256 uncompressed public key (base64url 65 bytes)
- `VAPID_PRIVATE_KEY`: private JWK `d` (base64url 32 bytes), ต้องเป็น secret ฝั่ง Server เท่านั้น
- `VAPID_SUBJECT`: HTTPS URL ของร้าน หรือ `mailto:` ที่ติดต่อได้
- ทั้งสามค่ามีอยู่ในโฮสต์แล้ว API `push-key` ตรวจลายเซ็นคู่คีย์จริงก่อนรายงาน configured=true และส่งเฉพาะ public key
- ห้ามเปลี่ยน key pair โดยไม่จำเป็น เพราะ subscription เดิมจะใช้คีย์เก่า หากเปลี่ยน ลูกค้าต้องเปิดรับแจ้งเตือนใหม่

Manifest ตั้งชื่อ Old School Coffee และใช้ไอคอน 192/512 พร้อม apple-touch-icon ส่วน Service Worker เก็บเฉพาะหน้าบอกออฟไลน์กับไอคอน ไม่ cache API, HTML ลูกค้า หรือหน้าแอดมิน และไม่ส่งออเดอร์ออฟไลน์

ลูกค้ากดเปิดรับแจ้งเตือนในหน้าติดตาม จึงขอ Notification permission, สร้าง browser subscription และบันทึกคู่กับ tracking token ของออเดอร์ Server ยืนยันลงทะเบียนก่อน UI แสดงสำเร็จ การอนุญาตอย่างเดียวไม่ถือว่าลงทะเบียนสำเร็จ iPhone/iPad ต้องติดตั้งจากเมนูแชร์ลงหน้าจอโฮมและเปิดจากไอคอนก่อน (iOS/iPadOS 16.4+) หากเปิดใน LINE/Messenger จะแนะนำเปิด Safari/Chrome และยังติดตามผ่านเว็บได้

Manifest แบบมี QR context ที่ `/api/manifest?table=N` หรือ `?type=takeaway` คงเลขโต๊ะ/กลับบ้านใน start_url ขณะติดตั้ง และใช้ id เดียวกันเสมอ หาก Safari กับ Home Screen แยก cookie ลูกค้าคัดลอกลิงก์ติดตามไว้ แล้วเปิดแอป → ออเดอร์ของฉัน → วางลิงก์ส่วนตัว เพื่อเปิดออเดอร์เดิมและลงทะเบียน Push โดยไม่ต้องสั่งซ้ำ

### ส่งและตรวจผล

เมื่อสถานะเปลี่ยนเป็น ready: update version และ insert `push_events` อยู่ใน D1 batch เดียวกัน ตัวส่ง claim งานเพียงครั้งเดียวและ claim `push_deliveries` แบบ unique ต่อออเดอร์/อุปกรณ์สำหรับการส่งอัตโนมัติ การลงทะเบียนหลังพร้อมรับส่งได้ครั้งเดียวเช่นกัน Manual call สร้าง event ใหม่โดยเว้น 30 วินาทีแบบ atomic

ส่ง payload AES-128-GCM พร้อมหมายเลขออเดอร์และลิงก์ติดตามใน URL fragment ให้ SW แสดงได้โดยไม่ fetch cookie ระหว่าง background แตะแจ้งเตือนแล้วเปิดออเดอร์เฉพาะรายการ ไม่แทนที่แท็บ staff/admin ลิงก์ที่คัดลอกเป็น bearer capability: **เก็บเป็นส่วนตัว ผู้มีลิงก์สามารถดูออเดอร์นั้นได้** ตัวเลขออเดอร์อย่างเดียวใช้เข้าถึงไม่ได้

Subscription เก่าที่ไม่มีการผูกออเดอร์ต้องกดลงทะเบียนใหม่ Web Push endpoint จำกัดเฉพาะผู้ให้บริการที่รองรับ, ไม่ตาม redirect, ตรวจ ECDH/auth keys และลบ 404/410 หรือ expirationTime หมดอายุ ตาราง logs ไม่บันทึก endpoint/keys/token ในข้อความ รายการสำเร็จแสดง `accepted` หมายถึง push service รับคำขอ ไม่ใช่หลักฐานว่ามือถือแสดง/อ่านแล้ว พนักงานเปิด “ผลการแจ้งเตือน” ใต้การ์ดออเดอร์ได้

งาน queued ถูกดำเนินการใน request ที่เปลี่ยนสถานะและมี request-driven `waitUntil` สำหรับเก็บงานค้างเมื่อมีการเรียก API ครั้งถัดไป ไม่มี cron retry; กรณีส่งแล้ว timeout อาจทราบผลไม่ได้ จึงไม่ retry อัตโนมัติเพื่อลดการแจ้งซ้ำ พนักงานตรวจ log และเรียกซ้ำเองได้ งานที่ค้าง `sending` หลัง Worker ถูกตัดไม่ส่งซ้ำเองโดยไม่มีหลักฐาน การทำความสะอาดตามคำขอ API วันละครั้งเก็บ log 30 วันและล้าง binding ของออเดอร์จบ/เกิน 30 วัน รวม subscription ที่ไม่มี binding

### ไฟล์ระบบ PWA/Push

- `public/manifest.webmanifest`, `app/api/manifest/route.ts`, `app/layout.tsx`: ชื่อแอป, scope, start URL จาก QR, ไอคอนและ Apple metadata (ใช้ไอคอนร้านเดิม 192/512)
- `public/sw.js`, `public/offline.html`: notification display/click, event dedupe และหน้าบอกออฟไลน์
- `components/pos/PushPanel.tsx`, `PwaInstallGuide.tsx`, `PushLog.tsx`, `app/page.tsx`: ลงทะเบียนเมื่อกด ตรวจ support/permission คำแนะนำติดตั้ง นำเข้าลิงก์ และผลส่งฝั่งพนักงาน
- `lib/webpush.ts`: payload encryption, VAPID signing, endpoint/key validation
- `lib/push.ts`, `lib/push-engine.ts`, `worker/index.ts`: ผูกอุปกรณ์กับออเดอร์ durable event/delivery claims และ background processing
- `app/api/pos/route.ts`, `lib/server.ts`: สิทธิ์ติดตาม token, API subscribe/registration/logs และ atomic status update + outbox
- `db/schema.ts`, `drizzle/0001_icy_silver_centurion.sql`, `drizzle/meta/0001_snapshot.json`, `drizzle/meta/_journal.json`: เพิ่มตาราง push_events, push_deliveries, push_order_devices โดยไม่เปลี่ยน/ลบออเดอร์เดิม
- `app/globals.css`: รูปแบบปุ่ม/ข้อความ คิว ลิงก์ติดตามและ log
- `tests/webpush.mjs`, `tests/push-system.mjs`, `tests/service-worker.mjs`, `tests/pwa-routes.mjs`: crypto, API/SQLite/transport จำลอง, SW events, route/config checks

สำหรับ preview ใช้ `npm start -- --port 5173 --env-file /absolute/path/to/.dev.vars` เพื่อให้ Wrangler โหลดค่าจากไฟล์ local โดยไม่คัดลอก secret เข้า dist หรือซอร์ส

### ทดสอบอุปกรณ์จริง (ยังต้องทำโดยเจ้าของร้าน)

1. iPhone/iPad: เปิด Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม → เปิดจากไอคอน ก่อนสั่ง; Android ใช้ Chrome และอนุญาตแจ้งเตือน
2. สแกน QR โต๊ะจริง สั่งเมนู จดเลขคิว แล้วกดเปิดรับการแจ้งเตือน (ต้องเห็นยืนยันลงทะเบียนออเดอร์ ไม่ใช่แค่อนุญาต)
3. ปิดหน้า/สลับออกจากแอปและล็อกจอ ใช้อีกเครื่องเปิด staff เริ่มทำ → พร้อมรับ
4. ตรวจ notification ชื่อ ☕ Old School Coffee และเลขคิวตรงกัน จากนั้นแตะเพื่อเปิดเฉพาะออเดอร์นั้น
5. ตรวจผลการแจ้งเตือนจาก staff ไม่ควรมี automatic accepted ซ้ำอุปกรณ์เดิม กดเรียกเองหนึ่งครั้งแล้วตรวจว่าเรียกซ้ำภายใน 30 วินาทีถูกป้องกัน
6. ทดลองอีกลูกค้าคนละอุปกรณ์และเลขโต๊ะ ต้องไม่รับคิวของกันและกัน ปฏิเสธ permission แล้วยังสั่ง/ติดตามเว็บได้
7. ตรวจ Settings > Notifications, Focus/Do Not Disturb, อินเทอร์เน็ต และข้อจำกัดแบตเตอรี่ หากไม่เห็นแจ้งเตือน

การทดสอบอัตโนมัติใช้ปลายทาง Push จำลองเท่านั้น ไม่ได้ยืนยันการรับจริงบน Android/iPhone; browser QA ไม่เทียบเท่า physical-device test

ทดสอบ: `node --experimental-strip-types tests/webpush.mjs`, `node --experimental-strip-types tests/push-system.mjs`, `node tests/service-worker.mjs` และชุด integration เดิมเมื่อเปิด localhost (apply migrations ใหม่ก่อน)

## ก่อนใช้หน้าร้านจริง

1. สร้าง owner และบัญชีพนักงานด้วยรหัสผ่านของร้าน
2. ตรวจเมนู/ความหวานและราคาอีกครั้ง เมนูแนะนำเป็นชุดเสนอเริ่มต้น
3. เปลี่ยนภาพประกอบเป็นภาพสินค้า/หน้าร้านจริง และตั้งเวลาเปิด–ปิด (เริ่มต้น 08:00–18:00)
4. ตั้งจำนวนโต๊ะจริง (เริ่มต้น 12) อัปโหลด QR ธนาคาร และทดสอบชำระกับพนักงาน
5. เปิดสิทธิ์เว็บไซต์สาธารณะจึงใช้กับลูกค้าที่ไม่สมัครสมาชิกได้ เว็บปัจจุบันเปิดให้ลูกค้าเข้าถึงแบบสาธารณะแล้ว ส่วนหน้าทำงานร้านยังต้องเข้าสู่ระบบ
6. ทดสอบ Push บนเครื่องจริงและพิมพ์ QR จากโดเมนที่ใช้งานจริง

ไม่มีการเชื่อมบริการเรียกเก็บเงินรายเดือนเพิ่มเอง แต่โฮสต์/ฐานข้อมูล/พื้นที่เก็บรูปอาจมีค่าใช้จ่ายตามโควตาและเงื่อนไขผู้ให้บริการ

## ภาพประกอบ

โลโก้จากไฟล์ที่เจ้าของร้านส่ง รูปกาแฟ/เครื่องดื่มประกอบจาก Unsplash (ดาวน์โหลดเป็น assets) ไม่ใช่ภาพสินค้าจริงของร้าน รูปเริ่มต้นเป็นภาพประกอบ เจ้าของร้านเปลี่ยนเป็นรูปสินค้าจริงได้

### ออเดอร์หน้าร้านและการแก้ไข
- หน้าทำงานร้าน → เพิ่มออเดอร์หน้าร้าน รับรายการสั่งปากเปล่า เลือกโต๊ะหรือกลับบ้าน และบันทึกเข้าคิวเดียวกับ QR
- ออเดอร์ที่ยังไม่ชำระแก้จำนวน รายการ ตัวเลือก หมายเหตุ และโต๊ะได้ เจ้าของร้านปรับยอดเพิ่ม/ลดได้พร้อมเหตุผล
- รายการเดิมเก็บราคา ณ เวลาสั่ง ตัวเลือกหรือรายการใหม่ตรวจราคาจาก Server; การบันทึกใช้ version ป้องกันเขียนทับกัน
- ออเดอร์ชำระแล้วแก้ได้เฉพาะ Admin ผ่าน “แก้ยอด / บันทึกคืนเงิน” ต้องระบุวิธีรับส่วนต่างหรือคืนเงินที่ทำไปแล้ว ระบบเป็นการบันทึก ไม่ได้โอนเงินจริง
- เก็บประวัติก่อน/หลัง ผู้แก้ไข เหตุผล และส่วนต่างในออเดอร์และแผ่นงาน Revisions ของ Excel ยอดขายเป็นยอดสุทธิใหม่ของออเดอร์เดิมตามวันที่สั่ง
- ทดสอบในเครื่อง: `node tests/counter-orders.mjs` (localhost เท่านั้น)

### ยอดขายและรายงาน (หน้าเดียว)
- เปิดด้วยวันที่ปัจจุบันในเขตเวลา Asia/Bangkok มีรายวัน รายเดือน ช่วงวันที่ และทั้งหมด
- แยกยอดรับชำระสุทธิ เงินสด/โอนหลังปรับยอด ยอดรอชำระ จำนวนแก้ว/ชิ้น และรายการออเดอร์พร้อมประวัติแก้ไข
- ใช้วันที่สร้างออเดอร์เป็นเกณฑ์ ยอดแก้ไขล่าสุดอยู่กับวันที่สั่งเดิม ไม่ใช่รายงานกระแสเงินสดตามวันที่คืนเงิน
- รายงานและ Excel ใช้ตัวกรองและการคำนวณร่วมกัน Excel มีแผ่น Summary, Orders, Revisions
- รายงานโหลดจาก Server แยกจากบอร์ดออเดอร์ 500 รายการ หากช่วงมีเกิน 10,000 รายการ จะแจ้งให้เลือกช่วงสั้นลงแทนการตัดยอดเงียบ ๆ
- ตรวจสอบ: `node --experimental-strip-types tests/reports.mjs` และ `node tests/export.mjs` ขณะเปิด localhost

### Worker transport regression

Cloudflare Workers รองรับ fetch redirect เฉพาะ `follow` / `manual`; ตัวส่ง Push ใช้ `manual` และจัด 3xx เป็น `push_redirect_blocked` โดยไม่ตาม Location ไปที่อื่น การทดสอบเพิ่มเติม `node tests/worker-webpush.mjs` ใช้ native workerd/Miniflare (มิใช่ Node fetch) ตรวจทั้งเข้ารหัส ส่งสำเร็จจำลอง และไม่ตาม redirect ไม่มีการส่ง notification ไปอุปกรณ์จริงในชุดนี้

### Table selection in an installed app
Safari and an installed iOS home-screen app can have separate storage. Customers now select their table or takeaway directly in the basket before submitting an order, with no repeat QR scan required. QR links still prefill the selection; customers can correct it in the basket. No extra checkout or customer payment screen was introduced; payment remains at the counter. The selection updates the page URL and install manifest and is remembered locally between sessions. Server-side table and order validation remains in effect.

### Shop notification workflow
The unified workspace uses one **เปิดแจ้งเตือนร้าน** action, with a compact status and collapsed details (test, installation help, disable). The same click unlocks the local Web Audio chime and requests notification permission if the device supports background Push. A successful subscription is shown only after the backend acknowledges registration. If only foreground sound works, the UI explicitly shows a partial state. For iPadOS 16.4+, install `/admin` through Safari as **Old School ร้าน**, sign in, and enable once. No new environment variables or Firebase account are needed.

When Push is registered, the order-poll chime is suppressed to avoid two sounds for one order; the system notification handles the alert both with the app open and locked. Foreground-only devices retain the poll chime, with an initial snapshot baseline and ID dedupe. On reload the browser may require a tap to unlock local audio, but a registered Push device continues without another audio gesture. Hardware volume, notification settings, Focus mode and connectivity still apply. Physical iPad reception/sound/click testing remains required.

Migration `0003` appends nullable `device_key` to staff registrations. New or authenticated recognized installations receive a separate durable notification grant and a one-year HttpOnly/SameSite cookie used only to revoke that installation. Grant delivery still checks the account is active and staff/admin; the 12-hour admin login continues protecting the workspace, but no longer ends an authorized device's Push grant. Logout (including after session expiry), account deactivation, explicit disable, and provider 404/410 stop deliveries. Logout revokes only the installation/session, not unrelated devices. Old registrations with no device grant retain session-expiry checks until an authenticated installation check upgrades them; schema migration alone does not broaden old grants.

Guest and counter order creation atomically enqueue `staff_new` events, with idempotent retries deduped. Each order's logs distinguish shop/customer alerts. No customer tracking token, prices or items are sent in staff payloads. Old (>10 min) or already-making orders are skipped. Transport acceptance is not proof of display; uncertain/failed transport isn't automatically retried. The staff PWA uses manifest ID/start URL `/admin`; notification clicks preserve customer windows and reuse staff windows. Customers now see their queue/status directly; the optional Push setup is collapsed and never required to order.

Validation: `tests/push-system.mjs` exercises the actual API handlers/engine against isolated SQLite with mocked Push transport, including durable grants across login expiry, new-session recognition, logout after expiry, other-device isolation, role revocation, legacy expiry, idempotency, and failed/expired endpoint cleanup. `tests/service-worker.mjs` verifies display/click routing and cross-origin rejection. To test physically: install staff icon, enable notifications once, lock iPad, place a new order from another device, verify sound and tap destination; verify repeat submission doesn't duplicate and logout stops later alerts. Production test orders should be placed intentionally by the owner.

### Daily sales and readable Excel exports
The report now includes a paginated daily summary with Bangkok order dates, paid sales, cash/transfer splits, pending totals, and paid cup/piece counts. Selecting a date drills into that day's existing report. Day/month/short ranges (up to 366 days) include zero-order days; All and longer ranges list recorded order dates. The report and export share `summarizeDailySales`, `reportOrders` and the existing paid/refund rules. Grouping remains by the order date, with its latest corrections, as indicated in the UI.

Exports use the selected date/month/range/all parameters and name the file accordingly. `DailySummary` opens first, followed by existing Orders/Revisions, normalized `RevisionItems`, and Summary. Audit snapshots use readable menu/option/quantity/price text instead of JSON. The normalized detail sheet keeps long revisions readable without relying on giant spreadsheet rows. `xlsx-js-style` provides wrapped cells, column widths, header colors and numeric formats; `xlsx` remains the independent workbook parser in regression tests. No migration or new environment variable is required. Old downloaded files are unchanged: download a fresh export after updating.
