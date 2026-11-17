CREATE TABLE emission_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL,
    company_id UUID NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('ELECTRICITY', 'DIESEL', 'GASOLINE', 'WATER')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    carbon_ton_equivalent NUMERIC(12,4) NOT NULL CHECK (carbon_ton_equivalent >= 0),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    document_number VARCHAR(100) NOT NULL CHECK (TRIM(document_number) <> ''),
    notes VARCHAR(2000) NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    submitted_by UUID NOT NULL REFERENCES app_accounts(id),
    reviewed_by UUID REFERENCES app_accounts(id),
    reviewed_at TIMESTAMPTZ,
    review_reason VARCHAR(2000) NOT NULL DEFAULT '',
    record_id UUID UNIQUE REFERENCES emission_records(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (year, company_id) REFERENCES ets_allocations(year, company_id),
    CHECK (period_start <= period_end),
    CHECK (EXTRACT(YEAR FROM period_start) = year AND EXTRACT(YEAR FROM period_end) = year),
    CHECK ((status = 'Approved') = (record_id IS NOT NULL))
);
CREATE UNIQUE INDEX idx_emission_document_once
    ON emission_submissions(company_id, activity_type, UPPER(TRIM(document_number)))
    WHERE status IN ('Pending', 'Approved');
CREATE INDEX idx_emission_submission_year ON emission_submissions(year, company_id, status);

CREATE TABLE emission_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL REFERENCES emission_submissions(id),
    filename VARCHAR(200) NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
    content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_emission_evidence_submission ON emission_evidence(submission_id);
