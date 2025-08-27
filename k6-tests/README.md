# 🚀 OpenBee Load Testing Suite

Comprehensive k6 load testing setup for the OpenBee AI Document Analysis Platform.

## 📋 Overview

OpenBee is an AI-powered document processing application that:
- 📄 Analyzes PDF documents with OCR support for scanned files
- 🖼️ Processes images using AI vision models (LLaVA)
- 🧠 Uses local Ollama models for AI processing
- 🐳 Runs in Docker containers

This load testing suite provides comprehensive performance testing capabilities with:
- Multiple test scenarios (load, stress, endurance, spike)
- Real-time monitoring with Grafana & InfluxDB
- Environment-specific configurations
- Automated reporting and CI integration

## 🎯 Test Scenarios

### 📈 Load Testing
- **Purpose**: Normal expected load simulation
- **Duration**: 3-10 minutes
- **Virtual Users**: 5-20 concurrent users
- **Focus**: Response times and throughput under normal conditions

### 🔥 Stress Testing  
- **Purpose**: High load beyond normal capacity
- **Duration**: 2-5 minutes
- **Virtual Users**: 25-100 concurrent users
- **Focus**: System behavior under stress

### ⚡ Spike Testing
- **Purpose**: Sudden load increase simulation
- **Duration**: 1-3 minutes
- **Virtual Users**: Up to 200 sudden concurrent users
- **Focus**: System resilience to traffic spikes

### 🔄 Endurance Testing
- **Purpose**: Long-term stability testing
- **Duration**: 15-30 minutes
- **Virtual Users**: 5-20 steady concurrent users
- **Focus**: Memory leaks, resource degradation

## 🏗️ Setup Instructions

### Prerequisites

1. **Install k6**
   ```bash
   # Windows (Chocolatey)
   choco install k6
   
   # macOS (Homebrew)
   brew install k6
   
   # Linux (Debian/Ubuntu)
   sudo apt install k6
   ```

2. **Docker & Docker Compose** (for monitoring)
   - [Install Docker Desktop](https://www.docker.com/products/docker-desktop)

3. **OpenBee Application Running**
   ```bash
   # In the project root
   docker-compose up -d
   ```

### Quick Start

1. **Simple Load Test**
   ```powershell
   # Windows PowerShell
   cd k6-tests
   .\run-load-test.ps1 -Environment dev -TestType load
   ```

   ```bash
   # Linux/macOS Bash
   cd k6-tests
   ./run-load-test.sh development load
   ```

2. **With Monitoring** (Recommended)
   ```bash
   # Start monitoring stack
   docker-compose -f docker-compose.load-test.yml up -d influxdb grafana
   
   # Wait for services to start (30 seconds)
   # Then run load test with metrics
   K6_OUT=influxdb=http://localhost:8086/k6 k6 run enhanced-load-test.js
   
   # View results at http://localhost:3002 (Grafana)
   # Login: admin/admin123
   ```

## 📊 Monitoring & Dashboards

### Grafana Dashboard
- **URL**: http://localhost:3002
- **Credentials**: admin/admin123
- **Features**: 
  - Real-time metrics visualization
  - Response time percentiles
  - Error rate tracking
  - Throughput analysis
  - File type specific metrics

### InfluxDB
- **URL**: http://localhost:8086
- **Database**: k6
- **Credentials**: k6/k6password

## 📁 Project Structure

```
k6-tests/
├── enhanced-load-test.js          # Main k6 test script
├── configs/
│   ├── development.json           # Dev environment config
│   └── production.json            # Prod environment config
├── monitoring/
│   ├── grafana/                   # Grafana configuration
│   └── prometheus/                # Prometheus config (optional)
├── reports/                       # Generated test reports
├── run-load-test.ps1             # Windows runner script
├── run-load-test.sh              # Linux/macOS runner script
├── docker-compose.load-test.yml  # Monitoring stack
└── README.md                     # This file
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3001` | OpenBee backend URL |
| `TEST_ENV` | `development` | Test environment |
| `DATASET_BASE` | `../datasets` | Test dataset path |
| `MANIFEST` | `../datasets/dataset.manifest.json` | Dataset manifest |
| `MIN_RESPONSE_CHARS` | `100` | Minimum valid response length |
| `REPORT_PREFIX` | `openbee-load-test` | Report file prefix |

### Test Files

The load test uses files from `backend/tests/fixtures/`:
- `document2.pdf` - Sample PDF document
- `scannedpdf.pdf` - Scanned PDF for OCR testing
- `image.png` - Sample image for vision analysis

## 📈 Performance Thresholds

### Development Environment
- **Error Rate**: < 10%
- **Response Time**: p95 < 60s
- **PDF Processing**: p95 < 90s
- **Image Processing**: p95 < 45s

### Production Environment  
- **Error Rate**: < 5%
- **Response Time**: p95 < 45s
- **PDF Processing**: p95 < 60s
- **Image Processing**: p95 < 30s

## 🎛️ Advanced Usage

### Custom Test Duration
```powershell
.\run-load-test.ps1 -Environment dev -TestType stress -Duration 15m
```

### Custom Virtual Users
```bash
MAX_VUS=50 k6 run enhanced-load-test.js
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Run Load Tests
  run: |
    cd k6-tests
    ./run-load-test.sh production load 5m
    
- name: Archive Reports
  uses: actions/upload-artifact@v3
  with:
    name: load-test-reports
    path: k6-tests/reports/
```

## 📊 Metrics & KPIs

### Core Metrics
- **Request Rate**: Requests per second
- **Response Time**: p50, p90, p95, p99 percentiles
- **Error Rate**: Failed requests percentage
- **Throughput**: Successful requests per second

### AI-Specific Metrics
- **PDF Processing Time**: Time to analyze PDF documents
- **Image Processing Time**: Time to analyze images
- **OCR Performance**: Scanned document processing time
- **AI Model Response**: Ollama model response times

### Business Metrics
- **Document Success Rate**: Successfully processed documents
- **User Experience**: Response times from user perspective
- **System Capacity**: Maximum sustainable load
- **Resource Utilization**: CPU, memory, disk usage

## 🐛 Troubleshooting

### Common Issues

1. **k6 not found**
   - Install k6 following the prerequisites
   - Ensure k6 is in your PATH

2. **Connection refused**
   - Verify OpenBee is running: `docker-compose ps`
   - Check BASE_URL environment variable

3. **Test files not found**
   - Ensure fixture files exist in `backend/tests/fixtures/`
   - Check DATASET_BASE path

4. **High error rates**
   - Check Ollama models are downloaded
   - Verify sufficient system resources
   - Review OpenBee backend logs

### Debugging

```bash
# Enable verbose logging
K6_LOG_LEVEL=debug k6 run enhanced-load-test.js

# Check specific test phase
K6_LOG_LEVEL=info k6 run enhanced-load-test.js 2>&1 | grep "PDF\|Image"

# Monitor system resources during test
docker stats
```

## 🚀 Next Steps

1. **Baseline Establishment**: Run initial tests to establish performance baselines
2. **CI Integration**: Add automated load testing to your CI/CD pipeline
3. **Alert Setup**: Configure monitoring alerts for performance degradation
4. **Capacity Planning**: Use results for infrastructure scaling decisions
5. **Regular Testing**: Schedule periodic load tests to catch regressions

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review OpenBee backend logs
3. Verify system requirements
4. Check k6 documentation: https://k6.io/docs/

## 📜 License

This load testing suite is part of the OpenBee project and follows the same license terms.

---

**🎉 Happy Load Testing!** 

Use this suite to ensure OpenBee can handle your expected load and provide a great user experience for document analysis.
