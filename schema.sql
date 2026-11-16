CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(20) UNIQUE NOT NULL,
    industry_type VARCHAR(100) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    reduction_target DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (reduction_target >= 0 AND reduction_target <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emission_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    carbon_ton_equivalent DECIMAL(12,4) NOT NULL CHECK (carbon_ton_equivalent >= 0),
    record_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT emission_activity_type_check CHECK (activity_type IN ('ELECTRICITY', 'DIESEL', 'GASOLINE', 'WATER'))
);

CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_company_id UUID NOT NULL REFERENCES companies(id),
    buyer_company_id UUID NULL REFERENCES companies(id),
    amount_tco2e DECIMAL(12,4) NOT NULL CHECK (amount_tco2e > 0),
    price_per_ton DECIMAL(10,2) NOT NULL CHECK (price_per_ton > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Open', 'Pending', 'Completed', 'Cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT seller_buyer_different CHECK (buyer_company_id IS NULL OR seller_company_id <> buyer_company_id),
    CONSTRAINT open_listing_without_buyer CHECK (status <> 'Open' OR buyer_company_id IS NULL),
    CONSTRAINT buyer_required_for_transaction CHECK (status = 'Open' OR buyer_company_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_emission_company ON emission_records(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_market ON credit_transactions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_seller ON credit_transactions(seller_company_id, status);

INSERT INTO companies (id, name, tax_id, industry_type, contact_email, reduction_target) VALUES
('11111111-1111-1111-1111-111111111111', 'Green Logistics Thailand', '0105560000011', 'ขนส่ง', 'contact@greenlogistics.co.th', 20),
('22222222-2222-2222-2222-222222222222', 'Siam Eco Manufacture', '0105560000022', 'การผลิต', 'info@siameco.com', 30)
ON CONFLICT DO NOTHING;

INSERT INTO credit_transactions (seller_company_id, buyer_company_id, amount_tco2e, price_per_ton, status)
SELECT '22222222-2222-2222-2222-222222222222', NULL, 50, 500, 'Open'
WHERE NOT EXISTS (SELECT 1 FROM credit_transactions WHERE status = 'Open');
