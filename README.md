## อัปเดตเว็บหลังจากนี้ (Auto Deploy)
ทุกครั้งที่แก้โค้ดแล้วอยากให้เว็บอัปเดต:

``` bash
git add .
git commit -m "update"
git push
```

Vercel จะ deploy ให้เองอัตโนมัติ

## UI/UX Notes

- หน้า `src/app/page.tsx` เป็นหน้า Dashboard หลัก
- บนมือถือมี **segmented tabs** (Workout / Nutrition / Protein) เพื่อไม่ให้ scroll ยาว และช่วยให้โฟกัสการใช้งานชัดขึ้น
- คอมโพเนนต์ที่ใช้ร่วมกันอยู่ใน `src/app/_components/` เช่น
	- `MobileTabs.tsx` (แท็บสำหรับมือถือ)
	- `ConfirmDialog.tsx` (modal confirm สำหรับ action ที่ลบ/รีเซ็ต)

## เริ่มต้นใช้งาน

```bash
npm install
```

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ API key ที่สร้างจาก
[Google AI Studio](https://aistudio.google.com/apikey):

```bash
cp .env.example .env.local
```

จากนั้นรัน:

```bash
npm run dev
```

## เชื่อมต่อ Supabase

ตั้งค่าตัวแปรต่อไปนี้ใน `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Publishable key ใช้ฝั่งเบราว์เซอร์ได้ แต่ห้ามนำ `service_role` key หรือ database
password ไปใส่ในตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_`

ตรวจว่าตัวแอปอ่านค่าตั้งค่าได้ที่:

```text
http://localhost:3000/api/supabase/status
```

โครงสร้างฐานข้อมูลเริ่มต้นอยู่ใน:

```text
supabase/migrations/20260622000000_initial_fitsync_schema.sql
```

Migration นี้สร้างตารางโปรไฟล์ บันทึกรายวัน ประวัติ AI Coach และค่าน้ำหนัก
พร้อมเปิด Row Level Security เพื่อให้สมาชิกเข้าถึงได้เฉพาะข้อมูลของตัวเอง

ก่อนเปิดระบบสมาชิก ให้นำ migration ไปใช้กับ Supabase ผ่าน Database Migrations
ของ GitHub integration หรือวาง SQL ใน Supabase SQL Editor เพียงหนึ่งครั้ง

หลังเพิ่มระบบ Cloud Sync ให้รัน migration ตามลำดับเวลา โดยรวมถึง:

```text
supabase/migrations/20260622010000_coach_message_client_id.sql
supabase/migrations/20260622020000_daily_checkins_progress.sql
supabase/migrations/20260622030000_weekly_ai_reviews.sql
```

Migration สำหรับ Daily Check-in จะเพิ่มสัดส่วนร่างกายใน `body_measurements`
และสร้างตาราง `daily_checkins` สำหรับการนอน น้ำดื่ม พลังงาน ความหิว อารมณ์
และโน้ตประจำวัน พร้อม RLS แยกข้อมูลของสมาชิกแต่ละคน

Migration สำหรับ Weekly AI Review จะสร้างตาราง `weekly_reviews` สำหรับเก็บ
snapshot และผลสรุปรายสัปดาห์แบบ cache หนึ่งรายการต่อสมาชิกต่อสัปดาห์

จากนั้นตรวจที่ Supabase → Authentication → Providers:

- Email เปิดใช้งานได้ทันที
- Google ต้องเปิด Provider และใส่ Google OAuth Client ID/Secret ก่อน ปุ่ม Google
  ในแอปจึงจะเข้าสู่ระบบได้

ตั้งค่า Authentication URL:

```text
Site URL: https://your-production-domain.vercel.app
Redirect URLs:
https://your-production-domain.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

ตรวจว่าเว็บอ่านค่าตั้งค่า AI ได้ที่:

```text
http://localhost:3000/api/ai/status
```

และทดสอบเรียก Gemini จริง:

```bash
npm run ai:check
```

โมเดลเริ่มต้นคือ `gemini-3.5-flash` และ fallback เป็น
`gemini-3.1-flash-lite` โดยสามารถเปลี่ยนผ่าน `.env.local` ได้

หาก deploy บน Vercel ให้เพิ่ม Environment Variables เดียวกันใน
Project Settings → Environment Variables แล้ว Redeploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (ไม่บังคับ)
- `GEMINI_FALLBACK_MODEL` (ไม่บังคับ)

อย่าใช้ชื่อตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_` สำหรับ API key เพราะคีย์ต้องอยู่
เฉพาะฝั่งเซิร์ฟเวอร์

ควรสร้าง Authorization key รุ่นใหม่จาก AI Studio หากคีย์เดิมเป็น Standard key
เนื่องจาก Google เริ่มปฏิเสธ unrestricted Standard keys ตั้งแต่วันที่ 19 มิถุนายน 2026
และจะเลิกรองรับ Standard keys ในเดือนกันยายน 2026

ข้อมูล Workout, Quick Add และมื้ออาหารจะเก็บใน `localStorage` ของเบราว์เซอร์
โดยแยกตามวันที่ท้องถิ่นของอุปกรณ์

ข้อมูลโปรไฟล์และประวัติ AI Coach จะถูกจดจำในเบราว์เซอร์แบบไม่หมดอายุ
(เก็บข้อความล่าสุดสูงสุด 100 ข้อความ) และใช้ร่วมกันระหว่างหน้า Dashboard กับ
หน้า `/coach`

โปรเจกต์ล็อก development server ไว้ที่ `http://localhost:3000` เพราะ
`localStorage` แยกตามพอร์ต หากพอร์ต 3000 ถูกใช้อยู่ ให้หยุด dev server ตัวเก่าด้วย
`Ctrl+C` ก่อนรัน `npm run dev` ใหม่ แทนการเปิดเว็บด้วยพอร์ต 3001 หรือพอร์ตอื่น
