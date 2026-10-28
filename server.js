const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const emissionRoutes = require('./src/routes/emissionRoutes');
const transactionRoutes = require('./src/routes/transactionRoutes');
const companyRoutes = require('./src/routes/companyRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mapping API Endpoints
app.use('/api/v1/emissions', emissionRoutes);
app.use('/api/v1/credits', transactionRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/companies', companyRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Carbon Credit Trading API running on http://localhost:${PORT}`);
});