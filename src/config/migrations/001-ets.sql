CREATE TABLE ets_rounds (
    year INTEGER PRIMARY KEY CHECK (year BETWEEN 1900 AND 9998),
    status TEXT NOT NULL DEFAULT 'Reporting' CHECK (status IN ('Reporting', 'Trading', 'Closed')),
    verified_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

CREATE TABLE ets_allocations (
    year INTEGER NOT NULL REFERENCES ets_rounds(year),
    company_id UUID NOT NULL REFERENCES companies(id),
    amount_tco2e NUMERIC(12,4) NOT NULL CHECK (amount_tco2e >= 0),
    PRIMARY KEY (year, company_id)
);

CREATE TABLE ets_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL,
    seller_company_id UUID NOT NULL,
    amount_tco2e NUMERIC(12,4) NOT NULL CHECK (amount_tco2e > 0),
    remaining_tco2e NUMERIC(12,4) NOT NULL CHECK (remaining_tco2e BETWEEN 0 AND amount_tco2e),
    price_per_ton NUMERIC(10,2) NOT NULL CHECK (price_per_ton > 0),
    status TEXT NOT NULL DEFAULT 'Open' CHECK (
        (status IN ('Open', 'Cancelled') AND remaining_tco2e > 0)
        OR (status = 'Completed' AND remaining_tco2e = 0)
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (year, seller_company_id) REFERENCES ets_allocations(year, company_id),
    UNIQUE (id, year, seller_company_id)
);

ALTER TABLE credit_transactions ADD COLUMN ets_year INTEGER;
ALTER TABLE credit_transactions ADD COLUMN ets_listing_id UUID;
ALTER TABLE credit_transactions ADD CONSTRAINT ets_trade_requires_listing CHECK (
    (ets_year IS NULL AND ets_listing_id IS NULL)
    OR (ets_year IS NOT NULL AND ets_listing_id IS NOT NULL AND status = 'Completed')
);
ALTER TABLE credit_transactions ADD FOREIGN KEY (ets_listing_id, ets_year, seller_company_id)
    REFERENCES ets_listings(id, year, seller_company_id);
ALTER TABLE credit_transactions ADD FOREIGN KEY (ets_year, buyer_company_id)
    REFERENCES ets_allocations(year, company_id);

CREATE INDEX idx_emission_company_date ON emission_records(company_id, record_date);
CREATE INDEX idx_ets_listings_year_seller ON ets_listings(year, seller_company_id) WHERE status = 'Open';
CREATE INDEX idx_ets_trades_seller ON credit_transactions(ets_year, seller_company_id) WHERE ets_year IS NOT NULL;
CREATE INDEX idx_ets_trades_buyer ON credit_transactions(ets_year, buyer_company_id) WHERE ets_year IS NOT NULL;

CREATE VIEW ets_company_balances AS
SELECT totals.*,
       amount_tco2e + bought_tco2e - sold_tco2e - emitted_tco2e AS balance_tco2e,
       GREATEST(0, amount_tco2e + bought_tco2e - sold_tco2e - emitted_tco2e - reserved_tco2e) AS available_tco2e,
       GREATEST(0, emitted_tco2e + sold_tco2e - amount_tco2e - bought_tco2e) AS deficit_tco2e
FROM (
    SELECT a.year, a.company_id, c.name AS company_name, a.amount_tco2e,
           COALESCE((
               SELECT SUM(e.carbon_ton_equivalent) FROM emission_records e
               WHERE e.company_id = a.company_id
                 AND e.record_date >= make_date(a.year, 1, 1)
                 AND e.record_date < make_date(a.year + 1, 1, 1)
           ), 0) AS emitted_tco2e,
           COALESCE((
               SELECT SUM(t.amount_tco2e) FROM credit_transactions t
               WHERE t.ets_year = a.year AND t.buyer_company_id = a.company_id
           ), 0) AS bought_tco2e,
           COALESCE((
               SELECT SUM(t.amount_tco2e) FROM credit_transactions t
               WHERE t.ets_year = a.year AND t.seller_company_id = a.company_id
           ), 0) AS sold_tco2e,
           COALESCE((
               SELECT SUM(l.remaining_tco2e) FROM ets_listings l
               WHERE l.year = a.year AND l.seller_company_id = a.company_id AND l.status = 'Open'
           ), 0) AS reserved_tco2e
    FROM ets_allocations a JOIN companies c ON c.id = a.company_id
) totals;

INSERT INTO ets_rounds (year) VALUES (2026);

INSERT INTO ets_allocations (year, company_id, amount_tco2e)
SELECT 2026, id, 100 FROM companies WHERE id IN (
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'
);

INSERT INTO emission_records (company_id, activity_type, amount, carbon_ton_equivalent, record_date)
SELECT a.company_id, 'ELECTRICITY', seed.amount, seed.emitted_tco2e, DATE '2026-01-01'
FROM ets_allocations a
JOIN (VALUES
    ('11111111-1111-1111-1111-111111111111'::uuid, 160032.01, 80),
    ('22222222-2222-2222-2222-222222222222'::uuid, 230046.01, 115)
) AS seed(company_id, amount, emitted_tco2e) USING (company_id)
WHERE a.year = 2026 AND NOT EXISTS (
    SELECT 1 FROM emission_records e
    WHERE e.company_id = a.company_id AND e.record_date >= '2026-01-01' AND e.record_date < '2027-01-01'
);
