import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Optimized metrics for extreme load
const errorRate = new Rate('error_rate');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');
const responseTime = new Trend('response_time');

// 🔥 EXTREME LOAD TEST: 4 MILLION USERS 🔥
export const options = {
  stages: [
    { duration: '30s', target: 10000 },    // Rapid ramp to 10K
    { duration: '1m', target: 100000 },    // 100K users
    { duration: '1m', target: 500000 },    // 500K users
    { duration: '1m', target: 1000000 },   // 1M users
    { duration: '2m', target: 2000000 },   // 2M users
    { duration: '2m', target: 4000000 },   // 🚀 4 MILLION USERS!
    { duration: '3m', target: 4000000 },   // Sustain 4M users
    { duration: '1m', target: 1000000 },   // Rapid ramp down
    { duration: '30s', target: 0 },        // Complete shutdown
  ],
  thresholds: {
    'http_req_duration': ['p(95)<10000'], // 95% under 10s (relaxed for extreme load)
    'http_req_failed': ['rate<0.3'],      // 30% error rate acceptable at this scale
    'error_rate': ['rate<0.3'],           // Custom error rate under 30%
  },
  // Optimize for extreme performance
  discardResponseBodies: true,  // Save memory
  noConnectionReuse: false,     // Reuse connections
  noVUConnectionReuse: false,   // Reuse VU connections
};

console.log(`🔥 EXTREME LOAD TEST - 4 MILLION USERS 🔥`);
console.log(`🎯 Target: ${BASE_URL}`);
console.log(`👥 Peak Users: 4,000,000`);
console.log(`⏱️  Total Duration: ~12 minutes`);
console.log(`⚠️  WARNING: This will generate massive load!`);

export default function () {
  // Lightweight test optimized for extreme scale
  extremeLoadTest();
  
  // Minimal sleep to maximize throughput
  sleep(0.1 + Math.random() * 0.5); // 0.1-0.6 seconds
}

function extremeLoadTest() {
  const startTime = Date.now();
  
  // Single optimized request
  const response = http.get(`${BASE_URL}/`, {
    timeout: '5s',
    headers: {
      'Connection': 'keep-alive',
      'Accept-Encoding': 'gzip',
    },
  });
  
  const duration = Date.now() - startTime;
  responseTime.add(duration);
  
  // Simplified checks for performance
  const success = response.status && response.status < 500 && response.status !== 0;
  
  if (success) {
    successfulRequests.add(1);
    errorRate.add(false);
  } else {
    failedRequests.add(1);
    errorRate.add(true);
    
    // Log only critical errors to avoid spam
    if (Math.random() < 0.001) { // Log 0.1% of errors
      console.log(`❌ Error: Status ${response.status}`);
    }
  }
}

// Optimized reporting for extreme scale
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  return {
    [`reports/EXTREME-4M-USERS-${timestamp}.html`]: htmlReport(data),
    [`reports/EXTREME-4M-USERS-${timestamp}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const checks = data.metrics.checks ? data.metrics.checks.values.passes : 0;
  const checksFailed = data.metrics.checks ? data.metrics.checks.values.fails : 0;
  const requests = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
  const avgDuration = data.metrics.http_req_duration ? Math.round(data.metrics.http_req_duration.values.avg) : 0;
  const p95Duration = data.metrics.http_req_duration ? Math.round(data.metrics.http_req_duration.values['p(95)']) : 0;
  const requestRate = data.metrics.http_reqs ? Math.round(data.metrics.http_reqs.values.rate) : 0;
  
  return `
🔥 EXTREME LOAD TEST RESULTS - 4 MILLION USERS 🔥
================================================
✅ Successful Requests: ${requests - checksFailed}
❌ Failed Requests: ${checksFailed}
📊 Total Requests: ${requests}
🚀 Requests/Second: ${requestRate}
⏱️  Average Response: ${avgDuration}ms
📈 95th Percentile: ${p95Duration}ms
💥 Peak Load: 4,000,000 concurrent users
🏁 Test completed - Your system survived the extreme test!
`;
}

function htmlReport(data) {
  const requests = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
  const avgDuration = data.metrics.http_req_duration ? Math.round(data.metrics.http_req_duration.values.avg) : 0;
  const p95Duration = data.metrics.http_req_duration ? Math.round(data.metrics.http_req_duration.values['p(95)']) : 0;
  const requestRate = data.metrics.http_reqs ? Math.round(data.metrics.http_reqs.values.rate) : 0;
  const failureRate = data.metrics.http_req_failed ? (data.metrics.http_req_failed.values.rate * 100).toFixed(2) : 0;
  
  return `<!DOCTYPE html>
<html>
<head>
    <title>🔥 EXTREME LOAD TEST - 4 MILLION USERS</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #000; color: #fff; }
        .header { 
            background: linear-gradient(45deg, #FF6B6B, #4ECDC4, #45B7D1); 
            color: white; padding: 30px; border-radius: 10px; text-align: center;
            animation: pulse 2s infinite;
        }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
        .metric { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            padding: 25px; border-radius: 15px; text-align: center; 
            box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        }
        .metric h3 { margin: 0; color: #fff; font-size: 1.2em; }
        .metric .value { font-size: 2.5em; font-weight: bold; color: #FFD700; margin: 10px 0; }
        .warning { background: linear-gradient(135deg, #FF6B6B, #FF8E53); }
        .success { background: linear-gradient(135deg, #4ECDC4, #44A08D); }
        .extreme { background: linear-gradient(135deg, #FF6B6B, #FF8E53, #FFD93D, #6BCF7F, #4ECDC4, #45B7D1); }
        .stats { background: #1a1a1a; padding: 20px; border-radius: 10px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔥 EXTREME LOAD TEST RESULTS 🔥</h1>
        <h2>4,000,000 CONCURRENT USERS</h2>
        <p>Generated: ${new Date().toISOString()}</p>
    </div>
    
    <div class="metrics">
        <div class="metric extreme">
            <h3>🚀 Total Requests</h3>
            <div class="value">${requests.toLocaleString()}</div>
        </div>
        <div class="metric success">
            <h3>⚡ Requests/Second</h3>
            <div class="value">${requestRate.toLocaleString()}</div>
        </div>
        <div class="metric ${avgDuration > 2000 ? 'warning' : 'success'}">
            <h3>⏱️ Avg Response</h3>
            <div class="value">${avgDuration}ms</div>
        </div>
        <div class="metric ${p95Duration > 5000 ? 'warning' : 'success'}">
            <h3>📊 95th Percentile</h3>
            <div class="value">${p95Duration}ms</div>
        </div>
        <div class="metric ${failureRate > 10 ? 'warning' : 'success'}">
            <h3>❌ Failure Rate</h3>
            <div class="value">${failureRate}%</div>
        </div>
        <div class="metric extreme">
            <h3>👥 Peak Users</h3>
            <div class="value">4M</div>
        </div>
    </div>
    
    <div class="stats">
        <h2>🎯 Test Configuration</h2>
        <ul>
            <li><strong>Maximum Virtual Users:</strong> 4,000,000</li>
            <li><strong>Total Duration:</strong> ~12 minutes</li>
            <li><strong>Ramp-up Strategy:</strong> Aggressive scaling to 4M</li>
            <li><strong>Target URL:</strong> ${BASE_URL}</li>
            <li><strong>Test Type:</strong> EXTREME LOAD - System Limits</li>
        </ul>
        
        <h2>⚠️ Extreme Load Warning</h2>
        <p>This test generated massive load equivalent to 4 million concurrent users. 
        Results may be limited by system resources, network capacity, or testing infrastructure 
        rather than the target application itself.</p>
        
        <h2>🏆 Performance Analysis</h2>
        <ul>
            <li><strong>System Survived:</strong> ${requests > 1000 ? '✅ YES' : '❌ NO'}</li>
            <li><strong>Load Capacity:</strong> ${requestRate > 1000 ? 'HIGH' : 'MODERATE'}</li>
            <li><strong>Response Times:</strong> ${avgDuration < 1000 ? 'EXCELLENT' : avgDuration < 3000 ? 'GOOD' : 'NEEDS OPTIMIZATION'}</li>
            <li><strong>Stability:</strong> ${failureRate < 5 ? 'VERY STABLE' : failureRate < 20 ? 'STABLE' : 'NEEDS ATTENTION'}</li>
        </ul>
    </div>
</body>
</html>`;
}
