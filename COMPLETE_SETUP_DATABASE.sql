-- Gold Touch List Lead System - Complete Database Setup
-- Run these commands in your Render PostgreSQL console
-- Database URL: postgresql://goldtouchlistdb_user:n13rn3x1BRZdzBFoM94VAj9ng8Unr8bB@dpg-d42idd7gi27c73c6lhlg-a/goldtouchlistdb

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS unlock_audit_log CASCADE;
DROP TABLE IF EXISTS unlocks CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS providers CASCADE;
DROP TABLE IF EXISTS auto_responses CASCADE;

-- Create providers table with string IDs (provider1, provider2, etc.)
CREATE TABLE providers (
    id VARCHAR(50) PRIMARY KEY,           -- provider1, provider2, etc.
    phone VARCHAR(20) NOT NULL UNIQUE,   -- Phone number for SMS
    email VARCHAR(255),                  -- Email address
    name VARCHAR(255) NOT NULL,          -- Provider name
    wordpress_user_id INTEGER,           -- Link to HivePress user
    slug VARCHAR(255),                   -- URL slug for forms
    first_lead_used BOOLEAN DEFAULT FALSE, -- First free lead tracking
    sms_opted_out BOOLEAN DEFAULT FALSE, -- SMS opt-out status
    is_verified BOOLEAN DEFAULT TRUE,    -- Verification status
    service_areas TEXT[],                -- Service areas array
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create leads table
CREATE TABLE leads (
    lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city VARCHAR(100) NOT NULL,
    service_type VARCHAR(100) NOT NULL,
    preferred_time_window TIMESTAMP,
    session_length VARCHAR(100),
    location_type VARCHAR(100),
    contactpref VARCHAR(100),
    budget_range VARCHAR(100),
    notes_snippet TEXT,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    client_email VARCHAR(255),
    exact_address TEXT,
    zip_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    is_closed BOOLEAN DEFAULT false
);

-- Create unlocks table
CREATE TABLE unlocks (
    lead_id UUID NOT NULL REFERENCES leads(lead_id),
    provider_id VARCHAR(50) NOT NULL REFERENCES providers(id),
    status VARCHAR(50) NOT NULL DEFAULT 'NEW_LEAD',
    idempotency_key VARCHAR(255) UNIQUE,
    checkout_session_id VARCHAR(255),
    payment_link_url TEXT,
    last_sent_at TIMESTAMP,
    unlocked_at TIMESTAMP,
    ttl_expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    teaser_sent_at TIMESTAMP,
    y_received_at TIMESTAMP,
    payment_link_sent_at TIMESTAMP,
    paid_at TIMESTAMP,
    revealed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lead_id, provider_id)
);

-- Create audit log table
CREATE TABLE unlock_audit_log (
    id SERIAL PRIMARY KEY,
    lead_id UUID REFERENCES leads(lead_id),
    provider_id VARCHAR(50) REFERENCES providers(id),
    event_type VARCHAR(50) NOT NULL,
    checkout_session_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create auto_responses table for unknown number handling
CREATE TABLE auto_responses (
    phone VARCHAR(20) PRIMARY KEY,
    first_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_leads_city ON leads(city);
CREATE INDEX idx_leads_service_type ON leads(service_type);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_expires_at ON leads(expires_at);
CREATE INDEX idx_unlocks_status ON unlocks(status);
CREATE INDEX idx_unlocks_ttl ON unlocks(ttl_expires_at);
CREATE INDEX idx_unlocks_provider ON unlocks(provider_id);
CREATE INDEX idx_unlocks_checkout_session ON unlocks(checkout_session_id);
CREATE INDEX idx_providers_phone ON providers(phone);
CREATE INDEX idx_providers_opted_out ON providers(sms_opted_out);
CREATE INDEX idx_providers_wordpress_user ON providers(wordpress_user_id);
CREATE INDEX idx_providers_slug ON providers(slug);
CREATE INDEX idx_audit_log_lead_provider ON unlock_audit_log(lead_id, provider_id);
CREATE INDEX idx_audit_log_event_type ON unlock_audit_log(event_type);
CREATE INDEX idx_audit_log_created_at ON unlock_audit_log(created_at);

-- Create function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_providers_updated_at 
    BEFORE UPDATE ON providers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_unlocks_updated_at 
    BEFORE UPDATE ON unlocks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial test providers
INSERT INTO providers (id, name, phone, email, service_areas, is_verified, sms_opted_out, first_lead_used)
VALUES 
    ('provider1', 'Lisa', '+17542806739', 'lisa@goldtouchlist.com', ARRAY['Miami', 'Hollywood', 'Fort Lauderdale'], true, false, false),
    ('provider2', 'Nara', '+13053169435', 'nara@goldtouchlist.com', ARRAY['Miami', 'Hollywood', 'Fort Lauderdale'], true, false, false),
    ('provider3', 'Maylin', '+13053180715', 'maylin@goldtouchlist.com', ARRAY['Miami', 'Hollywood', 'Fort Lauderdale'], true, false, false)
ON CONFLICT (id) DO NOTHING;

-- Show the providers that were created
SELECT id, name, phone, email, sms_opted_out, first_lead_used FROM providers ORDER BY id;

-- Show table structure
\d providers
\d leads  
\d unlocks

-- Show counts
SELECT 'providers' as table_name, COUNT(*) as count FROM providers
UNION ALL
SELECT 'leads' as table_name, COUNT(*) as count FROM leads
UNION ALL  
SELECT 'unlocks' as table_name, COUNT(*) as count FROM unlocks;
