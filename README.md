# Relay

Relay is an AI-powered payment recovery platform designed to help merchants identify, automate, and recover failed payment transactions. The platform provides recovery intelligence, workflow automation, analytics, and role-based dashboards to reduce revenue leakage and improve payment success rates.

## Live Demo

| Resource | Link |
|-----------|------|
| Frontend Application | https://relay-pi-snowy.vercel.app, https://relay-relaysupportai-6734.vercel.app/|
| Backend API | https://relay-recovery.onrender.com |
| API Documentation | https://relay-recovery.onrender.com/docs |
| GitHub Repository | https://github.com/soha-nabi/relay |


## Overview
Failed payments result in lost revenue, increased churn, and manual operational effort. Relay addresses these challenges by:

- Detecting failed payment events
- Analyzing recovery opportunities
- Automating recovery workflows
- Tracking recovery performance
- Providing actionable insights through dashboards
- Supporting multiple user roles and permissions

## Features
### Authentication & Authorization
- Secure login system
- Role-based access control
- Session management
- Protected routes

### Merchant Dashboard
- Revenue recovery overview
- Recovery status tracking
- Recovery performance metrics
- Payment failure analytics

### Recovery Intelligence Engine
- Failed payment monitoring
- Recovery workflow orchestration
- Recovery status classification
- Automated recovery recommendations

### Analytics
- Recovery success rates
- Revenue restoration metrics
- Payment failure trends
- Status-based reporting

### Automation Workflows
- Recovery action triggers
- Automated follow-ups
- Workflow visibility
- Recovery lifecycle tracking

### User Roles
- Merchant
- Administrator
- Standard User

## Technology Stack

### Frontend
- React
- TypeScript
- Vite
- Axios
- Modern Responsive UI

### Backend
- FastAPI
- Python
- REST APIs
- CORS Support

### Deployment
- Frontend: Vercel
- Backend: Render

## Architecture

```text
Frontend (Vercel)
        |
        v
FastAPI Backend (Render)
        |
        v
Business Logic & Recovery Engine
        |
        v
Analytics & Reporting
```

## Project Structure

```text
relay/
│
├── backend/
│   ├── app/
│   ├── routes/
│   ├── services/
│   ├── models/
│   └── main.py
│
├── frontend/
│   ├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   └── assets/
│
├── README.md
└── requirements.txt
```

## Local Development Setup

### Prerequisites

- Node.js 18+
- npm
- Python 3.10+
- Git

### Clone Repository

```bash
git clone https://github.com/soha-nabi/relay.git
cd relay
```

## Backend Setup

```bash
cd backend

python -m venv venv

# Windows
venv\Scripts\activate

# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt

uvicorn main:app --reload
```

Backend runs on:

```text
http://127.0.0.1:8000
```

## Frontend Setup

```bash
cd frontend

npm install
```

Create a `.env` file:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Start development server:

```bash
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

## Production Deployment

### Frontend

Deployed on Vercel.

Production URL:

```text
https://relay-pi-snowy.vercel.app
```

### Backend

Deployed on Render.

API URL:

```text
https://relay-recovery.onrender.com
```

### Production Environment Variable

```env
VITE_API_BASE_URL=https://relay-recovery.onrender.com
```

## Demo Credentials

### Merchant

```text
Username: merchant
Password: ********
```

### Admin

```text
Username: admin
Password: ********
```

### User

```text
Username: user
Password: ********
```

Replace credentials with actual demo accounts if applicable.

## API Endpoints

### Authentication

```http
POST /auth/login
POST /auth/logout
GET /auth/me
```

### Dashboard

```http
GET /dashboard
GET /dashboard/by-status
```

### Recovery Operations

```http
GET /recoveries
POST /recoveries
PUT /recoveries/{id}
```

## Security

- Role-based access control
- Protected API routes
- Secure authentication flow
- Environment-based configuration
- CORS protection

## Future Enhancements

- AI-driven recovery recommendations
- Predictive payment failure detection
- Multi-tenant architecture
- Real-time notifications
- Advanced analytics and forecasting
- Third-party payment integrations

## Contributors

**Soha Nabi**

GitHub:
https://github.com/soha-nabi

## License

This project is developed for educational, demonstration, and evaluation purposes.
