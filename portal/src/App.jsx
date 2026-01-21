// portal/src/App.jsx
import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const UserPortal = () => {
  const [currentPage, setCurrentPage] = useState('welcome');
  const [userData, setUserData] = useState(null);

  return (
    <div className="portal-container">
      {currentPage === 'welcome' && (
        <WelcomePage onNavigate={setCurrentPage} />
      )}
      {currentPage === 'register' && (
        <RegisterPage onNavigate={setCurrentPage} />
      )}
      {currentPage === 'login' && (
        <LoginPage onNavigate={setCurrentPage} setUserData={setUserData} />
      )}
      {currentPage === 'redeem' && (
        <RedeemVoucherPage onNavigate={setCurrentPage} />
      )}
      {currentPage === 'dashboard' && userData && (
        <UserDashboard user={userData} onNavigate={setCurrentPage} />
      )}
    </div>
  );
};

const WelcomePage = ({ onNavigate }) => {
  return (
    <div className="page welcome-page">
      <div className="welcome-card">
        <div className="welcome-header">
          <h1>🌐 Welcome to WiFi Hotspot</h1>
          <p>Fast, Secure, and Reliable Internet Access</p>
        </div>

        <div className="welcome-features">
          <div className="feature">
            <span className="icon">⚡</span>
            <h3>High Speed</h3>
            <p>Ultra-fast connectivity</p>
          </div>
          <div className="feature">
            <span className="icon">🔒</span>
            <h3>Secure</h3>
            <p>Encrypted connections</p>
          </div>
          <div className="feature">
            <span className="icon">💰</span>
            <h3>Affordable</h3>
            <p>Flexible pricing plans</p>
          </div>
        </div>

        <div className="welcome-actions">
          <button className="btn primary" onClick={() => onNavigate('login')}>
            Login to Existing Account
          </button>
          <button className="btn secondary" onClick={() => onNavigate('register')}>
            Create New Account
          </button>
          <button className="btn secondary" onClick={() => onNavigate('redeem')}>
            Redeem Voucher
          </button>
        </div>

        <div className="welcome-info">
          <h3>Need Help?</h3>
          <p>📧 Email: support@hotspot.local</p>
          <p>📞 Phone: +1-800-HOTSPOT</p>
        </div>
      </div>
    </div>
  );
};

const RegisterPage = ({ onNavigate }) => {
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      });

      localStorage.setItem('token', response.data.token);
      onNavigate('dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <div className="page register-page">
      <div className="form-card">
        <h2>Create Account</h2>
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="your@email.com"
            />
          </div>

          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Enter password"
            />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              required
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Confirm password"
            />
          </div>

          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="form-footer">
          Already have an account? 
          <button className="link-btn" onClick={() => onNavigate('login')}>
            Login here
          </button>
        </p>
      </div>
    </div>
  );
};

const LoginPage = ({ onNavigate, setUserData }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, formData);
      localStorage.setItem('token', response.data.token);
      setUserData(response.data.user);
      onNavigate('dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div className="page login-page">
      <div className="form-card">
        <h2>Login</h2>
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="your@email.com"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Enter password"
            />
          </div>

          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="form-footer">
          Don't have an account?
          <button className="link-btn" onClick={() => onNavigate('register')}>
            Register here
          </button>
        </p>
      </div>
    </div>
  );
};

const RedeemVoucherPage = ({ onNavigate }) => {
  const [formData, setFormData] = useState({
    code: '',
    username: '',
    email: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(`${API_URL}/api/vouchers/redeem`, formData);
      setSuccess('Voucher redeemed successfully! Check your email for details.');
      setFormData({ code: '', username: '', email: '', phone: '' });
      setTimeout(() => onNavigate('welcome'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to redeem voucher');
    }
    setLoading(false);
  };

  return (
    <div className="page redeem-page">
      <div className="form-card">
        <h2>Redeem Voucher</h2>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Voucher Code</label>
            <input
              type="text"
              required
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="Enter voucher code"
            />
          </div>

          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Choose username"
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="your@email.com"
            />
          </div>

          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Redeeming...' : 'Redeem Voucher'}
          </button>
        </form>
      </div>
    </div>
  );
};

const UserDashboard = ({ user, onNavigate }) => {
  const [userStats, setUserStats] = useState(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/users/stats/${user.username}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUserStats(response.data);
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
      setLoading(false);
    };

    fetchStats();
  }, [user]);

  return (
    <div className="page dashboard-page">
      <div className="dashboard-container">
        <h2>Welcome, {user.email}!</h2>

        {userStats && (
          <div className="stats-grid">
            <StatBox
              title="Bandwidth Used"
              value={`${(userStats.dbUser?.bandwidth_used / 1024 / 1024 / 1024).toFixed(2)} GB`}
              limit={`${userStats.dbUser?.bandwidth_limit} GB`}
            />
            <StatBox
              title="Account Status"
              value={userStats.dbUser?.status || 'Active'}
            />
            <StatBox
              title="Expires"
              value={new Date(userStats.dbUser?.expiry_date).toLocaleDateString()}
            />
          </div>
        )}

        <div className="dashboard-actions">
          <button className="btn secondary" onClick={() => {
            localStorage.removeItem('token');
            onNavigate('welcome');
          }}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

const StatBox = ({ title, value, limit }) => (
  <div className="stat-box">
    <h3>{title}</h3>
    <p className="stat-value">{value}</p>
    {limit && <p className="stat-limit">Limit: {limit}</p>}
  </div>
);

export default UserPortal;
