const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const initializeDatabase = require('./src/config/initializeDatabase');
const emissionRoutes = require('./src/routes/emissionRoutes');
const transactionRoutes = require('./src/routes/transactionRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const authRoutes = require('./src/routes/authRoutes');
const etsRoutes = require('./src/routes/etsRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
const listingBody = express.json({ limit: '9mb' });
const defaultBody = express.json();
app.use((req, res, next) => {
  const parser = req.method === 'POST' && (/^\/api\/v1\/(credits|transactions)\/listings\/?$/.test(req.path)
    || /^\/api\/v1\/emissions\/?$/.test(req.path))
    ? listingBody : defaultBody;
  parser(req, res, next);
});
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/emissions', emissionRoutes);
app.use('/api/v1/credits', transactionRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/ets', etsRoutes);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'ข้อมูล JSON ไม่ถูกต้อง' });
  if (error.status) return res.status(error.status).json({ error: error.message });
  if (['22P02', '22003', '22007', '22008'].includes(error.code)) {
    return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้องหรือค่าเกินช่วงที่รองรับ' });
  }
  console.error(error);
  res.status(500).json({ error: 'ระบบฐานข้อมูลขัดข้อง' });
});

initializeDatabase()
  .then(() => app.listen(PORT, () => console.log(`ETS demo running on http://localhost:${PORT}`)))
  .catch(error => {
    console.error('Unable to initialize PostgreSQL. Start Docker Compose and check the database settings.', error);
    process.exit(1);
  });
