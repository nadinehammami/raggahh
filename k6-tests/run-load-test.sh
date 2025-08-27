#!/bin/bash

# OpenBee Load Test Runner (Bash)
# Usage: ./run-load-test.sh [environment] [test-type] [duration]

set -e

# Default values
ENVIRONMENT="${1:-development}"
TEST_TYPE="${2:-load}"
DURATION="${3:-}"
BASE_URL="${4:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Help function
show_help() {
    echo -e "${CYAN}🚀 OpenBee Load Test Runner${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./run-load-test.sh [environment] [test-type] [duration] [base-url]"
    echo ""
    echo -e "${YELLOW}Parameters:${NC}"
    echo "  environment : development|production (default: development)"
    echo "  test-type   : load|stress|endurance|spike|all (default: load)"
    echo "  duration    : Override test duration (e.g., 5m, 30s)"
    echo "  base-url    : Override base URL (default: http://localhost:3001)"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  ./run-load-test.sh development load"
    echo "  ./run-load-test.sh production stress 10m"
    echo "  ./run-load-test.sh development all \"\" http://localhost:3001"
    echo ""
    exit 0
}

# Check for help flag
if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    show_help
fi

echo -e "${CYAN}🚀 Starting OpenBee Load Test${NC}"
echo -e "${GREEN}📊 Environment: $ENVIRONMENT${NC}"
echo -e "${GREEN}🎯 Test Type: $TEST_TYPE${NC}"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}❌ k6 is not installed. Please install k6 first:${NC}"
    echo -e "${YELLOW}   macOS: brew install k6${NC}"
    echo -e "${YELLOW}   Linux: sudo apt install k6 (or equivalent)${NC}"
    echo -e "${YELLOW}   Or download from: https://k6.io/docs/getting-started/installation/${NC}"
    exit 1
fi

# Create reports directory
mkdir -p reports
echo -e "${BLUE}📁 Reports directory ready${NC}"

# Set environment variables
export TEST_ENV="$ENVIRONMENT"
export REPORT_PREFIX="openbee-$TEST_TYPE"

if [[ -n "$BASE_URL" ]]; then
    export BASE_URL="$BASE_URL"
    echo -e "${BLUE}🌐 Base URL: $BASE_URL${NC}"
fi

if [[ -n "$DURATION" ]]; then
    export TEST_DURATION="$DURATION"
    echo -e "${BLUE}⏱️ Duration: $DURATION${NC}"
fi

# Determine test script
TEST_SCRIPT="enhanced-load-test.js"

echo ""
echo -e "${CYAN}🎯 Executing k6 test...${NC}"
echo -e "${NC}💻 Command: k6 run $TEST_SCRIPT${NC}"

# Run k6 test
if k6 run "$TEST_SCRIPT"; then
    echo ""
    echo -e "${GREEN}✅ Load test completed successfully!${NC}"
    echo -e "${BLUE}📊 Check the reports directory for detailed results${NC}"
else
    echo ""
    echo -e "${RED}❌ Load test failed${NC}"
    exit 1
fi

# Show recent report files
echo ""
echo -e "${CYAN}📁 Generated reports:${NC}"
ls -lt reports/openbee-* 2>/dev/null | head -5 | while read -r line; do
    filename=$(echo "$line" | awk '{print $NF}')
    echo -e "  📄 $filename"
done

echo ""
echo -e "${GREEN}🎉 Load test execution completed!${NC}"
