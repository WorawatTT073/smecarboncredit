CREATE TABLE app_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(254) NOT NULL UNIQUE CHECK (email = LOWER(TRIM(email)) AND email <> ''),
    name VARCHAR(100) NOT NULL CHECK (TRIM(name) <> ''),
    role TEXT NOT NULL CHECK (role IN ('Admin', 'Partner', 'Customer')),
    company_id UUID REFERENCES companies(id),
    password_salt BYTEA NOT NULL UNIQUE CHECK (octet_length(password_salt) = 16),
    password_hash BYTEA NOT NULL CHECK (octet_length(password_hash) = 64),
    session_version INTEGER NOT NULL DEFAULT 0 CHECK (session_version >= 0),
    CHECK ((role = 'Admin') = (company_id IS NULL))
);

-- The existing demo logins are seeded once. Password changes generate a new salt.
INSERT INTO app_accounts (email, name, role, company_id, password_salt, password_hash)
VALUES
    ('admin@demo.com', 'Demo Admin', 'Admin', NULL,
     decode('51edcc51d01592e74edc632a3ebffe66', 'hex'),
     decode('55707f71fa67cc0a43ef426757dcd09e4a44108c33a0a176ba69f5a3323e2e9021438dfdf4b8f665e8ecd408253c6dbd02e357b707dfe3bc312814ea8c1fb02f', 'hex')),
    ('partner@demo.com', 'บริษัท A · Green Logistics Thailand', 'Partner', '11111111-1111-1111-1111-111111111111',
     decode('361990307c8f2976bea3bbfb6ceeb81d', 'hex'),
     decode('f1c8ceacffc9ec806da6ca82005430001e5f446934be84af7aaeb01787354fc2a1c4d10ef226422c1371194ea2da50c637fd21c2cdfab84341318ba31c46f32a', 'hex')),
    ('customer@demo.com', 'บริษัท B · Siam Eco Manufacture', 'Customer', '22222222-2222-2222-2222-222222222222',
     decode('761ffd72d9712fe539dc9eb8c79a5ee3', 'hex'),
     decode('c541eda5a590d01479b190556be2fc8f147b4e0c15dbd1b4caa206d35b98b9ca1454376862f6ede103d8bc6fc60cb1225fbc51dd5a0572d55aaaf11d8a5e4c2e', 'hex'));
