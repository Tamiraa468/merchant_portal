-- Create products table for merchant product management
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    unit TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create index on org_id for faster queries
CREATE INDEX IF NOT EXISTS idx_products_org_id ON products(org_id);

-- Create index on is_active for filtering
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see products from their organization
CREATE POLICY "Users can view products from their organization" ON products
    FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Users can insert products into their organization
CREATE POLICY "Users can insert products into their organization" ON products
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT org_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Users can update products in their organization
CREATE POLICY "Users can update products in their organization" ON products
    FOR UPDATE
    USING (
        org_id IN (
            SELECT org_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Users can delete products in their organization
CREATE POLICY "Users can delete products in their organization" ON products
    FOR DELETE
    USING (
        org_id IN (
            SELECT org_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on update
DROP TRIGGER IF EXISTS products_updated_at_trigger ON products;
CREATE TRIGGER products_updated_at_trigger
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_products_updated_at();
