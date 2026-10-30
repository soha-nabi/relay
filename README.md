# Relay — Two-Way Payment Recovery & Banking Intelligence Platform

Relay is an autonomous payment recovery orchestration engine and banking failure intelligence platform. It bridges the information asymmetry between issuing banks, merchants, and customers to recover failed payments without storing raw cardholder data (zero PCI-DSS burden).

The platform consists of **three decoupled services**:
1. **Relay Web Platform (`apps/relay`)**: Next.js 14 Merchant Console, Operator Admin, Customer Recovery Checkout, and AI Voice Agent Studio.
2. **Bank ACS Gateway (`apps/bank`)**: Standalone Next.js 14 Issuing Bank Access Control Server (ACS) simulating Tier-1 banks (HSBC, DBS, HDFC, Chase) with 3DS 2.2 OTP and NetBanking authorization.
3. **Core Backend Engine (`backend/` & `main.py`)**: High-performance Python FastAPI service providing ISO-8583 diagnostic engines, Twilio Voice/SMS outreach, Upstash QStash delayed retries, and MongoDB multi-tenant persistence.

| Resource | Link |
|-----------|------|
| **Production Domain** | [relay-ai-git-main-relaysupportai-6734.vercel.app](https://relay-ai-git-main-relaysupportai-6734.vercel.app/) |
| **Deployment URL** | [relay-2uvo8hyjm-relaysupportai-6734.vercel.app](https://relay-2uvo8hyjm-relaysupportai-6734.vercel.app/) |
| **Backend API (Render)** | https://relay-recovery.onrender.com |
| **API Documentation (Swagger)** | https://relay-recovery.onrender.com/docs |
| **GitHub Repository** | https://github.com/soha-nabi/relay |

---

## 🏛 System Architecture

```text
                             CUSTOMER RECOVERY LINK
                                       │
                                       ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                    RELAY PLATFORM (VERCEL)                          │
    │                    https://relay.yourdomain.com                     │
    │                                                                     │
    │  • Hosted Customer Checkout (/pay/:sessionId)                       │
    │  • Plain-English Failure Breakdown & ISO-8583 Diagnostics           │
    │  • Payment Method Selector (UPI / Cards / NetBanking / Wallets)     │
    │  • Clicks: "Proceed to Bank Gateway (Separate App)"                 │
    └──────────────────────────────────┬──────────────────────────────────┘
                                       │ Browser Redirect
                                       ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                   BANK ACS GATEWAY (VERCEL)                         │
    │                    https://bank.yourdomain.com                      │
    │                                                                     │
    │  • 100% Isolated Issuing Bank Domain (/gateway/:sessionId)          │
    │  • Switchable ACS: HSBC, DBS Singapore, HDFC India, Chase US        │
    │  • 3DS 2.2 SMS OTP Challenge (849201) & NetBanking Login            │
    │  • Customer Clicks: "Authorize & Charge Account"                    │
    │  • Bank Stamps Transaction: HSBC-AUTH-982142 (ISO Code 00)          │
    └──────────────────────────────────┬──────────────────────────────────┘
                                       │ HTTP POST /api/pay/:id/bank-authorize
                                       │ + Browser Return Redirect
                                       ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                   CORE ENGINE API (RENDER)                          │
    │                 https://relay-api.onrender.com                      │
    │                                                                     │
    │  • Recovery Engine marks session RECOVERED                          │
    │  • Upstash QStash pending retries auto-cancelled                    │
    │  • Twilio Voice / SMS follow-ups automatically stopped              │
    │  • Merchant Console real-time metrics updated via Webhooks          │
    └──────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
                         MONGODB ATLAS MULTI-TENANT DB
```

---

## ⚙️ Environment Variables Matrix

### 1. Backend Engine (Render)
Configure these in your **Render Web Service** dashboard under **Environment**:

| Variable | Required? | Example / Default | Description |
| :--- | :---: | :--- | :--- |
| `ENVIRONMENT` | Yes | `production` | Deployment mode (`production` or `development`) |
| `PORT` | Auto | `10000` | Injected automatically by Render |
| `MONGODB_URI` | Optional | `mongodb+srv://user:pass@cluster.mongodb.net/` | MongoDB Atlas URI. If omitted, uses in-memory DataStore. |
| `MONGODB_DB_NAME` | Optional | `relay` | Target database name |
| `SESSION_SECRET` | Recommended | `your-cryptographic-secret-key` | Secret key for signing auth session tokens |
| `RESEND_API_KEY` | Optional | `re_123456789...` | Resend API key for automated recovery and welcome emails |
| `RESEND_FROM_EMAIL` | Optional | `onboarding@resend.dev` | Sender email address |
| `TWILIO_ACCOUNT_SID` | Optional | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Twilio Account SID for outbound recovery voice calls & SMS |
| `TWILIO_AUTH_TOKEN` | Optional | `your_auth_token` | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Optional | `+1xxxxxxxxxx` | Twilio phone number for caller ID and SMS dispatch |
| `QSTASH_TOKEN` | Optional | `eyxxxxxxxx...` | Upstash QStash token for delayed async retry queue |
| `QSTASH_URL` | Optional | `https://qstash.upstash.io/v2/publish/` | QStash publish endpoint |
| `ELEVENLABS_API_KEY` | Optional | `xi_api_key_xxx` | ElevenLabs API key for AI Voice Agent |
| `ELEVENLABS_AGENT_ID` | Optional | `agent_id_xxx` | ElevenLabs Voice Recovery Agent ID |

---

### 2. Relay Platform App (Vercel — `apps/relay`)
Configure these in the **Vercel Project Settings** for `apps/relay`:

| Variable | Required? | Example | Description |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://relay-api.onrender.com` | Public HTTPS URL of the FastAPI backend deployed on Render |
| `NEXT_PUBLIC_BANK_URL` | **Yes** | `https://bank-gateway.vercel.app` | Public HTTPS URL of the Bank Gateway App deployed on Vercel |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`| Optional | `your_agent_id` | Client-side ElevenLabs Voice Agent widget ID |

---

### 3. Bank ACS Gateway App (Vercel — `apps/bank`)
Configure these in the **Vercel Project Settings** for `apps/bank`:

| Variable | Required? | Example | Description |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_RELAY_API_URL` | **Yes** | `https://relay-api.onrender.com` | Public HTTPS URL of the FastAPI backend deployed on Render |
| `NEXT_PUBLIC_RELAY_APP_URL` | **Yes** | `https://relay-platform.vercel.app` | Public HTTPS URL of the Relay App for customer redirect upon approval |

---

## 🚀 Deployment Guide: Render (Backend)

The backend is configured for deployment as a Render Web Service.

### Option A: 1-Click Render Blueprint (Recommended)
1. Push this repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** → **Blueprint**.
3. Connect your repository. Render will automatically detect [`render.yaml`](file:///d:/Projects/relay/render.yaml) and configure:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Health Check Path: `/health`
4. Fill in any secret keys (e.g. `MONGODB_URI`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`) when prompted.
5. Click **Apply**.

### Option B: Manual Render Web Service Setup
1. In Render Dashboard, click **New +** → **Web Service**.
2. Select your GitHub repository.
3. Configure the service settings:
   - **Name**: `relay-backend`
   - **Region**: Oregon (US West) or Frankfurt (EU)
   - **Branch**: `main`
   - **Root Directory**: Leave blank (uses repo root)
   - **Runtime**: `Python 3`
   - **Build Command**:
     ```bash
     pip install -r requirements.txt
     ```
   - **Start Command**:
     ```bash
     uvicorn main:app --host 0.0.0.0 --port $PORT
     ```
4. Under **Advanced**:
   - **Health Check Path**: `/health`
5. Under **Environment Variables**, add the keys listed in the Backend Matrix above.
6. Click **Create Web Service**. Note your service URL (e.g., `https://relay-backend.onrender.com`).

---

## 🚀 Deployment Guide: Vercel (Frontends)

You will deploy **two separate Vercel projects** from the same GitHub repository by specifying the Root Directory.

### 1. Deploy Relay Platform (`apps/relay`)
1. In the [Vercel Dashboard](https://vercel.com), click **Add New...** → **Project**.
2. Import your GitHub repository.
3. In the project configuration modal:
   - **Project Name**: `relay-platform`
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click *Edit* and select **`apps/relay`**
4. Expand **Environment Variables** and add:
   - `NEXT_PUBLIC_API_URL` = `https://relay-backend.onrender.com` (Your Render backend URL)
   - `NEXT_PUBLIC_BANK_URL` = `https://bank-gateway.vercel.app` (Your Bank app URL on Vercel)
5. Click **Deploy**.

---

### 2. Deploy Bank ACS Gateway (`apps/bank`)
1. In Vercel, click **Add New...** → **Project** again.
2. Import the same GitHub repository.
3. In the project configuration modal:
   - **Project Name**: `bank-gateway`
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click *Edit* and select **`apps/bank`**
4. Expand **Environment Variables** and add:
   - `NEXT_PUBLIC_RELAY_API_URL` = `https://relay-backend.onrender.com` (Your Render backend URL)
   - `NEXT_PUBLIC_RELAY_APP_URL` = `https://relay-platform.vercel.app` (Your Relay app URL on Vercel)
5. Click **Deploy**.

---

## 💻 Local Development Setup

### Prerequisites
- Node.js 18+ (tested on Node v20/v24)
- Python 3.10+ (tested on Python 3.11/3.12/3.14)
- npm or pnpm

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/soha-nabi/relay.git
cd relay

# Install root dependencies
npm install

# Install Python backend dependencies
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Start Services Locally
Run each service in a separate terminal:

```bash
# Terminal 1: Core API Engine (Port 8000)
python -m uvicorn main:app --reload --port 8000

# Terminal 2: Relay Platform Next.js App (Port 3000)
cd apps/relay
npm run dev

# Terminal 3: Issuing Bank ACS Gateway Next.js App (Port 3001)
cd apps/bank
npm run dev
```

---

## 🔑 Login Accounts & Credentials

### Relay Merchant & Admin Console (`http://localhost:3000` or production URL)
| Role | Username | Password | Access Capabilities |
| :--- | :--- | :--- | :--- |
| **Merchant Console** | `merchant` | `merchant123` | Real-time recovery analytics, AI automations, ElevenLabs voice studio, at-risk payment streams, CSV uploads |
| **Operator Admin** | `admin` | `admin123` | Multi-merchant directory, platform users, webhook stream monitor, system-wide audit logs |
| **Customer Portal** | `user` | `user123` | Personal recovery payments, status resolution, payment help instructions |

### Bank ACS Simulation Gateway (`http://localhost:3001/gateway` or production URL)
- **Zero Login Required**: Simulates genuine 3DS 2.2 Access Control Servers.
- **Issuers**: Toggle between **HSBC Global Gateway**, **DBS IDEAL**, **HDFC SafePay**, and **Chase Paymentech**.
- **3DS SMS OTP Code**: **`849201`** (or click *Authorize & Charge*).
- **NetBanking Demo Login**: ID `CORP_HSBC_982`, Password: any string.
- **Demo Presets**: 1-click test scenarios for Daily Card Limit decline (ISO-51), Switch Timeout recovery (ISO-91), and High-value 3DS challenge.

---

## 🧪 Testing & Verification

Run the full backend test suite:
```bash
python -m pytest tests/ -q
# Output: 187 passed, 18 skipped (100% test pass rate)
```

Build and typecheck Next.js applications:
```bash
# Relay Platform
cd apps/relay && npm run build

# Issuing Bank Gateway
cd apps/bank && npm run build
```

---

## 🔒 Security & PCI-DSS Scope Architecture

Relay is strictly architected as a **non-custodial orchestration layer**:
- **Zero Cardholder Data Stored**: Relay servers and databases never handle, log, or store raw Primary Account Numbers (PAN), CVVs, or NetBanking passwords.
- **Cryptographic Handoff**: Payment authorization is delegated directly to the issuing bank's Access Control Server (`apps/bank`).
- **Opaque Approval Callback**: The bank charges the customer and returns only an opaque approval code (e.g. `HSBC-AUTH-982142`), keeping merchants and Relay 100% compliant and exempt from PCI-DSS Level-1 burdens.
