// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <Router>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Main Routes */}
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/dashboard" element={<AdminDashboard />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/vouchers" element={<VouchersPage />} />
        <Route path="/bandwidth" element={<BandwidthPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        
        {/* Catch all - 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const Dashboard = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [networkStatus, setNetworkStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Login Handler
  const handleLogin = async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      });
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
      setIsLoggedIn(true);
    } catch (error) {
      alert('Login failed: ' + error.response?.data?.error);
    }
  };

  // Fetch Network Status
  const fetchNetworkStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/network/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNetworkStatus(response.data);
    } catch (error) {
      console.error('Error fetching network status:', error);
    }
  };

  // Fetch Users
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
    setLoading(false);
  };

  // Fetch Vouchers
  const fetchVouchers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/vouchers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVouchers(response.data);
    } catch (error) {
      console.error('Error fetching vouchers:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
      fetchNetworkStatus();
    }
  }, []);

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="navbar-brand">WiFi Hotspot Portal</div>
        <div className="navbar-menu">
          <button
            className={activeTab === 'dashboard' ? 'active' : ''}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={activeTab === 'users' ? 'active' : ''}
            onClick={() => {
              setActiveTab('users');
              fetchUsers();
            }}
          >
            Users
          </button>
          <button
            className={activeTab === 'vouchers' ? 'active' : ''}
            onClick={() => {
              setActiveTab('vouchers');
              fetchVouchers();
            }}
          >
            Vouchers
          </button>
          <button
            className={activeTab === 'bandwidth' ? 'active' : ''}
            onClick={() => setActiveTab('bandwidth')}
          >
            Bandwidth
          </button>
          <button
            className={activeTab === 'network' ? 'active' : ''}
            onClick={() => {
              setActiveTab('network');
              fetchNetworkStatus();
            }}
          >
            Network
          </button>
          <button onClick={() => {
            localStorage.removeItem('token');
            setIsLoggedIn(false);
          }}>
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-content">
        {activeTab === 'dashboard' && <DashboardTab networkStatus={networkStatus} />}
        {activeTab === 'users' && <UsersTab users={users} />}
        {activeTab === 'vouchers' && <VouchersTab vouchers={vouchers} onRefresh={fetchVouchers} />}
        {activeTab === 'bandwidth' && <BandwidthTab users={users} />}
        {activeTab === 'network' && <NetworkTab networkStatus={networkStatus} />}
      </div>
    </div>
  );
};

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState('admin@hotspot.local');
  const [password, setPassword] = useState('admin123');

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>WiFi Hotspot Portal</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onLogin(email, password);
          }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Login</button>
        </form>
      </div>
    </div>
  );
};

const DashboardTab = ({ networkStatus }) => {
  return (
    <div className="tab-content">
      <h2>Dashboard Overview</h2>
      <div className="stats-grid">
        <StatCard
          title="Total Users"
          value={networkStatus?.totalUsers || 0}
          icon="👥"
        />
        <StatCard
          title="Active APs"
          value={networkStatus?.accessPoints?.length || 0}
          icon="📡"
        />
        <StatCard
          title="System Status"
          value="Online"
          icon="✅"
        />
        <StatCard
          title="Bandwidth Used"
          value="2.5 TB"
          icon="📊"
        />
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon }) => (
  <div className="stat-card">
    <div className="stat-icon">{icon}</div>
    <div className="stat-title">{title}</div>
    <div className="stat-value">{value}</div>
  </div>
);

const UsersTab = ({ users }) => {
  return (
    <div className="tab-content">
      <h2>Connected Users</h2>
      <table className="users-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Expiry Date</th>
            <th>Bandwidth Used</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.username}</td>
              <td>{user.email || '-'}</td>
              <td>{user.phone || '-'}</td>
              <td><span className={`status ${user.status}`}>{user.status}</span></td>
              <td>{new Date(user.expiry_date).toLocaleDateString()}</td>
              <td>{(user.bandwidth_used / 1024 / 1024 / 1024).toFixed(2)} GB</td>
              <td>
                <button className="btn-small">Edit</button>
                <button className="btn-small danger">Block</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const VouchersTab = ({ vouchers, onRefresh }) => {
  const [newVoucher, setNewVoucher] = useState({
    code: '',
    days: 7,
    price: 10,
    bandwidth: 5,
  });

  const handleCreateVoucher = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/vouchers/create`, newVoucher, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Voucher created successfully!');
      onRefresh();
      setNewVoucher({ code: '', days: 7, price: 10, bandwidth: 5 });
    } catch (error) {
      alert('Error creating voucher: ' + error.response?.data?.error);
    }
  };

  return (
    <div className="tab-content">
      <h2>Voucher Management</h2>
      <div className="form-section">
        <h3>Create New Voucher</h3>
        <div className="form-group">
          <input
            type="text"
            placeholder="Voucher Code"
            value={newVoucher.code}
            onChange={(e) => setNewVoucher({ ...newVoucher, code: e.target.value })}
          />
          <input
            type="number"
            placeholder="Days"
            value={newVoucher.days}
            onChange={(e) => setNewVoucher({ ...newVoucher, days: parseInt(e.target.value) })}
          />
          <input
            type="number"
            placeholder="Price (USD)"
            value={newVoucher.price}
            onChange={(e) => setNewVoucher({ ...newVoucher, price: parseFloat(e.target.value) })}
          />
          <input
            type="number"
            placeholder="Bandwidth (GB)"
            value={newVoucher.bandwidth}
            onChange={(e) => setNewVoucher({ ...newVoucher, bandwidth: parseInt(e.target.value) })}
          />
          <button onClick={handleCreateVoucher}>Create Voucher</button>
        </div>
      </div>

      <table className="vouchers-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Days</th>
            <th>Bandwidth</th>
            <th>Price</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {vouchers.map((voucher) => (
            <tr key={voucher.id}>
              <td>{voucher.code}</td>
              <td>{voucher.days}</td>
              <td>{voucher.bandwidth} GB</td>
              <td>${voucher.price}</td>
              <td><span className={`status ${voucher.status}`}>{voucher.status}</span></td>
              <td>{new Date(voucher.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const BandwidthTab = ({ users }) => {
  return (
    <div className="tab-content">
      <h2>Bandwidth Management</h2>
      <p>Manage and monitor bandwidth allocation for users</p>
      {/* Implementation for bandwidth adjustment */}
    </div>
  );
};

const NetworkTab = ({ networkStatus }) => {
  return (
    <div className="tab-content">
      <h2>Network Devices</h2>
      {networkStatus && (
        <div>
          <h3>Access Points</h3>
          <div className="device-list">
            {networkStatus.accessPoints?.map((ap, i) => (
              <div key={i} className="device-card">
                <p><strong>Name:</strong> {ap.name || 'Unknown'}</p>
                <p><strong>Status:</strong> <span className="status online">Online</span></p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
