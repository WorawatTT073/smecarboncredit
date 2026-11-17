ALTER TABLE ets_listings
    ADD COLUMN contact_name VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN contact_email VARCHAR(254) NOT NULL DEFAULT '',
    ADD COLUMN contact_phone VARCHAR(50) NOT NULL DEFAULT '',
    ADD COLUMN review_reason VARCHAR(2000) NOT NULL DEFAULT '';

CREATE TABLE listing_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES ets_listings(id),
    filename VARCHAR(200) NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
    content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_listing_evidence_listing ON listing_evidence(listing_id);

CREATE TABLE credit_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL,
    company_id UUID NOT NULL,
    before_tco2e NUMERIC(12,4) NOT NULL CHECK (before_tco2e >= 0),
    after_tco2e NUMERIC(12,4) NOT NULL CHECK (after_tco2e >= 0),
    action TEXT NOT NULL CHECK (action IN ('initial', 'set', 'add', 'subtract')),
    reason VARCHAR(2000) NOT NULL CHECK (TRIM(reason) <> ''),
    changed_by UUID NOT NULL REFERENCES app_accounts(id),
    actor_name VARCHAR(100) NOT NULL,
    actor_email VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (year, company_id) REFERENCES ets_allocations(year, company_id)
);
CREATE INDEX idx_credit_adjustments_year ON credit_adjustments(year, created_at DESC);

CREATE FUNCTION prevent_credit_history_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Credit adjustment history is append-only';
END;
$$;
CREATE TRIGGER credit_history_append_only
    BEFORE UPDATE OR DELETE ON credit_adjustments
    FOR EACH ROW EXECUTE FUNCTION prevent_credit_history_changes();
