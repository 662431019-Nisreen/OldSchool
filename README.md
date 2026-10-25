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
```

Integration test เขียนออเดอร์และบัญชีทดสอบในฐานข้อมูล local จึงไม่ควรใช้ URL production; มันตรวจราคาฝั่ง Server, concurrent idempotency, guest isolation, role enforcement, invalid options, optimistic concurrency, payment และการปิดบัญชี ใช้ `.test-password` ที่ถูก ignore เพื่อทดสอบฐานข้อมูลเดิมซ้ำ

## โครงสร้าง

- `lib/catalog.ts`: เมนูจริง 42 รายการ ราคา รูปแบบ และข้อมูลเริ่มต้น
- `lib/server.ts`: ฐานข้อมูล guest/session auth, PBKDF2 และการตรวจราคาตะกร้า
- `lib/push.ts`: VAPID signing และส่ง Web Push แบบไม่มี payload; Service Worker ดึงสถานะด้วยสิทธิ์ของเจ้าของอุปกรณ์
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

ตั้งค่า `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (JWK private `d`) และ `VAPID_SUBJECT` เป็น HTTPS URL หรือ mailto ของร้าน ห้ามใส่ private key ใน client/public

Push ต้องใช้ HTTPS และลูกค้าอนุญาต บน iPhone ต้องเพิ่มเว็บลงหน้าจอโฮมและเปิดจากไอคอนก่อน (iOS 16.4+) อุปกรณ์ที่ไม่รองรับยังติดตามผ่านเว็บไซต์ได้ทุก 4 วินาที ระบบไม่รับออเดอร์ออฟไลน์ และ Service Worker ไม่ cache ข้อมูลออเดอร์ส่วนตัว

Checkout นี้สร้าง VAPID keys แล้วและตั้งค่าใน hosted environment แต่ยังต้องทดสอบการส่งถึง iPhone/Android เครื่องจริงก่อนรับลูกค้า ไม่ได้ยืนยันการส่ง Push ถึงอุปกรณ์จาก browser QA

## ก่อนใช้หน้าร้านจริง

1. สร้าง owner และบัญชีพนักงานด้วยรหัสผ่านของร้าน
2. ตรวจเมนู/ความหวานและราคาอีกครั้ง เมนูแนะนำเป็นชุดเสนอเริ่มต้น
3. เปลี่ยนภาพประกอบเป็นภาพสินค้า/หน้าร้านจริง และตั้งเวลาเปิด–ปิด (เริ่มต้น 08:00–18:00)
4. ตั้งจำนวนโต๊ะจริง (เริ่มต้น 12) อัปโหลด QR ธนาคาร และทดสอบชำระกับพนักงาน
5. เปิดสิทธิ์เว็บไซต์สาธารณะจึงใช้กับลูกค้าที่ไม่สมัครสมาชิกได้ ขณะส่งมอบ Site เป็นส่วนตัวให้เจ้าของตรวจสอบ
6. ทดสอบ Push บนเครื่องจริงและพิมพ์ QR จากโดเมนที่ใช้งานจริง

ไม่มีการเชื่อมบริการเรียกเก็บเงินรายเดือนเพิ่มเอง แต่โฮสต์/ฐานข้อมูล/พื้นที่เก็บรูปอาจมีค่าใช้จ่ายตามโควตาและเงื่อนไขผู้ให้บริการ

## ภาพประกอบ

โลโก้จากไฟล์ที่เจ้าของร้านส่ง รูปกาแฟ/เครื่องดื่มประกอบจาก Unsplash (ดาวน์โหลดเป็น assets) ไม่ใช่ภาพสินค้าจริงของร้าน หน้าลูกค้าระบุ “ภาพประกอบ” ไว้ทุกการ์ด
