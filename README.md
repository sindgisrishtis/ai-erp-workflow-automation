# NexusERP — AI-Powered ERP Workflow Automation Platform

NexusERP is a modern enterprise workflow automation platform designed to streamline inventory operations, purchase approvals, task management, and operational analytics through an AI-enabled ERP architecture.

The platform combines scalable backend engineering, enterprise-grade authentication, workflow orchestration, and intelligent operational monitoring into a unified full-stack system.

---

## 🚀 Overview

This project focuses on building a scalable ERP ecosystem with:

- Enterprise workflow automation
- Inventory intelligence
- Purchase order approval pipelines
- Role-based access control (RBAC)
- Operational analytics dashboards
- AI-assisted workflow insights
- Audit logging and compliance tracking

The architecture follows production-oriented backend engineering practices using modular services, Prisma ORM, PostgreSQL, and Express.js.

---

## 🏗️ Architecture

```text
Frontend (React + Vite)
        ↓
REST APIs (Express.js)
        ↓
Prisma ORM
        ↓
PostgreSQL Database
```

---

## ⚙️ Tech Stack

### Frontend
- React.js
- Vite
- Tailwind CSS
- Recharts
- Axios

### Backend
- Node.js
- Express.js
- Prisma ORM
- PostgreSQL
- JWT Authentication
- Express Validator
- Winston Logging

### Database
- PostgreSQL
- Prisma Migrations
- Prisma Studio

---

## ✨ Core Features

### Authentication & Security
- JWT Access + Refresh Tokens
- Role-Based Access Control (RBAC)
- Secure password hashing with bcrypt
- Protected API routes
- Structured error handling
- Request validation middleware
- API rate limiting

### Inventory Management
- Inventory tracking system
- Stock movement monitoring
- Supplier & category management
- Low-stock alert architecture
- Inventory analytics support

### Purchase Workflow System
- Purchase order lifecycle management
- Approval/rejection workflows
- Multi-stage status pipelines
- Workflow auditing support

### Task & Workflow Management
- Kanban-style task architecture
- Priority & workflow stage management
- Team collaboration support

### Operational Analytics
- Revenue & expense snapshot architecture
- KPI aggregation system
- Dashboard metrics foundation

### AI Workflow Layer
- AI-assisted ERP workflow architecture
- Intelligent operational insights
- Automation-ready backend structure

---

## 🗄️ Database Design

Current schema includes enterprise-grade relational modeling for:

- Users
- Suppliers
- Inventory Categories
- Inventory Items
- Stock Movements
- Purchase Orders
- Purchase Order Approvals
- Tasks & Comments
- Audit Logs
- Analytics Snapshots

The system is designed with:
- relational integrity
- auditability
- workflow traceability
- scalable API architecture

---

## 📂 Project Structure

```bash
nexus-erp/
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   │
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── validators/
│   │   └── server.js
│   │
│   └── package.json
│
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── assets/
│
└── package.json
```

---

## 🧪 Local Setup

### Clone Repository

```bash
git clone https://github.com/sindgisrishtis/ai-erp-workflow-automation.git
cd ai-erp-workflow-automation
```

---

### Frontend Setup

```bash
npm install
npm run dev
```

Frontend:
```bash
http://localhost:5173
```

---

### Backend Setup

```bash
cd backend

npm install
```

---

### Environment Variables

Create `.env` inside `backend/`

```env
DATABASE_URL="postgresql://username@localhost:5432/nexuserp"

JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret

PORT=5000
NODE_ENV=development
```

---

### Prisma Setup

```bash
npx prisma generate

npx prisma migrate dev --name init

node prisma/seed.js
```

---

### Start Backend

```bash
npm run dev
```

Backend:
```bash
http://localhost:5000
```

---

## 🔐 Sample Credentials

```bash
Email: admin@nexuserp.com
Password: NexusERP@2024
```

---

## 📌 Engineering Focus Areas

- Enterprise backend architecture
- Workflow automation systems
- Scalable REST API design
- RBAC & authentication systems
- Database schema engineering
- Operational analytics
- AI-enabled ERP workflows
- Audit logging & compliance tracking

---

## 📈 Roadmap

- Inventory API completion
- Purchase workflow APIs
- Frontend-backend integration
- Real-time notifications
- AI automation engine
- Advanced analytics
- Docker deployment
- CI/CD pipeline

---

## 👩‍💻 Author

### Srishti Sindgi

AI & Full Stack Developer  
Focused on scalable backend systems, AI-powered workflows, and enterprise SaaS engineering.

GitHub: https://github.com/sindgisrishtis