ALTER TABLE profiles
ADD COLUMN tax_number TEXT;

CREATE UNIQUE INDEX idx_profiles_tax_number
ON profiles(tax_number)
WHERE tax_number IS NOT NULL;
