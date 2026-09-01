# API Testing Guide

Complete reference for testing all Payment Dashboard API endpoints using curl, Python, or JavaScript.

---

## Table of Contents
1. [Setup](#setup)
2. [Testing with cURL](#testing-with-curl)
3. [Testing with Python](#testing-with-python)
4. [Testing with JavaScript](#testing-with-javascript)
5. [Common Scenarios](#common-scenarios)
6. [Response Examples](#response-examples)

---

## Setup

Ensure the server is running:
```bash
python main.py
```

API Base URL: `http://localhost:8000`

---

## Testing with cURL

### 1. Health Check
```bash
curl -X GET "http://localhost:8000/health" -H "accept: application/json"
```

### 2. Upload CSV File
```bash
# Basic upload
curl -X POST "http://localhost:8000/upload" \
  -F "file=@sample_payments.csv"

# With verbose output
curl -v -X POST "http://localhost:8000/upload" \
  -F "file=@sample_payments.csv"

# Save response to file
curl -X POST "http://localhost:8000/upload" \
  -F "file=@sample_payments.csv" \
  -o upload_response.json
```

### 3. Get Dashboard Metrics
```bash
# Basic request
curl -X GET "http://localhost:8000/dashboard" \
  -H "accept: application/json"

# Pretty print JSON (requires jq)
curl -X GET "http://localhost:8000/dashboard" \
  -H "accept: application/json" | jq '.'

# Get specific metric
curl -X GET "http://localhost:8000/dashboard" \
  -H "accept: application/json" | jq '.primary_metrics'
```

### 4. Get Raw Data
```bash
# Get first 10 rows (default)
curl -X GET "http://localhost:8000/data" \
  -H "accept: application/json"

# Get first 50 rows
curl -X GET "http://localhost:8000/data?limit=50" \
  -H "accept: application/json"

# Get with jq filtering
curl -X GET "http://localhost:8000/data?limit=5" \
  -H "accept: application/json" | jq '.data'
```

### 5. Get Statistics by Status
```bash
# Basic request
curl -X GET "http://localhost:8000/stats/by-status" \
  -H "accept: application/json"

# Pretty formatted
curl -X GET "http://localhost:8000/stats/by-status" \
  -H "accept: application/json" | jq '.'

# Get only failed stats
curl -X GET "http://localhost:8000/stats/by-status" \
  -H "accept: application/json" | jq '.failed'
```

### 6. Clear Data
```bash
curl -X DELETE "http://localhost:8000/data" \
  -H "accept: application/json"
```

### 7. Root Endpoint
```bash
curl -X GET "http://localhost:8000/" \
  -H "accept: application/json"
```

---

## Testing with Python

### Basic Setup
```python
import requests
import json

BASE_URL = "http://localhost:8000"

# Test health
response = requests.get(f"{BASE_URL}/health")
print(response.json())
```

### Upload CSV
```python
import requests

# Upload file
with open('sample_payments.csv', 'rb') as f:
    files = {'file': f}
    response = requests.post(
        'http://localhost:8000/upload',
        files=files
    )

print(response.status_code)
print(response.json())
```

### Get Dashboard
```python
import requests

response = requests.get('http://localhost:8000/dashboard')
dashboard = response.json()

# Access specific metrics
print(f"Total Failed Payments: {dashboard['primary_metrics']['total_failed_payments']}")
print(f"Revenue at Risk: ${dashboard['primary_metrics']['total_revenue_at_risk']:,.2f}")
print(f"Recovery Rate: {dashboard['primary_metrics']['recovery_rate']:.2f}%")
```

### Get All Endpoints with Requests
```python
import requests
import json

BASE_URL = "http://localhost:8000"

class APITester:
    def __init__(self, base_url=BASE_URL):
        self.base_url = base_url
        self.session = requests.Session()
    
    def upload_csv(self, filepath):
        with open(filepath, 'rb') as f:
            files = {'file': f}
            r = self.session.post(f"{self.base_url}/upload", files=files)
        return r.json()
    
    def get_dashboard(self):
        r = self.session.get(f"{self.base_url}/dashboard")
        return r.json()
    
    def get_data(self, limit=10):
        r = self.session.get(f"{self.base_url}/data", params={'limit': limit})
        return r.json()
    
    def get_stats(self):
        r = self.session.get(f"{self.base_url}/stats/by-status")
        return r.json()
    
    def health_check(self):
        r = self.session.get(f"{self.base_url}/health")
        return r.json()

# Usage
tester = APITester()
print("Uploading...")
print(tester.upload_csv('sample_payments.csv'))
print("\nDashboard:")
print(json.dumps(tester.get_dashboard(), indent=2))
print("\nStats:")
print(json.dumps(tester.get_stats(), indent=2))
```

---

## Testing with JavaScript/Node.js

### Fetch API (Browser)
```javascript
// Upload file
async function uploadCSV(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('http://localhost:8000/upload', {
    method: 'POST',
    body: formData
  });
  
  return await response.json();
}

// Get dashboard
async function getDashboard() {
  const response = await fetch('http://localhost:8000/dashboard');
  return await response.json();
}

// Usage
document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const result = await uploadCSV(file);
  console.log(result);
  
  const dashboard = await getDashboard();
  console.log(dashboard);
});
```

### Node.js with Axios
```javascript
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:8000';

// Upload CSV
async function uploadCSV(filepath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filepath));
  
  const response = await axios.post(`${BASE_URL}/upload`, form, {
    headers: form.getHeaders()
  });
  
  return response.data;
}

// Get dashboard
async function getDashboard() {
  const response = await axios.get(`${BASE_URL}/dashboard`);
  return response.data;
}

// Get stats
async function getStats() {
  const response = await axios.get(`${BASE_URL}/stats/by-status`);
  return response.data;
}

// Usage
(async () => {
  console.log('Uploading...');
  const upload = await uploadCSV('sample_payments.csv');
  console.log(upload);
  
  console.log('\nGetting dashboard...');
  const dashboard = await getDashboard();
  console.log(JSON.stringify(dashboard, null, 2));
  
  console.log('\nGetting stats...');
  const stats = await getStats();
  console.log(JSON.stringify(stats, null, 2));
})();
```

---

## Common Scenarios

### Scenario 1: Full Workflow
```bash
#!/bin/bash

BASE_URL="http://localhost:8000"

echo "1. Uploading CSV..."
curl -X POST "$BASE_URL/upload" -F "file=@sample_payments.csv"

echo -e "\n2. Getting dashboard metrics..."
curl -X GET "$BASE_URL/dashboard" -H "accept: application/json" | jq '.'

echo -e "\n3. Getting stats by status..."
curl -X GET "$BASE_URL/stats/by-status" -H "accept: application/json" | jq '.'

echo -e "\n4. Getting sample data..."
curl -X GET "$BASE_URL/data?limit=5" -H "accept: application/json" | jq '.data'

echo -e "\n5. Clearing data..."
curl -X DELETE "$BASE_URL/data" -H "accept: application/json"
```

### Scenario 2: Monitor Payment Metrics
```python
import requests
import time
from datetime import datetime

def monitor_dashboard():
    while True:
        try:
            response = requests.get('http://localhost:8000/dashboard')
            data = response.json()
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            metrics = data['primary_metrics']
            
            print(f"[{timestamp}]")
            print(f"  Revenue at Risk: ${metrics['total_revenue_at_risk']:,.2f}")
            print(f"  Recovery Rate: {metrics['recovery_rate']:.2f}%")
            print(f"  Failed Payments: {metrics['total_failed_payments']}")
            print()
            
            time.sleep(30)  # Check every 30 seconds
        
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(5)

# Run monitoring
monitor_dashboard()
```

### Scenario 3: Export Dashboard to CSV
```python
import requests
import pandas as pd

# Get dashboard
response = requests.get('http://localhost:8000/dashboard')
dashboard = response.json()

# Create export dataframe
export_data = {
    'Metric': [
        'Total Failed Payments',
        'Total Revenue at Risk',
        'Recovery Rate (%)',
        'Success Rate (%)',
        'Total Transactions'
    ],
    'Value': [
        dashboard['primary_metrics']['total_failed_payments'],
        dashboard['primary_metrics']['total_revenue_at_risk'],
        dashboard['primary_metrics']['recovery_rate'],
        dashboard['rates']['success_rate'],
        dashboard['summary']['total_transactions']
    ]
}

df = pd.DataFrame(export_data)
df.to_csv('dashboard_export.csv', index=False)
print("Dashboard exported to dashboard_export.csv")
```

---

## Response Examples

### Upload Success Response
```json
{
  "status": "success",
  "message": "CSV file uploaded successfully",
  "file_name": "sample_payments.csv",
  "rows_loaded": 50,
  "columns": ["transaction_id", "amount", "payment_status", "recovery_amount"],
  "uploaded_at": "2024-01-15T10:30:45.123456"
}
```

### Dashboard Response (Partial)
```json
{
  "timestamp": "2024-01-15T10:32:10.456789",
  "primary_metrics": {
    "total_failed_payments": 12,
    "total_failed_amount": 28600.0,
    "total_revenue_at_risk": 16200.0,
    "recovery_rate": 43.36
  },
  "rates": {
    "success_rate": 60.0,
    "failure_rate": 24.0,
    "recovery_rate": 43.36
  }
}
```

### Stats by Status Response
```json
{
  "success": {
    "count": 30,
    "total_amount": 43975.0,
    "average_amount": 1465.83,
    "min_amount": 450.75,
    "max_amount": 5000.0,
    "total_recovered": 0
  },
  "failed": {
    "count": 12,
    "total_amount": 28600.0,
    "average_amount": 2383.33,
    "min_amount": 600.0,
    "max_amount": 5000.0,
    "total_recovered": 12400.0
  }
}
```

---

## Error Handling

### No Data Uploaded
```bash
$ curl http://localhost:8000/dashboard
```
Response (404):
```json
{
  "detail": "No data uploaded yet. Please upload a CSV file first."
}
```

### Invalid File Type
```bash
$ curl -X POST http://localhost:8000/upload -F "file=@data.txt"
```
Response (400):
```json
{
  "detail": "Only CSV files are accepted"
}
```

### Missing Required Columns
```bash
$ curl -X POST http://localhost:8000/upload -F "file=@incomplete.csv"
```
Response (400):
```json
{
  "detail": "Missing required columns: amount, payment_status"
}
```

---

## Performance Testing

### Load Testing with Apache Bench
```bash
# Test dashboard endpoint
ab -n 1000 -c 100 http://localhost:8000/dashboard

# Test data endpoint
ab -n 1000 -c 100 'http://localhost:8000/data?limit=100'
```

### Load Testing with Python
```python
import requests
import concurrent.futures
import time

def test_dashboard():
    response = requests.get('http://localhost:8000/dashboard')
    return response.status_code

start = time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
    futures = [executor.submit(test_dashboard) for _ in range(1000)]
    results = [f.result() for f in concurrent.futures.as_completed(futures)]

elapsed = time.time() - start
print(f"1000 requests in {elapsed:.2f}s")
print(f"Success: {sum(1 for r in results if r == 200)}")
print(f"Requests per second: {1000/elapsed:.2f}")
```

---

## Useful Tools

- **jq**: Pretty print JSON - `curl ... | jq '.'`
- **Postman**: GUI for API testing
- **Thunder Client**: VS Code extension
- **REST Client**: VS Code extension
- **curl**: Command line tool (built-in)
- **HTTPie**: More user-friendly curl alternative

---

## Tips & Tricks

1. **Save responses to file:**
   ```bash
   curl http://localhost:8000/dashboard -o response.json
   ```

2. **Extract specific fields with jq:**
   ```bash
   curl http://localhost:8000/dashboard | jq '.primary_metrics.recovery_rate'
   ```

3. **Time your requests:**
   ```bash
   curl -w "\nTime: %{time_total}s\n" http://localhost:8000/dashboard
   ```

4. **Test with different limits:**
   ```bash
   for limit in 10 50 100 500; do
     echo "Limit: $limit"
     curl "http://localhost:8000/data?limit=$limit" | jq '.returned_rows'
   done
   ```

---

Need more examples? Check the `test_client.py` file for a complete Python implementation!
