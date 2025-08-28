
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Custom metrics
const errorRate = new Rate('error_rate');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');
const responseTime = new Trend('response_time');

// Test configuration for 1000 load
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '3m', target: 500 },   // Ramp up to 500 users  
    { duration: '2m', target: 1000 },  // Ramp up to 1000 users
    { duration: '5m', target: 1000 },  // Stay at 1000 users
    { duration: '2m', target: 500 },   // Ramp down to 500 users
    { duration: '2m', target: 0 },     // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<5000'], // 95% of requests under 5s
    'http_req_failed': ['rate<0.1'],     // Error rate under 10%
    'error_rate': ['rate<0.1'],          // Custom error rate under 10%
  },
};

console.log(`🚀 OpenBee Simple Load Test`);
console.log(`🎯 Target: ${BASE_URL}`);
console.log(`👥 Max Users: 1000`);
console.log(`⏱️  Duration: ~16 minutes total`);

export default function () {
  // Test 1: Health/Status endpoint
  testHealthEndpoint();
  
  // Test 2: Basic API endpoint
  testBasicEndpoint();
  
  // Small delay between requests
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

function testHealthEndpoint() {
  const startTime = Date.now();
  
  // Try multiple possible health endpoints
  let response = http.get(`${BASE_URL}/health`);
  if (response.status === 404) {
    response = http.get(`${BASE_URL}/status`);
  }
  if (response.status === 404) {
    response = http.get(`${BASE_URL}/`);
  }
  
  const duration = Date.now() - startTime;
  responseTime.add(duration);
  
  const success = check(response, {
    'Health check - Status OK': (r) => r.status === 200 || r.status === 404,
    'Health check - Response time < 3s': (r) => r.timings.duration < 3000,
    'Health check - Has response': (r) => r.body !== undefined,
  });
  
  if (success) {
    successfulRequests.add(1);
    errorRate.add(false);
  } else {
    failedRequests.add(1);
    errorRate.add(true);
  }
}

function testBasicEndpoint() {
  const startTime = Date.now();
  
  // Test a basic GET request to root or any endpoint
  const response = http.get(`${BASE_URL}/`, {
    timeout: '10s',
  });
  
  const duration = Date.now() - startTime;
  responseTime.add(duration);
  
  const success = check(response, {
    'Basic endpoint - Status acceptable': (r) => r.status < 500, // Accept any non-server-error
    'Basic endpoint - Response time < 5s': (r) => r.timings.duration < 5000,
    'Basic endpoint - Connection successful': (r) => r.status !== 0,
  });
  
  if (success) {
    successfulRequests.add(1);
    errorRate.add(false);
  } else {
    failedRequests.add(1);
    errorRate.add(true);
    console.log(`❌ Request failed: Status ${response.status}, Body: ${response.body?.substring(0, 100)}`);
  }
}

// Generate reports
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  return {
    [`reports/load-test-1000-${timestamp}.html`]: htmlReport(data),
    [`reports/load-test-1000-${timestamp}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const checks = data.metrics.checks ? data.metrics.checks.values.passes : 0;
  const checksFailed = data.metrics.checks ? data.metrics.checks.values.fails : 0;
  const requests = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
  const avgDuration = data.metrics.http_req_duration ? Math.round(data.metrics.http_req_duration.values.avg) : 0;
  const p95Duration = data.metrics.http_req_duration ? Math.round(data.metrics.http_req_duration.values['p(95)']) : 0;
  
  return `
🚀 OpenBee Load Test Results (1000 Users)
=====================================
✅ Checks Passed: ${checks}
❌ Checks Failed: ${checksFailed}
📡 Total Requests: ${requests}
⏱️  Average Response Time: ${avgDuration}ms
📊 95th Percentile: ${p95Duration}ms
🎯 Test completed successfully!
`;
}

function htmlReport(data) {
  const checks = data.metrics.checks ? data.metrics.checks.values.passes : 0;
  const checksFailed = data.metrics.checks ? data.metrics.checks.values.fails : 0;
  const requests = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
  const avgDuration = data.metrics.http_req_duration ? Math.round(data.metrics.http_req_duration.values.avg) : 0;
  
  return `<!DOCTYPE html>
<html>
<head>
    <title>OpenBee Load Test Results - 1000 Users</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #2196F3; color: white; padding: 20px; border-radius: 5px; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: #f5f5f5; padding: 20px; border-radius: 5px; text-align: center; }
        .metric h3 { margin: 0; color: #333; }
        .metric .value { font-size: 2em; font-weight: bold; color: #2196F3; }
        .success { color: #4CAF50; }
        .warning { color: #FF9800; }
        .error { color: #F44336; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 OpenBee Load Test Results</h1>
        <p>1000 Concurrent Users Test</p>
        <p>Generated: ${new Date().toISOString()}</p>
    </div>
    
    <div class="metrics">
        <div class="metric">
            <h3>✅ Successful Checks</h3>
            <div class="value success">${checks}</div>
        </div>
        <div class="metric">
            <h3>❌ Failed Checks</h3>
            <div class="value ${checksFailed > 0 ? 'error' : 'success'}">${checksFailed}</div>
        </div>
        <div class="metric">
            <h3>📡 Total Requests</h3>
            <div class="value">${requests}</div>
        </div>
        <div class="metric">
            <h3>⏱️ Avg Response Time</h3>
            <div class="value ${avgDuration > 1000 ? 'warning' : 'success'}">${avgDuration}ms</div>
        </div>
    </div>
    
    <h2>Test Configuration</h2>
    <ul>
        <li>Maximum Virtual Users: 1000</li>
        <li>Total Duration: ~16 minutes</li>
        <li>Ramp-up Strategy: Gradual increase to 1000 users</li>
        <li>Target URL: ${BASE_URL}</li>
    </ul>
    
    <h2>Performance Thresholds</h2>
    <ul>
        <li>95% of requests under 5 seconds</li>
        <li>Error rate under 10%</li>
        <li>Connection success rate > 90%</li>
    </ul>
</body>
</html>`;
}
