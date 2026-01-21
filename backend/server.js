// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const redis = require('redis');
const axios = require('axios');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Database Connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Redis Connection
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});
redisClient.connect();

// Email Service
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// SMS Service (Twilio)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Mikrotik REST API Client
class MikrotikClient {
  constructor(host, user, pass) {
    this.host = host;
    this.user = user;
    this.pass = pass;
    this.baseURL = `http://${host}:8728/rest`;
  }

  async request(path, method = 'GET', data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${path}`,
        auth: { username: this.user, password: this.pass },
      };
      if (data) config.data = data;
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('Mikrotik API Error:', error.message);
      throw error;
    }
  }

  async getUsers() {
    return this.request('/ip/hotspot/user');
  }

  async createUser(data) {
    return this.request('/ip/hotspot/user', 'POST', data);
  }

  async getUserStats(username) {
    return this.request(`/ip/hotspot/stat?numbers=${username}`);
  }

  async getAccessPoints() {
    return this.request('/interface/wireless');
  }

  async getRouters() {
    return this.request('/system/identity');
  }

  async addRadiusUser(data) {
    return this.request('/radius/user', 'POST', data);
  }

  async updateUserBandwidth(username, bandwidth) {
    return this.request(`/ip/hotspot/user/${username}`, 'PATCH', {
      'limit-bytes-out': bandwidth,
    });
  }
}

const mikrotik = new MikrotikClient(
  process.env.MIKROTIK_HOST,
  process.env.MIKROTIK_USER,
  process.env.MIKROTIK_PASS
);

// ==================== AUTHENTICATION ====================

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== USER AUTHENTICATION ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, phone } = req.body;
    const hashedPassword = require('bcryptjs').hashSync(password, 10);

    const result = await pool.query(
      'INSERT INTO users (email, password, phone, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, email',
      [email, hashedPassword, phone]
    );

    const token = generateToken(result.rows[0]);
    res.status(201).json({ user: result.rows[0], token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const passwordMatch = require('bcryptjs').compareSync(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    res.json({ user: { id: user.id, email: user.email }, token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== VOUCHER MANAGEMENT ====================

app.post('/api/vouchers/create', authMiddleware, async (req, res) => {
  try {
    const { code, days, price, bandwidth } = req.body;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    const result = await pool.query(
      `INSERT INTO vouchers (code, days, price, bandwidth, expiry_date, created_by, created_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'active')
       RETURNING *`,
      [code, days, price, bandwidth, expiryDate, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vouchers', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vouchers WHERE created_by = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vouchers/redeem', async (req, res) => {
  try {
    const { code, username, email, phone } = req.body;

    const voucherResult = await pool.query(
      'SELECT * FROM vouchers WHERE code = $1 AND status = $2',
      [code, 'active']
    );

    if (voucherResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid voucher' });
    }

    const voucher = voucherResult.rows[0];
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + voucher.days);

    // Create hotspot user in Mikrotik
    await mikrotik.createUser({
      name: username,
      password: Math.random().toString(36).substring(7),
      'limit-bytes-out': voucher.bandwidth * 1024 * 1024 * 1024,
      'limit-uptime': voucher.days * 24 * 60 * 60,
    });

    // Create user in database
    const userResult = await pool.query(
      `INSERT INTO hotspot_users (username, email, phone, bandwidth_limit, expiry_date, voucher_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [username, email, phone, voucher.bandwidth, expiryDate, voucher.id]
    );

    // Update voucher status
    await pool.query('UPDATE vouchers SET status = $1, redeemed_at = NOW() WHERE id = $2', [
      'redeemed',
      voucher.id,
    ]);

    // Send notifications
    await mailer.sendMail({
      to: email,
      subject: 'Hotspot Account Created',
      html: `<h2>Welcome!</h2><p>Your account has been created. Username: ${username}</p>`,
    });

    res.json({ success: true, user: userResult.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== USER MANAGEMENT ====================

app.get('/api/users/stats/:username', async (req, res) => {
  try {
    const stats = await mikrotik.getUserStats(req.params.username);
    const dbUser = await pool.query(
      'SELECT * FROM hotspot_users WHERE username = $1',
      [req.params.username]
    );

    res.json({
      mikrotikStats: stats,
      dbUser: dbUser.rows[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM hotspot_users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BANDWIDTH MANAGEMENT ====================

app.post('/api/bandwidth/update', authMiddleware, async (req, res) => {
  try {
    const { username, bandwidth } = req.body;
    const bandwidthBytes = bandwidth * 1024 * 1024 * 1024;

    // Update in Mikrotik
    await mikrotik.updateUserBandwidth(username, bandwidthBytes);

    // Update in database
    const result = await pool.query(
      'UPDATE hotspot_users SET bandwidth_limit = $1 WHERE username = $2 RETURNING *',
      [bandwidth, username]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NETWORK MONITORING ====================

app.get('/api/network/status', authMiddleware, async (req, res) => {
  try {
    const accessPoints = await mikrotik.getAccessPoints();
    const routerInfo = await mikrotik.getRouters();
    const allUsers = await pool.query('SELECT COUNT(*) as count FROM hotspot_users');

    res.json({
      accessPoints,
      routerInfo,
      totalUsers: allUsers.rows[0].count,
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SMS NOTIFICATIONS ====================

app.post('/api/notify/sms', authMiddleware, async (req, res) => {
  try {
    const { phone, message } = req.body;
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to: phone,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== EMAIL NOTIFICATIONS ====================

app.post('/api/notify/email', authMiddleware, async (req, res) => {
  try {
    const { email, subject, html } = req.body;
    await mailer.sendMail({ to: email, subject, html });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PAYMENT WEBHOOK ====================

app.post('/api/payment/webhook', async (req, res) => {
  try {
    const { event_type, data } = req.body;

    if (event_type === 'payment_success') {
      await pool.query(
        'UPDATE vouchers SET status = $1, paid = true WHERE id = $2',
        ['active', data.voucher_id]
      );
    }

    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend API running on port ${PORT}`);
});
