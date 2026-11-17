ALTER TABLE app_accounts
    DROP CONSTRAINT app_accounts_role_check,
    DROP CONSTRAINT app_accounts_check;

UPDATE app_accounts SET role = 'Company' WHERE role IN ('Partner', 'Customer');

ALTER TABLE app_accounts
    ADD CONSTRAINT app_accounts_role_check CHECK (role IN ('Admin', 'Company', 'Viewer')),
    ADD CONSTRAINT app_accounts_company_role_check CHECK ((role = 'Company') = (company_id IS NOT NULL));

INSERT INTO app_accounts (email, name, role, password_salt, password_hash)
VALUES ('viewer@demo.com', 'ผู้ชมทั่วไป', 'Viewer',
        decode('a4a12199bcebd3feaafe7dcc10eba34d', 'hex'),
        decode('67bff68bf69f4a3514185f0b3d5f9e6f0273873bf37ca016385f6356f19a4380b3af89d30e9a03aa7deaa6166278fcbc7a363ac63ea2df5fb56200628fee6a05', 'hex'));
