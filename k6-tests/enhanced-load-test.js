import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Counter, Trend } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.4/index.js';

/* =======================
   ENHANCED CONFIGURATION
======================= */
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const DATASET_BASE = __ENV.DATASET_BASE || '../datasets';
const MANIFEST_PATH = __ENV.MANIFEST || `${DATASET_BASE}/dataset.manifest.json`;
const TEST_ENV = __ENV.TEST_ENV || 'development';
const REPORT_PREFIX = __ENV.REPORT_PREFIX || 'openbee-load-test';

// Load configuration
const manifest = JSON.parse(open(MANIFEST_PATH));
const basePath = manifest.base_path || DATASET_BASE;

console.log(`🚀 OpenBee Load Test Starting`);
console.log(`📊 Environment: ${TEST_ENV}`);
console.log(`🎯 Target: ${BASE_URL}`);
console.log(`📁 Dataset: ${basePath}`);
console.log(`📄 PDFs: ${manifest.pdfs.length}, Images: ${manifest.images.length}`);

/* =======================
   ENHANCED METRICS
======================= */
const errorRate = new Rate('error_rate');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');
const responseValidation = new Rate('response_validation_success');
const processingTime = new Trend('ai_processing_time');
const fileUploadTime = new Trend('file_upload_time');

// Custom metrics for different file types
const pdfProcessingTime = new Trend('pdf_processing_time');
const imageProcessingTime = new Trend('image_processing_time');
const pdfSuccessRate = new Rate('pdf_success_rate');
const imageSuccessRate = new Rate('image_success_rate');

/* =======================
   DATA LOADING WITH ERROR HANDLING
======================= */
function safeFileLoad(filePath, fileName) {
  try {
    return {
      name: fileName,
      content: open(filePath, 'b'),
      loaded: true
    };
  } catch (e) {
    console.warn(`⚠️ Could not load ${fileName}: ${e.message}`);
    return {
      name: fileName,
      content: null,
      loaded: false
    };
  }
}

const PDFs = new SharedArray('pdfs', () => {
  return manifest.pdfs.map(fileName => {
    const filePath = `${basePath}/${fileName}`;
    const fileData = safeFileLoad(filePath, fileName);
    return {
      ...fileData,
      mime: 'application/pdf',
      action: 'resumer'
    };
  }).filter(item => item.loaded);
});

const Images = new SharedArray('images', () => {
  return manifest.images.map(fileName => {
    const filePath = `${basePath}/${fileName}`;
    const fileData = safeFileLoad(filePath, fileName);
    return {
      ...fileData,
      mime: getMimeType(fileName),
      action: 'decrire'
    };
  }).filter(item => item.loaded);
});

function getMimeType(fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeMap = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif'
  };
  return mimeMap[ext] || 'image/png';
}

/* =======================
   ENHANCED TEST SCENARIOS
======================= */
export const options = {
  scenarios: {
    // 🚀 Warm-up Phase
    warmup: {
      executor: 'constant-vus',
      vus: 2,
      duration: '30s',
      startTime: '0s',
      tags: { phase: 'warmup' },
      exec: 'warmupTest'
    },
    
    // 📈 Load Testing - PDF Analysis
    load_test_pdf: {
      executor: 'ramping-vus',
      startTime: '30s',
      stages: [
        { duration: '1m', target: 5 },
        { duration: '3m', target: 15 },
        { duration: '2m', target: 20 },
        { duration: '1m', target: 5 },
        { duration: '30s', target: 0 }
      ],
      tags: { type: 'pdf', phase: 'load' },
      exec: 'testPdfAnalysis'
    },

    // 🖼️ Load Testing - Image Analysis  
    load_test_image: {
      executor: 'ramping-vus',
      startTime: '30s',
      stages: [
        { duration: '1m', target: 3 },
        { duration: '3m', target: 10 },
        { duration: '2m', target: 15 },
        { duration: '1m', target: 3 },
        { duration: '30s', target: 0 }
      ],
      tags: { type: 'image', phase: 'load' },
      exec: 'testImageAnalysis'
    },

    // 🔥 Stress Testing
    stress_test: {
      executor: 'ramping-vus',
      startTime: '8m',
      stages: [
        { duration: '1m', target: 30 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 30 },
        { duration: '1m', target: 0 }
      ],
      tags: { phase: 'stress' },
      exec: 'stressTest'
    },

    // ⚡ Spike Testing
    spike_test: {
      executor: 'ramping-vus',
      startTime: '13m',
      stages: [
        { duration: '10s', target: 0 },
        { duration: '20s', target: 100 },
        { duration: '10s', target: 0 }
      ],
      tags: { phase: 'spike' },
      exec: 'spikeTest'
    }
  },

  // 🎯 Enhanced Thresholds
  thresholds: {
    // Overall system health
    'http_req_failed': ['rate<0.05'], // < 5% error rate
    'error_rate': ['rate<0.05'],
    
    // Performance requirements
    'http_req_duration{phase:load}': ['p(95)<45000'], // 45s for load tests
    'http_req_duration{phase:stress}': ['p(95)<60000'], // 60s for stress tests
    'http_req_duration{phase:spike}': ['p(90)<90000'], // 90s for spike tests
    
    // File type specific performance
    'pdf_processing_time': ['p(95)<60000'], // PDF processing < 60s
    'image_processing_time': ['p(95)<30000'], // Image processing < 30s
    
    // Success rates
    'pdf_success_rate': ['rate>0.85'], // 85% success rate for PDFs
    'image_success_rate': ['rate>0.90'], // 90% success rate for images
    'response_validation_success': ['rate>0.90']
  },

  summaryTrendStats: ['min', 'avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  summaryTimeUnit: 'ms'
};

/* =======================
   UTILITY FUNCTIONS
======================= */
function randomSleep(min = 0.5, max = 2) {
  sleep(Math.random() * (max - min) + min);
}

function pickRandomFile(fileArray) {
  if (!fileArray || fileArray.length === 0) {
    console.error('❌ No files available for testing');
    return null;
  }
  return fileArray[Math.floor(Math.random() * fileArray.length)];
}

function validateResponse(response, fileType, fileName) {
  const isValid = response && 
                 response.status === 200 && 
                 response.body && 
                 response.body.length >= manifest.test_config.min_response_chars &&
                 response.headers['Content-Type']?.includes('text/plain');
  
  responseValidation.add(isValid);
  
  if (isValid) {
    successfulRequests.add(1);
    const processingTimeValue = response.timings.duration;
    processingTime.add(processingTimeValue);
    
    if (fileType === 'pdf') {
      pdfProcessingTime.add(processingTimeValue);
      pdfSuccessRate.add(1);
    } else if (fileType === 'image') {
      imageProcessingTime.add(processingTimeValue);
      imageSuccessRate.add(1);
    }
  } else {
    failedRequests.add(1);
    if (fileType === 'pdf') {
      pdfSuccessRate.add(0);
    } else if (fileType === 'image') {
      imageSuccessRate.add(0);
    }
  }

  return isValid;
}

function makeAnalysisRequest(file, timeout = '120s') {
  if (!file || !file.content) {
    console.error('❌ Invalid file data');
    return null;
  }

  const formData = {
    file: http.file(file.content, file.name, file.mime),
    action: file.action
  };

  const params = {
    tags: { 
      type: file.action === 'resumer' ? 'pdf' : 'image',
      file: file.name,
      action: file.action
    },
    timeout: timeout
  };

  const startTime = Date.now();
  const response = http.post(`${BASE_URL}/analyze`, formData, params);
  const uploadTime = Date.now() - startTime;
  
  fileUploadTime.add(uploadTime);
  errorRate.add(response.status !== 200);

  return response;
}

/* =======================
   TEST FUNCTIONS
======================= */
export function warmupTest() {
  group('🔥 Warmup Phase', () => {
    const healthResponse = http.get(`${BASE_URL}/`);
    check(healthResponse, {
      'Service is responding': (r) => r.status === 404 || r.status === 200, // 404 is OK for root path
    });
    
    randomSleep(1, 3);
  });
}

export function testPdfAnalysis() {
  if (PDFs.length === 0) {
    console.warn('⚠️ No PDF files available for testing');
    return;
  }

  group('📄 PDF Analysis Test', () => {
    const file = pickRandomFile(PDFs);
    if (!file) return;

    console.log(`📄 Processing PDF: ${file.name}`);
    const response = makeAnalysisRequest(file, '120s');
    
    const isValid = validateResponse(response, 'pdf', file.name);
    
    check(response, {
      '📄 PDF - Status 200': (r) => r.status === 200,
      '📄 PDF - Valid response': () => isValid,
      '📄 PDF - Processing time < 120s': (r) => r.timings.duration < 120000,
    });

    randomSleep(1, 3);
  });
}

export function testImageAnalysis() {
  if (Images.length === 0) {
    console.warn('⚠️ No image files available for testing');
    return;
  }

  group('🖼️ Image Analysis Test', () => {
    const file = pickRandomFile(Images);
    if (!file) return;

    console.log(`🖼️ Processing Image: ${file.name}`);
    const response = makeAnalysisRequest(file, '60s');
    
    const isValid = validateResponse(response, 'image', file.name);
    
    check(response, {
      '🖼️ Image - Status 200': (r) => r.status === 200,
      '🖼️ Image - Valid response': () => isValid,
      '🖼️ Image - Processing time < 60s': (r) => r.timings.duration < 60000,
    });

    randomSleep(0.5, 2);
  });
}

export function stressTest() {
  group('🔥 Stress Test', () => {
    // Randomly choose between PDF and Image testing
    const testPdf = Math.random() < 0.7; // 70% PDF, 30% Image
    
    if (testPdf && PDFs.length > 0) {
      testPdfAnalysis();
    } else if (Images.length > 0) {
      testImageAnalysis();
    }
    
    randomSleep(0.1, 1); // Shorter sleep for stress testing
  });
}

export function spikeTest() {
  group('⚡ Spike Test', () => {
    // Quick alternating tests during spike
    if (Math.random() < 0.5 && PDFs.length > 0) {
      const file = pickRandomFile(PDFs);
      const response = makeAnalysisRequest(file, '90s');
      check(response, {
        '⚡ Spike - Service handles load': (r) => r.status === 200 || r.status === 429,
      });
    } else if (Images.length > 0) {
      const file = pickRandomFile(Images);
      const response = makeAnalysisRequest(file, '90s');
      check(response, {
        '⚡ Spike - Service handles load': (r) => r.status === 200 || r.status === 429,
      });
    }
    
    // No sleep during spike - maximum pressure
  });
}

/* =======================
   ENHANCED REPORTING
======================= */
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const env = TEST_ENV;
  
  return {
    [`reports/${REPORT_PREFIX}-${env}-${timestamp}.html`]: htmlReport(data, { 
      title: `OpenBee Load Test Report - ${env.toUpperCase()}`,
      description: `Comprehensive load testing for OpenBee AI Document Analysis Platform`
    }),
    [`reports/${REPORT_PREFIX}-${env}-${timestamp}.json`]: JSON.stringify(data, null, 2),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    [`reports/summary-${env}-${timestamp}.txt`]: textSummary(data, { indent: ' ', enableColors: false })
  };
}

/* =======================
   INITIALIZATION LOG
======================= */
export function setup() {
  console.log('🎯 OpenBee Load Test Setup Complete');
  console.log(`📊 Test Files Loaded: ${PDFs.length} PDFs, ${Images.length} Images`);
  console.log(`🚀 Starting load test against: ${BASE_URL}`);
  return { startTime: Date.now() };
}
