# 3 กอง — ไพ่จัด 13 ใบ เล่นกับเพื่อนออนไลน์

เกมไพ่ 3 กอง (Chinese Poker 3-5-5) แบบเรียลไทม์ 2–4 คน ไม่ต้องสมัครสมาชิก
เล่นเพื่อสะสมแต้มเท่านั้น ไม่มีเงินจริง

```
packages/engine    กติกา: สำรับไพ่ สับไพ่ ประเมินมือ ตรวจเน่า คิดแต้ม (TypeScript ล้วน + unit tests)
packages/protocol  ชนิดข้อมูลของ Socket event ทั้งหมด ข้อความ error ภาษาไทย
apps/server        Express + Socket.IO (server เป็นผู้แจกไพ่และคิดแต้ม)
apps/web           React + Vite + Tailwind (ออกแบบสำหรับมือถือ)
docs/ARCHITECTURE.md  สถาปัตยกรรม state flow และการตัดสินใจเรื่องกติกา
```

## รันบนเครื่องตัวเอง

ต้องมี Node.js 20 ขึ้นไป

```bash
npm install
```

เปิด 2 เทอร์มินัล:

```bash
npm run dev --workspace @sam-kong/server
```

```bash
npm run dev --workspace @sam-kong/web
```

เปิด http://localhost:5173 — มือถือใน Wi-Fi เดียวกันเปิด `http://<IP เครื่องคอม>:5173` ได้
(ดู IP บน Mac ด้วย `ipconfig getifaddr en0`)

## Test

```bash
npm test
```

```bash
npm run typecheck
```

## เปิดให้เพื่อนเล่นผ่านอินเทอร์เน็ต (Railway)

ใช้ **Railway** service เดียว: server ตัวเดียวรันทั้งเกมและหน้าเว็บ ได้ลิงก์เดียว ไม่ต้องตั้งค่า CORS

> **ค่าใช้จ่าย:** Railway ให้เครดิตทดลองครั้งแรก หลังจากนั้นเป็นแผน Hobby ประมาณ $5/เดือน
> (ดูราคาล่าสุดที่ https://railway.com/pricing) — server ไม่หลับ เพื่อนเข้าได้ทันที
> ห้องเก็บในหน่วยความจำ: ถ้า deploy ใหม่หรือ server รีสตาร์ต ห้องที่เล่นค้างอยู่จะหาย

### ขั้นที่ 1 — เอาโค้ดขึ้น GitHub

1. สมัคร/เข้าสู่ระบบ https://github.com แล้วสร้าง repository ใหม่ (Private ก็ได้) ชื่อเช่น `sam-kong` — **ไม่ต้อง** ติ๊กสร้าง README
2. ในโฟลเดอร์โปรเจกต์ รันคำสั่งที่ GitHub แสดงในหัวข้อ "…or push an existing repository" เช่น

```bash
git remote add origin https://github.com/<ชื่อคุณ>/sam-kong.git
```

```bash
git push -u origin main
```

### ขั้นที่ 2 — สร้างโปรเจกต์บน Railway

1. สมัคร https://railway.com ด้วยบัญชี GitHub
2. กด **New Project → Deploy from GitHub repo** แล้วเลือก `sam-kong`
   (Railway อ่านค่าการ build/start จาก `railway.json` เอง ไม่ต้องตั้งค่าอะไร)
3. รอ build เสร็จ (ครั้งแรกประมาณ 2–3 นาที)
4. เปิด service → **Settings → Networking → Generate Domain**
   จะได้ลิงก์เช่น `https://sam-kong-production.up.railway.app`
5. ทดสอบ: เปิด `<ลิงก์>/health` ต้องเห็น `{"ok":true,...}` แล้วเปิด `<ลิงก์>` จะเห็นหน้าแรกของเกม

ส่งลิงก์นั้นให้เพื่อนได้เลย — ลิงก์เชิญเข้าห้อง (`/join/รหัส`) ใช้โดเมนเดียวกันอัตโนมัติ

### อัปเดตเกมครั้งต่อไป

commit แล้ว `git push` — Railway จะ build และ deploy ใหม่ให้อัตโนมัติ

### ไม่อยากใช้ GitHub?

ใช้ Railway CLI deploy จากเครื่องได้เลย (https://docs.railway.com/guides/cli):

```bash
railway login
```

```bash
railway init
```

```bash
railway up
```

แล้วกด **Generate Domain** เหมือนขั้นที่ 2 ข้อ 4

### ถ้าเข้าเกมไม่ได้

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| Build ล้มเหลว | ดู log ใน Railway → Deployments; ตรวจว่า push `package-lock.json` ขึ้นไปด้วย |
| เปิดลิงก์ไม่ได้เลย | ยังไม่ได้กด **Generate Domain** |
| เห็นหน้าเว็บ แต่ขึ้น "กำลังเชื่อมต่อเซิร์ฟเวอร์…" ค้าง | ตั้ง `VITE_SERVER_URL` ไว้ผิด — ลบตัวแปรนี้ออกแล้ว deploy ใหม่ |

## ค่าตั้งค่า (environment variables)

ดู `apps/server/.env.example` และ `apps/web/.env.example` — ห้ามใส่ secret ลงในโค้ด
