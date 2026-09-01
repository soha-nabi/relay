# Quick Start Guide

Get the Payment Dashboard API up and running in minutes!

## Option 1: Local Python Setup (Fastest)

### Prerequisites
- Python 3.8+
- pip (Python package manager)

### Steps

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the server:**
   ```bash
   python main.py
   ```
   
   You should see:
   ```
   INFO:     Uvicorn running on http://0.0.0.0:8000
   INFO:     Application startup complete
   ```

3. **Open API in browser:**
   - Interactive Docs: http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc

4. **Test with sample data:**
   ```bash
   python test_client.py
   ```

---

## Option 2: Docker Setup

### Prerequisites
- Docker installed
- Docker Compose (optional but recommended)

### Using Docker Compose (Easiest)

```bash
docker-compose up
```

The API will be available at `http://localhost:8000`

### Using Docker Directly

```bash
# Build image
docker build -t payment-dashboard-api .

# Run container
docker run -p 8000:8000 payment-dashboard-api
```

---

## Testing the API

### 1. Upload Sample Data
```bash
curl -X POST "http://localhost:8000/upload" \
  -F "file=@sample_payments.csv"
```

### 2. Get Dashboard Metrics
```bash
curl "http://localhost:8000/dashboard"
```

### 3. View Interactive Docs
Open your browser to: http://localhost:8000/docs

You can test all endpoints directly from the Swagger UI!

---

## Common Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/upload` | Upload CSV file |
| GET | `/dashboard` | Get payment analytics |
| GET | `/stats/by-status` | Get stats by status |
| GET | `/data` | Get raw data |
| GET | `/health` | Check API status |
| DELETE | `/data` | Clear data |

---

## Python API Client Example

```python
import requests

# Upload file
files = {'file': open('sample_payments.csv', 'rb')}
r = requests.post('http://localhost:8000/upload', files=files)
print(r.json())

# Get dashboard
r = requests.get('http://localhost:8000/dashboard')
dashboard = r.json()

print(f"Revenue at Risk: ${dashboard['primary_metrics']['total_revenue_at_risk']}")
print(f"Recovery Rate: {dashboard['primary_metrics']['recovery_rate']}%")
```

---

## Using with cURL

### Upload CSV
```bash
curl -X POST "http://localhost:8000/upload" \
  -H "accept: application/json" \
  -F "file=@sample_payments.csv"
```

### Get Dashboard
```bash
curl -X GET "http://localhost:8000/dashboard" \
  -H "accept: application/json" | jq
```

### Get Stats by Status
```bash
curl -X GET "http://localhost:8000/stats/by-status" \
  -H "accept: application/json" | jq
```

---

## File Format

Your CSV must have these columns:

```
transaction_id,amount,payment_status,recovery_amount
TXN001,1000.50,success,0
TXN002,2500.00,failed,500.00
TXN003,750.25,pending,0
```

- `transaction_id`: Unique ID
- `amount`: Transaction amount (numeric)
- `payment_status`: "success", "failed", or "pending"
- `recovery_amount`: Amount recovered (optional, default 0)

---

## Sample Dashboard Response

```json
{
  "primary_metrics": {
    "total_failed_payments": 250,
    "total_failed_amount": 25000.00,
    "total_revenue_at_risk": 15000.00,
    "recovery_rate": 40.0
  },
  "rates": {
    "success_rate": 65.0,
    "failure_rate": 25.0,
    "recovery_rate": 40.0
  }
}
```

---

## Troubleshooting

### Problem: "Connection refused"
**Solution:** Make sure the server is running with `python main.py`

### Problem: "ModuleNotFoundError"
**Solution:** Install dependencies: `pip install -r requirements.txt`

### Problem: "Port 8000 already in use"
**Solution:** Use a different port: `uvicorn main:app --port 8001`

### Problem: "No data uploaded yet"
**Solution:** Upload a CSV file first: `curl -X POST http://localhost:8000/upload -F "file=@sample_payments.csv"`

### Problem: Docker container won't start
**Solution:** Check logs: `docker logs payment-dashboard-api`

---

## Next Steps

1. ✅ Server running
2. ✅ API tested
3. 📖 Read full documentation: `README.md`
4. 🔌 Integrate with your frontend
5. 📊 Customize dashboard metrics as needed

---

## Stopping the Server

### Local Python
Press `Ctrl+C` in the terminal

### Docker
```bash
docker-compose down
# or
docker stop payment-dashboard-api
```

---

## Performance Tips

- **For large CSVs**: CSVs with 100k+ rows work fine in memory
- **For production**: Consider adding database persistence
- **For scaling**: Set up multiple instances with load balancer
- **For caching**: Add Redis for repeated queries

---

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

All endpoints are fully documented with try-it-out functionality!

---

Need help? Check the `README.md` for complete documentation.
