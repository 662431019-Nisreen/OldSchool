# Old School Coffee บน Cloudflare ของร้าน

เว็บร้าน: https://old-school-coffee.asdareen112001.workers.dev

แอดมิน: https://old-school-coffee.asdareen112001.workers.dev/admin

โหมดนี้แยกจาก Sites ใช้ Workers Free และ D1 ในบัญชีของร้าน ไม่เปิด R2 หรือสมัครบริการเสียเงินเพิ่มเติม เมนู การตั้งค่า และบัญชีผู้ดูแลย้ายมาจากเว็บเดิม แต่เริ่มประวัติออเดอร์ใหม่ตามที่เจ้าของร้านเลือก ต้องเข้าสู่ระบบใหม่บนโดเมนนี้ด้วยบัญชีร้านเดิม

## แก้และ Deploy จาก VS Code

ทำงานในโฟลเดอร์ `/Users/murshidasaifulislam/OldSchool`:

```bash
npm run build:cloudflare
npm run deploy:cloudflare
```

หากมี migration ใหม่ ให้ใช้ก่อน Deploy:

```bash
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config wrangler.cloudflare.jsonc
```

`wrangler.cloudflare.jsonc` ระบุบัญชีและฐานข้อมูลจริงของร้านแล้ว ห้ามแทนที่ด้วยค่า placeholder ของ Sites ตัวช่วย Deploy ตรวจว่า build ใช้บัญชีและฐานข้อมูลตรงกัน และไม่มี binding ของบริการอื่น การ Push GitHub อย่างเดียวยังไม่ Deploy อัตโนมัติ เพราะยังไม่ได้เชื่อม Workers Builds

ทดสอบในเครื่องด้วย `npm run dev:cloudflare` โดยใช้ฐานข้อมูล local แยกจากออนไลน์ ถ้า local ยังไม่มีตาราง ให้ใช้คำสั่ง migration ข้างต้นโดยเปลี่ยน `--remote` เป็น `--local --persist-to .wrangler/state` การลง migration อย่างเดียวไม่คัดลอกข้อมูลร้านออนไลน์มาให้

คำสั่ง `npm run build` เดิมยังเป็นโหมด Sites อย่าใช้ผล build ของสองโหมดสลับกัน

## รูปและแจ้งเตือน

รูปเดิม 3 รูปย้ายเป็นไฟล์ static ใน `public/assets/migrated-images` รูปที่อัปโหลดใหม่เก็บใน D1 รองรับ JPG, PNG, WebP สูงสุด 1 MiB ต่อรูป รวมสูงสุด 50 MiB ระบบปฏิเสธรูปใหม่เมื่อเต็ม การเปลี่ยนรูปไม่ได้ลบไฟล์เก่าอัตโนมัติ

กุญแจ Web Push ใหม่เก็บใน Cloudflare Secrets ไม่อยู่ใน Git อุปกรณ์ต้องเปิดอนุญาตแจ้งเตือนใหม่บนโดเมนใหม่

หน้ารายงานโหลดเมื่อเปิดหรือเปลี่ยนตัวกรอง หากต้องการยอดล่าสุดให้กด **อัปเดตรายงาน** ระบบไม่โหลดประวัติทั้งหมดซ้ำทุก 15 วินาที

## โควตาและการสำรอง

Free มีขีดจำกัดและนโยบายอาจเปลี่ยนได้ หากเกินโควตาระบบออนไลน์อาจหยุดให้บริการ ไม่มีการรับประกันว่าจะฟรีตลอดไปหรือรับออเดอร์ได้ไม่จำกัด ดู [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) และ [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

หลังเริ่มใช้งาน ให้ตรวจ Workers Metrics และ D1 Metrics > Row Metrics จากบัญชี Cloudflare เป็นระยะ การทดสอบ SQLite ในเครื่องช่วยตรวจประสิทธิภาพคำสั่งค้นหา แต่ไม่ใช่ผลวัดโควตาหรือ CPU ของ Cloudflare

Git เก็บโค้ดและรูป static เท่านั้น ไม่รวมออเดอร์ ฐานข้อมูลออนไลน์ รูปอัปโหลดใหม่ หรือ Secrets ต้องสำรองข้อมูลแยกเป็นข้อมูลส่วนตัวและทดสอบกู้คืนก่อนใช้งานจริง ไฟล์สำรองอาจมีข้อมูลบัญชีและออเดอร์ ห้าม Commit หรือเผยแพร่ไฟล์ใน `outputs/migration-private`

แผน Offline-first ยังหยุดอยู่ เวอร์ชันนี้ต้องใช้อินเทอร์เน็ตเพื่อรับและบันทึกออเดอร์

## ผลตรวจสอบก่อนส่งมอบ (28 ตุลาคม 2026)

ทดสอบบน Cloudflare Free จริง: เข้าสู่ระบบ รับออเดอร์ ป้องกันออเดอร์ซ้ำ รับเงินสด เปลี่ยนสถานะ และรายงาน 100 ออเดอร์ผ่าน รายงานรายเดือนและ Excel 3,000 ออเดอร์ผ่านในกรณีทดสอบนี้ ข้อมูลทดสอบถูกล้างแล้ว เหลือ 0 ออเดอร์และบัญชีร้านเดิม 1 บัญชี ผลนี้ไม่ใช่การรับประกัน CPU หรือโควตาทุกกรณีในอนาคต
