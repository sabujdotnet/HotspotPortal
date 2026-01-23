-- init-db/01-schema.sql
-- Hotspot Portal Database Schema

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS uuid-ossp;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Admin Users Table
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'operator', -- admin, manager, operator
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hotspot Users Table (End Users)
CREATE TABLE hotspot_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    password_hash VARCHAR(255),
    mac_address VARCHAR(17),
    status VARCHAR(50) DEFAULT 'active', -- active, suspended, expired
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_login TIMESTAMP,
    total_bandwidth_gb DECIMAL(10,2) DEFAULT 0,
    used_bandwidth_gb DECIMAL(10,2) DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    notes TEXT
);

-- Vouchers Table
CREATE TABLE vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_code VARCHAR(50) UNIQUE NOT NULL,
    batch_id VARCHAR(100),
    duration_days INT,
    bandwidth_gb INT,
    price DECIMAL(10,2) DEFAULT 0,
    is_used BOOLEAN DEFAULT false,
    used_by_user_id UUID REFERENCES hotspot_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP,
    expires_at TIMESTAMP,
    notes TEXT
);

-- Connected Devices & APs Table
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50), -- router, access_point, repeater
    mac_address VARCHAR(17) UNIQUE,
    ip_address INET,
    subnet CIDR,
    mikrotik_identity VARCHAR(255), -- MikroTik identity string
    status VARCHAR(50) DEFAULT 'online', -- online, offline
    signal_strength INT, -- for WiFi devices
    client_count INT DEFAULT 0,
    total_bandwidth_gb DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    location VARCHAR(255),
    notes TEXT
);

-- Bandwidth Logs (Real-time Usage)
CREATE TABLE bandwidth_logs (
    i
