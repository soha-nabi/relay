# Payment Dashboard API

A FastAPI-based payment analytics system that processes CSV files and provides real-time dashboard metrics for payment analysis.

## Features

- ✅ CSV file upload and in-memory storage
- ✅ Pandas-based data processing
- ✅ Real-time payment analytics dashboard
- ✅ Recovery rate calculation
- ✅ Revenue at risk tracking
- ✅ Comprehensive API endpoints
- ✅ CORS enabled for frontend integration
- ✅ Data validation and error handling

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Server

```bash
python main.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Documentation

### Interactive Documentation

Once the server is running:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## CSV Format

Your CSV file should contain the following columns:

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| transaction_id | String | Yes | Unique transaction identifier |
| amount | Numeric | Yes | Transaction amount |
| payment_status | String | Yes | One of: "success", "failed", "pending" |
| recovery_amount | Numeric | No | Amount recovered from failed payment |

### Example CSV

```csv
transaction_id,amount,payment_status,recovery_amount
TXN001,1000.50,success,0
TXN002,2500.00,failed,500.00
TXN003,750.25,pending,0
TXN004,3200.00,failed,1000.00
TXN005,1500.00,success,0
TXN006,2000.00,failed,200.00
```

## API Endpoints

### 1. Upload CSV
**POST** `/upload`

Upload a CSV file for processing.

**Request:**
```bash
curl -X POST "http://localhost:8000/upload" \
  -F "file=@payments.csv"
```

**Response:**
```json
{
  "status": "success",
  "message": "CSV file uploaded successfully",
  "file_name": "payments.csv",
  "rows_loaded": 1000,
  "columns": ["transaction_id", "amount", "payment_status", "recovery_amount"],
  "uploaded_at": "2024-01-15T10:30:45.123456"
}
```

---

### 2. Get Dashboard Metrics
**GET** `/dashboard`

Retrieve comprehensive payment analytics including:
- Total failed payments
- Total revenue at risk
- Recovery rate
- Success/failure rates
- Transaction summaries

**Request:**
```bash
curl "http://localhost:8000/dashboard"
```

**Response:**
```json
{
  "timestamp": "2024-01-15T10:32:10.456789",
  "file_info": {
    "file_name": "payments.csv",
    "uploaded_at": "2024-01-15T10:30:45.123456"
  },
  "summary": {
    "total_transactions": 1000,
    "total_amount": 125000.50,
    "successful_transactions": 650,
    "failed_transactions": 250,
    "pending_transactions": 100
  },
  "primary_metrics": {
    "total_failed_payments": 250,
    "total_failed_amount": 25000.00,
    "total_revenue_at_risk": 15000.00,
    "recovery_rate": 40.0
  },
  "recovery_metrics": {
    "total_recovered": 10000.00,
    "average_recovery_per_failed": 40.0,
    "unrecovered_amount": 15000.00
  },
  "rates": {
    "success_rate": 65.0,
    "failure_rate": 25.0,
    "recovery_rate": 40.0
  },
  "amounts": {
    "total_amount": 125000.50,
    "successful_amount": 81250.00,
    "failed_amount": 25000.00,
    "revenue_at_risk": 15000.00
  }
}
```

---

### 3. Get Raw Data
**GET** `/data`

Retrieve the uploaded CSV data with optional limit.

**Query Parameters:**
- `limit` (optional, default=100): Number of rows to return

**Request:**
```bash
curl "http://localhost:8000/data?limit=50"
```

**Response:**
```json
{
  "total_rows": 1000,
  "returned_rows": 50,
  "data": [
    {
      "transaction_id": "TXN001",
      "amount": 1000.50,
      "payment_status": "success",
      "recovery_amount": 0
    },
    ...
  ]
}
```

---

### 4. Get Statistics by Status
**GET** `/stats/by-status`

Get aggregated statistics grouped by payment status.

**Request:**
```bash
curl "http://localhost:8000/stats/by-status"
```

**Response:**
```json
{
  "success": {
    "count": 650,
    "total_amount": 81250.00,
    "average_amount": 125.00,
    "min_amount": 10.50,
    "max_amount": 5000.00,
    "total_recovered": 0
  },
  "failed": {
    "count": 250,
    "total_amount": 25000.00,
    "average_amount": 100.00,
    "min_amount": 5.00,
    "max_amount": 3000.00,
    "total_recovered": 10000.00
  },
  "pending": {
    "count": 100,
    "total_amount": 18750.50,
    "average_amount": 187.51,
    "min_amount": 25.00,
    "max_amount": 2500.00,
    "total_recovered": 0
  }
}
```

---

### 5. Health Check
**GET** `/health`

Check API health and data status.

**Request:**
```bash
curl "http://localhost:8000/health"
```

**Response:**
```json
{
  "status": "healthy",
  "data_loaded": true,
  "last_uploaded": "2024-01-15T10:30:45.123456",
  "file_name": "payments.csv"
}
```

---

### 6. Clear Data
**DELETE** `/data`

Clear all data from memory.

**Request:**
```bash
curl -X DELETE "http://localhost:8000/data"
```

**Response:**
```json
{
  "status": "success",
  "message": "All data cleared from memory"
}
```

---

### 7. Root Endpoint
**GET** `/`

Get API information and available endpoints.

**Request:**
```bash
curl "http://localhost:8000/"
```

## Key Metrics Explained

### Total Failed Payments
Number of transactions with `payment_status = "failed"`

### Total Revenue at Risk
Sum of failed payment amounts minus recovered amounts:
```
Revenue at Risk = Sum(failed_amount) - Sum(recovery_amount)
```

### Recovery Rate
Percentage of failed payment amounts that have been recovered:
```
Recovery Rate = (Total Recovered / Total Failed Amount) × 100
```

## Example Workflow

1. **Start the server:**
   ```bash
   python main.py
   ```

2. **Upload a CSV file:**
   ```bash
   curl -X POST "http://localhost:8000/upload" \
     -F "file=@payments.csv"
   ```

3. **Get dashboard metrics:**
   ```bash
   curl "http://localhost:8000/dashboard"
   ```

4. **View statistics by status:**
   ```bash
   curl "http://localhost:8000/stats/by-status"
   ```

5. **Clear data when done:**
   ```bash
   curl -X DELETE "http://localhost:8000/data"
   ```

## Error Handling

The API returns appropriate HTTP status codes:

| Status | Scenario |
|--------|----------|
| 200 | Success |
| 400 | Bad request (e.g., missing columns, invalid file type) |
| 404 | Data not found (upload a CSV first) |
| 500 | Server error |

Example error response:
```json
{
  "detail": "Missing required columns: amount, payment_status"
}
```

## Data Storage

- Data is stored **in-memory** using Python objects
- Data persists during the server session
- Uploading a new CSV will replace the previous data
- Use the `/data` DELETE endpoint to clear memory

## Performance Considerations

- Pandas efficiently handles CSV files with thousands of rows
- In-memory storage is fast for datasets up to millions of records
- For production use with larger datasets, consider:
  - Database integration (PostgreSQL, MongoDB)
  - Caching layer (Redis)
  - Async task processing

## Development

### Project Structure
```
.
├── main.py              # FastAPI application
├── requirements.txt     # Python dependencies
└── README.md           # Documentation
```

### Adding Features

To add new endpoints:

1. Import necessary modules
2. Define async function with route decorator
3. Add data validation and error handling
4. Return JSON response

Example:
```python
@app.get("/new-endpoint")
async def new_endpoint():
    if data_store.df is None:
        raise HTTPException(status_code=404, detail="No data loaded")
    # Your logic here
    return {"data": "result"}
```

## Testing

### Using Python Requests

```python
import requests

# Upload file
files = {'file': open('payments.csv', 'rb')}
response = requests.post('http://localhost:8000/upload', files=files)
print(response.json())

# Get dashboard
response = requests.get('http://localhost:8000/dashboard')
dashboard = response.json()
print(f"Revenue at risk: ${dashboard['primary_metrics']['total_revenue_at_risk']}")
print(f"Recovery rate: {dashboard['primary_metrics']['recovery_rate']}%")
```

## Troubleshooting

**Issue**: "No data uploaded yet" error
- **Solution**: Upload a CSV file using the `/upload` endpoint first

**Issue**: "Missing required columns" error
- **Solution**: Ensure your CSV has: `transaction_id`, `amount`, `payment_status`

**Issue**: Port already in use
- **Solution**: Change port with `--port 8001` flag

**Issue**: Module not found errors
- **Solution**: Run `pip install -r requirements.txt` to install dependencies

## License

MIT License
