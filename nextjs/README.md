# Relay Frontend — Next.js Application

Relay is an autonomous payment recovery orchestration engine and banking failure intelligence platform.

## 🌐 Live Deployments

| Resource | URL |
| :--- | :--- |
| **Production Domain** | [relay-ai-git-main-relaysupportai-6734.vercel.app](https://relay-ai-git-main-relaysupportai-6734.vercel.app/) |
| **Deployment URL** | [relay-2uvo8hyjm-relaysupportai-6734.vercel.app](https://relay-2uvo8hyjm-relaysupportai-6734.vercel.app/) |
| **Backend API (Render)** | [https://relay-recovery.onrender.com](https://relay-recovery.onrender.com) |
| **Interactive API Docs** | [https://relay-recovery.onrender.com/docs](https://relay-recovery.onrender.com/docs) |

---

## 🔑 Demo Login Accounts

| Role | Username | Password | Features |
| :--- | :--- | :--- | :--- |
| **Merchant Console** | `merchant` | `merchant123` | Real-time recovery analytics, AI automations, ElevenLabs voice studio, at-risk payment streams, CSV uploads |
| **Operator Admin** | `admin` | `admin123` | Multi-merchant directory, platform users, webhook stream monitor, system-wide audit logs |
| **Customer Portal** | `user` | `user123` | Personal recovery payments, status resolution, payment help instructions |

*Note: One-click demo login buttons are also available directly on the sign-in page.*

---

## 🛠 Local Development

```bash
# Install dependencies
npm install

# Start local Next.js development server (Port 3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Environment Configuration

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_BASE_URL` | Fast API backend URL | `https://relay-recovery.onrender.com` |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | ElevenLabs AI Voice Agent ID | `agent_3701m1mhkvthfj8trka6n1vt436k` |
