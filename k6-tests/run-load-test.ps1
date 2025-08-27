# OpenBee Load Test Runner (PowerShell)
# Usage: .\run-load-test.ps1 [-Environment dev|prod] [-TestType load|stress|endurance|spike] [-Duration 5m]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "prod", "development", "production")]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("load", "stress", "endurance", "spike", "all")]
    [string]$TestType = "load",
    
    [Parameter(Mandatory=$false)]
    [string]$Duration = "",
    
    [Parameter(Mandatory=$false)]
    [string]$BaseUrl = "",
    
    [Parameter(Mandatory=$false)]
    [int]$MaxVus = 0,
    
    [Parameter(Mandatory=$false)]
    [switch]$Help
)

if ($Help) {
    Write-Host "🚀 OpenBee Load Test Runner" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\run-load-test.ps1 -Environment dev -TestType load"
    Write-Host "  .\run-load-test.ps1 -Environment prod -TestType stress -Duration 10m"
    Write-Host ""
    Write-Host "Parameters:" -ForegroundColor Yellow
    Write-Host "  -Environment  : dev, prod (default: dev)"
    Write-Host "  -TestType     : load, stress, endurance, spike, all (default: load)"
    Write-Host "  -Duration     : Override test duration (e.g., 5m, 30s)"
    Write-Host "  -BaseUrl      : Override base URL"
    Write-Host "  -MaxVus       : Override maximum virtual users"
    Write-Host "  -Help         : Show this help message"
    Write-Host ""
    exit 0
}

# Normalize environment name
if ($Environment -eq "dev") { $Environment = "development" }
if ($Environment -eq "prod") { $Environment = "production" }

Write-Host "🚀 Starting OpenBee Load Test" -ForegroundColor Cyan
Write-Host "📊 Environment: $Environment" -ForegroundColor Green
Write-Host "🎯 Test Type: $TestType" -ForegroundColor Green

# Check if k6 is installed
if (!(Get-Command "k6" -ErrorAction SilentlyContinue)) {
    Write-Host "❌ k6 is not installed. Please install k6 first:" -ForegroundColor Red
    Write-Host "   Windows: choco install k6" -ForegroundColor Yellow
    Write-Host "   Or download from: https://k6.io/docs/getting-started/installation/" -ForegroundColor Yellow
    exit 1
}

# Create reports directory
$reportsDir = "reports"
if (!(Test-Path $reportsDir)) {
    New-Item -ItemType Directory -Path $reportsDir | Out-Null
    Write-Host "📁 Created reports directory" -ForegroundColor Blue
}

# Set environment variables
$env:TEST_ENV = $Environment
$env:REPORT_PREFIX = "openbee-$TestType"

if ($BaseUrl) {
    $env:BASE_URL = $BaseUrl
    Write-Host "🌐 Base URL: $BaseUrl" -ForegroundColor Blue
}

if ($Duration) {
    $env:TEST_DURATION = $Duration
    Write-Host "⏱️ Duration: $Duration" -ForegroundColor Blue
}

if ($MaxVus -gt 0) {
    $env:MAX_VUS = $MaxVus
    Write-Host "👥 Max VUs: $MaxVus" -ForegroundColor Blue
}

# Determine test script
$testScript = "enhanced-load-test.js"
if ($TestType -ne "all" -and $TestType -ne "load") {
    $testScript = "enhanced-load-test.js" # Same script handles all test types
}

Write-Host ""
Write-Host "🎯 Executing k6 test..." -ForegroundColor Cyan

try {
    # Run k6 test
    $k6Command = "k6 run $testScript"
    Write-Host "💻 Command: $k6Command" -ForegroundColor Gray
    
    Invoke-Expression $k6Command
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Load test completed successfully!" -ForegroundColor Green
        Write-Host "📊 Check the reports directory for detailed results" -ForegroundColor Blue
    } else {
        Write-Host ""
        Write-Host "❌ Load test failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error running load test: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Show report files
Write-Host ""
Write-Host "📁 Generated reports:" -ForegroundColor Cyan
Get-ChildItem -Path $reportsDir -Name "openbee-*" | Sort-Object LastWriteTime -Descending | Select-Object -First 5 | ForEach-Object {
    Write-Host "  📄 $_" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🎉 Load test execution completed!" -ForegroundColor Green
