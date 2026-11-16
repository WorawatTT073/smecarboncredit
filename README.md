# SME Carbon Footprint & Credit Trading

เว็บ Demo สำหรับระบบจัดการ Carbon Footprint และ Carbon Credit Trading สำหรับธุรกิจ SMEs ใช้ **Node.js + Express + PostgreSQL**

## 1. Requirements
- Node.js 18+
- npm 9+
- Docker Desktop
- Git (ถ้าดาวน์โหลดด้วย git)

## 2. Install
```bash
npm install
copy .env.example .env
```

บน PowerShell/Linux/macOS ใช้ `cp .env.example .env`

ตั้ง `JWT_SECRET` ใน `.env` เป็นข้อความสุ่มยาวอย่างน้อย 32 ตัวอักษร

## 3. Start PostgreSQL
```bash
docker compose up -d
```

ตรวจสอบ:
```bash
docker compose ps
```

> `schema.sql` จะถูกรันอัตโนมัติเมื่อ PostgreSQL volume ถูกสร้างครั้งแรกเท่านั้น หากแก้ schema แล้วต้องการเริ่มฐานข้อมูลใหม่ ให้ใช้ `docker compose down -v` แล้ว `docker compose up -d` (คำสั่งนี้ลบข้อมูลเดิมใน volume)

## 4. Start Web App
```bash
npm start
```
เปิด `http://localhost:3000`

## 5. Demo Login
| Account | Password | Role |
|---|---|---|
| admin@demo.com | admin123 | Admin |
| customer@demo.com | customer123 | Customer |
| partner@demo.com | partner123 | Partner |

บัญชีเหล่านี้เป็นบัญชีสาธิตที่กำหนดในโค้ด ไม่ใช่ระบบ Register สำหรับ Production

## 6. Access Roles
- **Public:** ดู `/api/v1/credits/market`
- **Partner (SME Owner):** บันทึก Emission, เปิดขาย Credit, ซื้อ Credit, แก้เป้าหมายบริษัท, ลบ Emission
- **Customer:** ดู Market และซื้อ Credit
- **Admin:** แก้ข้อมูล/เป้าหมายบริษัท และลบ Emission

Frontend ซ่อนเมนูตาม Role เพื่อความสะดวก แต่ **Backend เป็นผู้ตรวจสิทธิ์จริง**

## 7. Core API
| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/v1/credits/market` | Public, Customer |
| POST | `/api/v1/emissions` | Partner |
| POST | `/api/v1/transactions` | Customer, Partner |
| PUT | `/api/v1/companies/:id` | Partner, Admin |
| DELETE | `/api/v1/emissions/:id` | Partner, Admin |

Bonus endpoints:
- `POST /api/v1/credits/listings` — Partner เปิดรายการ Credit เพื่อขาย
- `GET /api/v1/emissions/summary?company_id=...` — สรุป tCO2e ของบริษัท
- `POST /api/v1/auth/login` — Demo Login
- `GET /api/v1/auth/me` — ตรวจ session

## 8. Database
มี 3 ตารางหลักตาม Specification:
1. `companies` — ข้อมูลบริษัทและ `reduction_target`
2. `emission_records` — ข้อมูลกิจกรรมและ tCO2e
3. `credit_transactions` — รายการเปิดขายและธุรกรรมซื้อขาย โดย `buyer_company_id` เป็น NULL ได้เฉพาะสถานะ `Open`

มี CHECK/INDEX สำหรับค่าที่สำคัญ เช่น `amount > 0`, `price_per_ton > 0`, seller ต้องไม่เท่ากับ buyer และสถานะต้องเป็น `Open/Pending/Completed/Cancelled`

## 9. Emission Factors
ค่า Emission Factor ใน Demo ถูกเก็บไว้ใน `src/services/carbonCalculator.js` และระบุว่าเป็นค่าที่ต้องตรวจสอบกับเอกสาร TGO **ปี/แหล่งอ้างอิงจริงก่อนส่งงาน** เพราะค่าอาจเปลี่ยนตามปีและขอบเขตการคำนวณ
