CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Companies Table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(20) UNIQUE NOT NULL,
    industry_type VARCHAR(100) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Emission Records Table
CREATE TABLE IF NOT EXISTS emission_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    carbon_ton_equivalent DECIMAL(12, 4) NOT NULL,
    record_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Credit Transactions Table
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_company_id UUID NOT NULL REFERENCES companies(id),
    buyer_company_id UUID NOT NULL REFERENCES companies(id),
    amount_tco2e DECIMAL(12, 4) NOT NULL,
    price_per_ton DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert Demo Data
INSERT INTO companies (id, name, tax_id, industry_type, contact_email) VALUES 
('11111111-1111-1111-1111-111111111111', 'Green Logistics Thailand', '0105560000011', 'ขนส่ง', 'contact@greenlogistics.co.th'),
('22222222-2222-2222-2222-222222222222', 'Siam Eco Manufacture', '0105560000022', 'การผลิต', 'info@siameco.com')
ON CONFLICT DO NOTHING;