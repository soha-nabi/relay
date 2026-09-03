# Recovery Studio frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite development server proxies `/api` requests to `http://localhost:8000`.

For a separately deployed frontend, create `.env`:

```bash
VITE_API_BASE_URL=https://relay-recovery.onrender.com
```

```bash
npm run build
```
