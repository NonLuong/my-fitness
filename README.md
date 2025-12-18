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