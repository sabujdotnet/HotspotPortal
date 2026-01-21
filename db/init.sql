-- db/init.sql
-- Create Extensions
CREATE EXTENSION IF NOT EXISTS uuid-ossp;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users Table (Admin/Staff)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- Hotspot Users Table
CREATE TABLE IF NOT EXISTS hotspot_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  password VARCHAR(255),
  bandwidth_limit BIGINT,
  bandwidth_used BIGINT DEFAULT 0,
  session_duration INT DEFAULT 0,
  expiry_date TIMESTAMP,
  last_login TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  voucher_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vouchers Table
CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(255) UNIQUE NOT NULL,
  days INT NOT NULL,
  price DECIMAL(10, 2),
  bandwidth INT,
  expiry_date TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  redeemed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  paid BOOLEAN DEFAULT FALSE
);

-- Session Logs Table
CREATE TABLE IF NOT EXISTS session_logs (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) REFERENCES hotspot_users(username),
  ip_address INET,
  mac_address VARCHAR(17),
  login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  logout_time TIMESTAMP,
  bytes_download BIGINT DEFAULT 0,
  bytes_upload BIGINT DEFAULT 0,
  duration INT,
  status VARCHAR(50)
);

-- Bandwidth Usage Tracking
CREATE TABLE IF NOT EXISTS bandwidth_usage (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) REFERENCES hotspot_users(username),
  date DATE DEFAULT CURRENT_DATE,
  bytes_download BIGINT DEFAULT 0,
  bytes_upload BIGINT DEFAULT 0,
  total_bytes BIGINT GENERATED ALWAYS AS (bytes_download + bytes_upload) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Network Devices (Access Points/Routers)
CREATE TABLE IF NOT EXISTS network_devices (
  id SERIAL PRIMARY KEY,
  device_name VARCHAR(255) NOT NULL,
  device_type VARCHAR(50),
  ip_address INET,
  mac_address VARCHAR(17),
  model VARCHAR(255),
  firmware VARCHAR(255),
  status VARCHAR(50) DEFAULT 'online',
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  amount DECIMAL(10, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50),
  transaction_id VARCHAR(255) UNIQUE,
  stripe_payment_id VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications Log
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  hotspot_user_id INT REFERENCES hotspot_users(id),
  type VARCHAR(50),
  channel VARCHAR(50),
  subject VARCHAR(255),
  message TEXT,
  recipient VARCHAR(255),
  status VARCHAR(50) DEFAULT 'sent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Settings
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_hotspot_users_username ON hotspot_users(username);
CREATE INDEX idx_hotspot_users_status ON hotspot_users(status);
CREATE INDEX idx_vouchers_code ON vouchers(code);
CREATE INDEX idx_vouchers_status ON vouchers(status);
CREATE INDEX idx_session_logs_username ON session_logs(username);
CREATE INDEX idx_session_logs_login_time ON session_logs(login_time);
CREATE INDEX idx_bandwidth_usage_username ON bandwidth_usage(username);
CREATE INDEX idx_bandwidth_usage_date ON bandwidth_usage(date);
CREATE INDEX idx_network_devices_status ON network_devices(status);
CREATE INDEX idx_payments_status ON payments(status);

-- Insert Default Admin User
INSERT INTO users (email, password, role) 
VALUES ('admin@hotspot.local', crypt('admin123', gen_salt('bf')), 'admin')
ON CONFLICT DO NOTHING;

-- Insert Default Settings
INSERT INTO settings (key, value, description) VALUES
('default_bandwidth', '5', 'Default bandwidth in GB'),
('max_bandwidth', '100', 'Maximum bandwidth per user in GB'),
('session_timeout', '3600', 'Session timeout in seconds'),
('currency', 'USD', 'Default currency'),
('support_email', 'support@hotspot.local', 'Support email address')
ON CONFLICT DO NOTHING;
