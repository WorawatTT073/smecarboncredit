ALTER TABLE ets_listings DROP CONSTRAINT ets_listings_check1;
ALTER TABLE ets_listings ADD CONSTRAINT ets_listings_status_check CHECK (
 (status IN ('Pending', 'Open', 'Rejected', 'Cancelled') AND remaining_tco2e > 0)
 OR (status = 'Completed' AND remaining_tco2e = 0)
);
ALTER TABLE ets_listings ALTER COLUMN status SET DEFAULT 'Pending';
ALTER TABLE ets_listings ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE ets_listings ADD COLUMN reviewed_by UUID REFERENCES app_accounts(id);
ALTER TABLE ets_listings ADD COLUMN reviewed_at TIMESTAMPTZ;
