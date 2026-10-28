# คู่มือการติดตั้งและใช้งานโปรเจกต์

README นี้อธิบายวิธีดาวน์โหลดโปรเจกต์ ติดตั้งแพ็กเกจ ตั้งค่าฐานข้อมูล และเปิดใช้งาน Web Application ตั้งแต่เริ่มต้น เหมาะสำหรับผู้ที่ต้องการนำโปรเจกต์ไปรันบนเครื่องของตัวเอง

## 1. โปรแกรมที่ต้องใช้

ก่อนเริ่มติดตั้ง ให้ติดตั้งโปรแกรมต่อไปนี้ให้เรียบร้อย

- **Node.js เวอร์ชัน 18 ขึ้นไป** ใช้สำหรับรันแอปพลิเคชัน
- **npm เวอร์ชัน 9 ขึ้นไป** ใช้ติดตั้งแพ็กเกจที่โปรเจกต์ต้องใช้ โดยจะติดตั้งมาพร้อม Node.js
- **Docker Desktop** ใช้สำหรับรัน MySQL และ MongoDB
- **Git** ใช้ดาวน์โหลดโปรเจกต์จาก GitHub
- **Google Account** ใช้สำหรับตั้งค่าระบบส่งอีเมลแจ้งเตือนผ่าน Gmail

ดาวน์โหลดโปรแกรมได้จากลิงก์ต่อไปนี้

- [Node.js](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Git](https://git-scm.com/downloads)

หลังติดตั้งเสร็จ ให้เปิด Command Prompt หรือ Terminal แล้วตรวจสอบว่าใช้งานได้หรือไม่ โดยพิมพ์คำสั่งต่อไปนี้

```bash
node -v
npm -v
git --version
docker --version
docker compose version
```

หากแต่ละคำสั่งแสดงหมายเลขเวอร์ชัน แสดงว่าพร้อมใช้งาน หากคำสั่ง Docker ใช้ไม่ได้ ให้เปิด Docker Desktop และรอจนระบบเริ่มทำงานก่อน

## 2. ดาวน์โหลดโปรเจกต์

สามารถดาวน์โหลดโปรเจกต์ได้ 2 วิธี เลือกใช้วิธีใดวิธีหนึ่งได้เลย

### วิธีที่ 1: ดาวน์โหลดจาก GitHub

1. เปิดหน้า Repository ของโปรเจกต์บน GitHub
2. กดปุ่ม **Code**
3. เลือก **Download ZIP**
4. เมื่อดาวน์โหลดเสร็จ ให้คลิกขวาที่ไฟล์ ZIP แล้วเลือก **Extract All...**
5. เปิดโฟลเดอร์ที่แตกไฟล์แล้ว

### วิธีที่ 2: ใช้ Git

เปิด Command Prompt หรือ Terminal แล้วพิมพ์คำสั่งต่อไปนี้ โดยเปลี่ยน URL ให้เป็น Repository ของโปรเจกต์จริง

```bash
git clone <repository-url>
cd <project-folder>
```

ตัวอย่าง หาก Repository ชื่อ `dev-tools`

```bash
git clone https://github.com/username/dev-tools.git
cd dev-tools
```

**หมายเหตุ:** URL ในตัวอย่างเป็นเพียงตัวอย่าง ต้องเปลี่ยนให้ตรงกับ Repository ที่ต้องการดาวน์โหลด

### เปิด Terminal ในโฟลเดอร์โปรเจกต์

หากใช้ Windows สามารถเปิดโฟลเดอร์โปรเจกต์ใน File Explorer จากนั้นคลิกแถบที่อยู่ด้านบน พิมพ์ `cmd` แล้วกด Enter ได้เลย

ก่อนทำขั้นตอนต่อไป ให้ตรวจสอบว่าอยู่ในโฟลเดอร์โปรเจกต์ที่มีไฟล์ `package.json`

## 3. ติดตั้งแพ็กเกจที่จำเป็น

เมื่อเปิด Terminal ในโฟลเดอร์โปรเจกต์แล้ว ให้รันคำสั่ง

```bash
npm install
```

คำสั่งนี้จะติดตั้งแพ็กเกจที่ระบุไว้ใน `package.json` โดยแพ็กเกจจะถูกเก็บไว้ในโฟลเดอร์ `node_modules`

รอจนติดตั้งเสร็จ หากไม่มี Error ที่ทำให้ติดตั้งไม่สำเร็จ ให้ทำขั้นตอนต่อไปได้เลย

## 4. ตั้งค่าไฟล์ .env

ไฟล์ `.env` ใช้เก็บค่าที่แอปพลิเคชันต้องใช้ เช่น พอร์ตเซิร์ฟเวอร์ ข้อมูลเชื่อมต่อฐานข้อมูล และข้อมูลสำหรับส่งอีเมล

### 4.1 สร้างไฟล์ .env

หากในโปรเจกต์มีไฟล์ `.env.example` ให้คัดลอกไฟล์ดังกล่าวแล้วเปลี่ยนชื่อสำเนาเป็น `.env`

**Windows (Command Prompt)**

```cmd
copy .env.example .env
```

**Linux / macOS**

```bash
cp .env.example .env
```

### 4.2 แก้ไขค่าภายในไฟล์

เปิดไฟล์ `.env` ด้วย Visual Studio Code หรือ Text Editor แล้วตั้งค่าตามตัวอย่างนี้

```dotenv
# Server Configuration
PORT=3000

# MySQL Database Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=rootpassword
MYSQL_DATABASE=consistency_checker

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/consistency_checker

# Email Alert Configuration
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASS=xxxx xxxx xxxx xxxx
ALERT_EMAIL_TO=recipient1@gmail.com,recipient2@example.com
```

คำอธิบายตัวแปรที่ใช้ในไฟล์

| ตัวแปร | ใช้สำหรับ |
|---|---|
| `PORT` | กำหนดพอร์ตของ Web Application |
| `MYSQL_HOST` | ที่อยู่ของ MySQL |
| `MYSQL_PORT` | พอร์ตของ MySQL |
| `MYSQL_USER` | ชื่อผู้ใช้ MySQL |
| `MYSQL_PASSWORD` | รหัสผ่าน MySQL |
| `MYSQL_DATABASE` | ชื่อฐานข้อมูล MySQL |
| `MONGO_URI` | ที่อยู่สำหรับเชื่อมต่อ MongoDB |
| `GMAIL_USER` | Gmail ที่ใช้ส่งอีเมล |
| `GMAIL_APP_PASS` | App Password สำหรับส่งอีเมล |
| `ALERT_EMAIL_TO` | อีเมลผู้รับการแจ้งเตือน คั่นแต่ละอีเมลด้วยเครื่องหมายจุลภาค |

**สำคัญ:** ค่าในตัวอย่างเป็นค่าเริ่มต้นสำหรับอธิบายวิธีตั้งค่าเท่านั้น ควรตรวจสอบข้อมูลให้ตรงกับ `docker-compose.yml` และการตั้งค่าของโปรเจกต์ก่อนใช้งานจริง อย่านำรหัสผ่านหรือข้อมูลส่วนตัวในไฟล์ `.env` ขึ้น GitHub

## 5. เปิดใช้งานฐานข้อมูลด้วย Docker

โปรเจกต์ใช้ MySQL และ MongoDB เป็นฐานข้อมูล โดยสามารถรันทั้งสองระบบผ่าน Docker Compose ได้ ไม่จำเป็นต้องติดตั้งฐานข้อมูลแยกลงในเครื่อง

### 5.1 เปิด Docker Desktop

เปิด Docker Desktop และรอจนระบบพร้อมใช้งาน จากนั้นเปิด Terminal ในโฟลเดอร์โปรเจกต์

### 5.2 เริ่มต้นฐานข้อมูล

รันคำสั่ง

```bash
docker compose up -d
```

Docker จะสร้างและเริ่มต้น Container ตามที่กำหนดไว้ในไฟล์ `docker-compose.yml` โดยทำงานอยู่เบื้องหลัง

### 5.3 ตรวจสอบสถานะ

รันคำสั่ง

```bash
docker compose ps
```

ตรวจสอบว่า Container ของฐานข้อมูลเริ่มทำงานแล้ว หากมีปัญหา สามารถดูรายละเอียดเพิ่มเติมได้ด้วยคำสั่ง

```bash
docker compose logs -f
```

กด `Ctrl + C` เพื่อหยุดแสดง Logs โดยไม่จำเป็นต้องหยุด Container

### 5.4 การสร้างฐานข้อมูลและตาราง

หากกำหนดค่าไว้ใน `docker-compose.yml` อย่างถูกต้อง ระบบจะสามารถสร้างฐานข้อมูลและเตรียมข้อมูลเริ่มต้นได้ตามที่โปรเจกต์กำหนด เช่น

- **MySQL:** ใช้เก็บข้อมูลในฐานข้อมูล `consistency_checker`
- **Schema:** ไฟล์ `schema.sql` ใช้กำหนดโครงสร้างตาราง เช่น `monitors`, `check_runs` และ `incidents`
- **MongoDB:** ใช้เก็บข้อมูลผ่านการเชื่อมต่อที่กำหนดไว้ใน `MONGO_URI`

การสร้างตารางจาก `schema.sql` อัตโนมัติจะเกิดขึ้นเมื่อมีการตั้งค่าให้ Docker นำไฟล์ไปใช้ตอนเริ่มต้นฐานข้อมูลเท่านั้น

### 5.5 คำสั่ง Docker ที่ใช้บ่อย

เริ่มต้นฐานข้อมูล

```bash
docker compose up -d
```

ตรวจสอบสถานะ Container

```bash
docker compose ps
```

หยุด Container โดยเก็บข้อมูลใน Volume ไว้

```bash
docker compose down
```

หากต้องการลบ Container และ Volume พร้อมข้อมูลฐานข้อมูล ให้ใช้คำสั่ง

```bash
docker compose down -v
```

**ระวัง:** คำสั่ง `docker compose down -v` อาจทำให้ข้อมูลฐานข้อมูลที่เก็บใน Volume หายไป ควรใช้เฉพาะเมื่อต้องการล้างข้อมูลและเริ่มต้นใหม่เท่านั้น

## 6. ตั้งค่า Gmail สำหรับส่งอีเมลแจ้งเตือน

หากต้องการใช้ระบบแจ้งเตือนทางอีเมลผ่าน Gmail SMTP ให้ตั้งค่า Google Account ดังนี้

1. เข้าสู่ระบบ [Google Account](https://myaccount.google.com/)
2. ไปที่เมนู Security
3. เปิดใช้งาน **2-Step Verification**
4. เข้าไปที่ [App Passwords](https://myaccount.google.com/apppasswords)
5. สร้าง App Password สำหรับโปรเจกต์
6. นำรหัสที่ได้ไปใส่ในตัวแปร `GMAIL_APP_PASS` ภายในไฟล์ `.env`
7. กำหนด `GMAIL_USER` เป็น Gmail ของผู้ส่ง
8. กำหนด `ALERT_EMAIL_TO` เป็นอีเมลของผู้รับ

ตัวอย่างการตั้งค่า

```dotenv
GMAIL_USER=myaccount@gmail.com
GMAIL_APP_PASS=abcdefghijklmnop
ALERT_EMAIL_TO=admin@gmail.com,user@example.com
```

ใช้ App Password แทนรหัสผ่าน Gmail ปกติ และห้ามเผยแพร่รหัสนี้ หากไม่สามารถสร้าง App Password ได้ ให้ตรวจสอบการตั้งค่าความปลอดภัยของบัญชี Google

## 7. เริ่มใช้งาน Web Application

หลังจากตั้งค่า `.env` และเริ่มฐานข้อมูลเรียบร้อยแล้ว สามารถเปิดเซิร์ฟเวอร์ได้

### 7.1 โหมดพัฒนา (Development)

```bash
npm run dev
```

ใช้สำหรับพัฒนาและทดสอบระบบ โดยการรีโหลดอัตโนมัติจะขึ้นอยู่กับเครื่องมือที่โปรเจกต์กำหนดไว้

### 7.2 โหมดปกติ (Start)

```bash
npm start
```

ใช้เริ่มเซิร์ฟเวอร์ตามคำสั่งที่กำหนดไว้ใน `package.json`

### 7.3 เปิดเว็บไซต์

เมื่อเซิร์ฟเวอร์เริ่มทำงานแล้ว ให้เปิดเบราว์เซอร์และเข้าไปที่

[http://localhost:3000](http://localhost:3000)

หากตั้งค่า `PORT` เป็นหมายเลขอื่น ให้เปลี่ยน URL ให้ตรงกับพอร์ตที่ใช้งาน

หากเว็บไซต์เปิดไม่ได้ ให้ตรวจสอบข้อความ Error ใน Terminal และตรวจสอบว่า Docker Container รวมถึงค่าต่าง ๆ ใน `.env` ถูกต้องหรือไม่

## 8. รีเซ็ตข้อมูลทดสอบ

หากต้องการล้างข้อมูลทดสอบ สามารถตรวจสอบสคริปต์ `reset-db.js` ที่อยู่ในโปรเจกต์ และรันคำสั่งต่อไปนี้เมื่อแน่ใจว่าต้องการรีเซ็ตข้อมูลแล้ว

```bash
node reset-db.js
```

ก่อนรันควรเปิดอ่านไฟล์ `reset-db.js` เพื่อดูว่าสคริปต์ลบหรือแก้ไขข้อมูลอะไรบ้าง และตรวจสอบว่าครอบคลุมฐานข้อมูลใด

**คำเตือน:** การรีเซ็ตอาจทำให้ข้อมูลที่มีอยู่หายไป ควรสำรองข้อมูลก่อนหากมีข้อมูลที่ต้องการเก็บไว้

## 9. โครงสร้างโปรเจกต์

โครงสร้างไฟล์หลักของโปรเจกต์มีตัวอย่างดังนี้

```text
├── public/
│   └── index.html          # หน้าเว็บไซต์และ Dashboard
├── src/
│   ├── config/             # การตั้งค่าการเชื่อมต่อฐานข้อมูล
│   ├── models/             # โมเดลข้อมูล MongoDB
│   └── services/           # ระบบตรวจสอบและแจ้งเตือน
├── .env                    # ค่าการตั้งค่าส่วนตัว
├── .env.example            # ตัวอย่างไฟล์ตั้งค่า
├── .gitignore              # รายการไฟล์ที่ไม่ต้องการส่งขึ้น Git
├── docker-compose.yml      # การตั้งค่า Docker และฐานข้อมูล
├── schema.sql              # โครงสร้างตาราง MySQL
├── reset-db.js             # สคริปต์รีเซ็ตข้อมูล
├── server.js               # จุดเริ่มต้นของ Express Server
├── package.json            # รายการแพ็กเกจและคำสั่งที่ใช้รัน
└── README.md               # คู่มือการติดตั้งและใช้งาน
```

ชื่อไฟล์และโฟลเดอร์อาจแตกต่างกันตามเวอร์ชันของโปรเจกต์ ให้ยึดตามไฟล์ที่มีอยู่จริงใน Repository

## 10. การแก้ไขปัญหาเบื้องต้น

### ใช้คำสั่ง `node` หรือ `npm` ไม่ได้

- ตรวจสอบว่าติดตั้ง Node.js แล้ว
- ปิดแล้วเปิด Command Prompt หรือ Terminal ใหม่
- หากยังใช้ไม่ได้ ให้ตรวจสอบการตั้งค่า PATH ของระบบ

### Docker หรือฐานข้อมูลทำงานไม่ได้

- เปิด Docker Desktop และรอจนพร้อมใช้งาน
- รัน `docker compose ps` เพื่อตรวจสอบ Container
- ตรวจสอบพอร์ตและข้อมูลเชื่อมต่อใน `.env`
- ใช้ `docker compose logs -f` เพื่อดู Error

### พอร์ต 3000 ถูกใช้งานอยู่

หากพบข้อความ `Port 3000 is already in use` หมายความว่ามีโปรแกรมอื่นใช้พอร์ตนี้อยู่

ให้ปิดโปรแกรมที่ใช้พอร์ตดังกล่าว หรือเปลี่ยนค่า `PORT` ใน `.env` แล้วตรวจสอบว่าเซิร์ฟเวอร์อ่านค่าจากตัวแปรนี้จริง

### ส่งอีเมลแจ้งเตือนไม่ได้

- ตรวจสอบ `GMAIL_USER` และ `GMAIL_APP_PASS`
- ตรวจสอบว่าเปิดใช้งาน 2-Step Verification แล้ว
- ตรวจสอบอีเมลผู้รับใน `ALERT_EMAIL_TO`
- ตรวจสอบการตั้งค่า SMTP และ Error ที่แสดงใน Terminal

### รัน `npm run dev` หรือ `npm start` ไม่ได้

เปิดไฟล์ `package.json` แล้วตรวจสอบส่วน `scripts` ว่ามีคำสั่ง `dev` และ `start` หรือไม่ หากไม่มี ให้ใช้คำสั่งที่กำหนดไว้ในโปรเจกต์จริง

## 11. การเปิดใช้งานครั้งถัดไป

เมื่อติดตั้งโปรเจกต์เรียบร้อยแล้ว ครั้งต่อไปสามารถเปิดใช้งานตามขั้นตอนนี้ได้เลย

1. เปิด Docker Desktop
2. เปิด Terminal ในโฟลเดอร์โปรเจกต์
3. รัน `docker compose up -d` เพื่อเริ่มฐานข้อมูล
4. รัน `npm run dev` หรือ `npm start` เพื่อเปิดเซิร์ฟเวอร์
5. เปิดเบราว์เซอร์ไปที่ [http://localhost:3000](http://localhost:3000)

ไม่จำเป็นต้องรัน `npm install` ใหม่ทุกครั้ง เว้นแต่มีการเปลี่ยนแปลงแพ็กเกจ หรือพบปัญหาที่เกี่ยวข้องกับ Dependencies
