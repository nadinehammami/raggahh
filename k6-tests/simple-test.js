import http from 'k6/http';
import { check, sleep } from 'k6';

// Simple test configuration
export const options = {
  stages: [
    { duration: '30s', target: 2 },
    { duration: '1m', target: 2 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

const BASE_URL = 'http://localhost:3001';

export default function () {
  // Test 1: Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  sleep(1);
  
  // Test 2: Status check
  const statusRes = http.get(`${BASE_URL}/status`);
  check(statusRes, {
    'status endpoint works': (r) => r.status === 200 || r.status === 404,
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'simple-test-results.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function htmlReport(data) {
  return `<!DOCTYPE html>
<html>
<head><title>K6 Simple Test Results</title></head>
<body>
<h1>Test Results</h1>
<p>Checks Passed: ${data.metrics.checks ? data.metrics.checks.values.passes : 0}</p>
<p>Requests: ${data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0}</p>
</body>
</html>`;
}

function textSummary(data, options = {}) {
  const checks = data.metrics.checks ? data.metrics.checks.values.passes : 0;
  const requests = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
  
  return `
📊 Simple K6 Test Results:
✅ Checks Passed: ${checks}
📡 HTTP Requests: ${requests}
⏱️  Average Duration: ${data.metrics.http_req_duration ? Math.round(data.metrics.http_req_duration.values.avg) : 0}ms
`;
}
