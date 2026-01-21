# HotspotPortal
structure 
hotspot-portal/
├── docker-compose.yml          # Main orchestration
├── db/
│   └── init.sql                # Database initialization
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   └── .env.example
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── nginx.conf
│   └── src/
│       └── App.jsx
├── portal/
│   ├── Dockerfile
│   ├── package.json
│   ├── nginx.conf
│   └── src/
│       └── App.jsx
├── payment/
│   ├── Dockerfile
│   └── package.json
├── nginx/
│   ├── nginx.conf
│   ├── captive.conf
│   └── ssl/
│       ├── cert.pem
│       └── key.pem
└── README.md
