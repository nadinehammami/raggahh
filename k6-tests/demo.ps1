# OpenBee Load Testing Demo Script
# This script demonstrates the complete load testing setup

param(
    [Parameter(Mandatory=$false)]
    [switch]$FullDemo = $false,
    
    [Parameter(Mandatory=$false)]
    [switch]$QuickDemo = $false,
    
    [Parameter(Mandatory=$false)]
    [switch]$MonitoringDemo = $false
)

$ErrorActionPreference = "Continue"

# Colors
$Red = [System.ConsoleColor]::Red
$Green = [System.ConsoleColor]::Green  
$Blue = [System.ConsoleColor]::Blue
$Cyan = [System.ConsoleColor]::Cyan
$Yellow = [System.ConsoleColor]::Yellow

function Write-ColorText($Text, $Color) {
    $currentColor = $host.ui.RawUI.ForegroundColor
    $host.ui.RawUI.ForegroundColor = $Color
    Write-Output $Text
    $host.ui.RawUI.ForegroundColor = $currentColor
}

function Show-Banner {
    Write-Host ""
    Write-ColorText "🚀 OpenBee Load Testing Demo" $Cyan
    Write-ColorText "================================" $Cyan
    Write-Host ""
}

function Check-Prerequisites {
    Write-ColorText "🔍 Checking prerequisites..." $Blue
    
    # Check k6
    if (Get-Command "k6" -ErrorAction SilentlyContinue) {
        Write-ColorText "✅ k6 is installed" $Green
        k6 version
    } else {
        Write-ColorText "❌ k6 not found. Please install k6 first:" $Red
        Write-ColorText "   choco install k6" $Yellow
        return $false
    }
    
    # Check Docker
    if (Get-Command "docker" -ErrorAction SilentlyContinue) {
        Write-ColorText "✅ Docker is available" $Green
    } else {
        Write-ColorText "⚠️ Docker not found (needed for monitoring)" $Yellow
    }
    
    # Check if OpenBee is running
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001" -Method GET -TimeoutSec 5 -ErrorAction Stop
        Write-ColorText "✅ OpenBee backend is running" $Green
    } catch {
        Write-ColorText "⚠️ OpenBee backend not accessible at http://localhost:3001" $Yellow
        Write-ColorText "   Please start with: docker-compose up -d" $Yellow
    }
    
    return $true
}

function Show-TestFiles {
    Write-ColorText "📁 Available test files:" $Blue
    
    $fixturesPath = "..\backend\tests\fixtures"
    if (Test-Path $fixturesPath) {
        Get-ChildItem $fixturesPath -File | ForEach-Object {
            Write-Host "  📄 $($_.Name) ($([math]::Round($_.Length/1KB, 2)) KB)"
        }
    } else {
        Write-ColorText "❌ Test fixtures not found at $fixturesPath" $Red
    }
}

function Run-QuickDemo {
    Write-ColorText "⚡ Running Quick Demo (30 seconds)..." $Cyan
    
    # Override environment for quick demo
    $env:TEST_ENV = "demo"
    $env:REPORT_PREFIX = "openbee-quick-demo"
    
    # Quick test configuration - just run a minimal test
    Write-Host "Running a quick 30-second load test with 2 virtual users..."
    
    try {
        $testScript = @"
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 2,
  duration: '30s',
};

export default function() {
  // Just test the health endpoint for demo
  let response = http.get('http://localhost:3001/');
  check(response, {
    'status is not 500': (r) => r.status !== 500,
  });
}
"@
        
        $testScript | Out-File -FilePath "quick-demo.js" -Encoding UTF8
        k6 run quick-demo.js
        Remove-Item "quick-demo.js" -ErrorAction SilentlyContinue
        
        Write-ColorText "✅ Quick demo completed!" $Green
    } catch {
        Write-ColorText "❌ Quick demo failed: $($_.Exception.Message)" $Red
    }
}

function Run-FullDemo {
    Write-ColorText "🎯 Running Full Demo..." $Cyan
    
    Write-Host "This demo will:"
    Write-Host "1. Run a 2-minute load test"
    Write-Host "2. Test both PDF and image analysis"
    Write-Host "3. Generate detailed reports"
    Write-Host ""
    
    # Create reports directory
    if (!(Test-Path "reports")) {
        New-Item -ItemType Directory -Path "reports" | Out-Null
    }
    
    # Set environment for demo
    $env:TEST_ENV = "demo"
    $env:REPORT_PREFIX = "openbee-full-demo"
    $env:BASE_URL = "http://localhost:3001"
    
    try {
        Write-ColorText "🚀 Starting enhanced load test..." $Blue
        k6 run enhanced-load-test.js
        
        Write-ColorText "✅ Full demo completed!" $Green
        Write-ColorText "📊 Check the reports directory for detailed results" $Blue
    } catch {
        Write-ColorText "❌ Full demo failed: $($_.Exception.Message)" $Red
    }
}

function Run-MonitoringDemo {
    Write-ColorText "📊 Setting up monitoring demo..." $Cyan
    
    Write-Host "Starting monitoring stack (InfluxDB + Grafana)..."
    
    try {
        # Start monitoring services
        docker-compose -f docker-compose.load-test.yml up -d influxdb grafana
        
        Write-ColorText "⏳ Waiting for services to start (30 seconds)..." $Yellow
        Start-Sleep -Seconds 30
        
        # Set up k6 to send metrics to InfluxDB
        $env:K6_OUT = "influxdb=http://localhost:8086/k6"
        $env:TEST_ENV = "monitoring-demo"
        
        Write-ColorText "🎯 Running load test with monitoring..." $Blue
        k6 run enhanced-load-test.js
        
        Write-Host ""
        Write-ColorText "📈 Monitoring URLs:" $Cyan
        Write-Host "  Grafana Dashboard: http://localhost:3002 (admin/admin123)"
        Write-Host "  InfluxDB: http://localhost:8086"
        Write-Host ""
        Write-ColorText "✅ Monitoring demo completed!" $Green
        Write-ColorText "   Keep services running to view real-time dashboards" $Blue
        
    } catch {
        Write-ColorText "❌ Monitoring demo failed: $($_.Exception.Message)" $Red
    }
}

function Show-Menu {
    Write-Host ""
    Write-ColorText "📋 Demo Options:" $Yellow
    Write-Host "1. Quick Demo (30s health check test)"
    Write-Host "2. Full Demo (Complete load test with reports)"
    Write-Host "3. Monitoring Demo (With Grafana dashboard)"
    Write-Host "4. Show test files"
    Write-Host "5. Exit"
    Write-Host ""
}

# Main execution
Show-Banner

if (-not (Check-Prerequisites)) {
    Write-ColorText "❌ Prerequisites not met. Please install missing components." $Red
    exit 1
}

# Handle direct parameters
if ($QuickDemo) {
    Run-QuickDemo
    exit 0
}

if ($FullDemo) {
    Run-FullDemo
    exit 0
}

if ($MonitoringDemo) {
    Run-MonitoringDemo
    exit 0
}

# Interactive mode
while ($true) {
    Show-Menu
    $choice = Read-Host "Select an option (1-5)"
    
    switch ($choice) {
        "1" { 
            Run-QuickDemo
            break
        }
        "2" { 
            Run-FullDemo
            break
        }
        "3" { 
            Run-MonitoringDemo
            break
        }
        "4" { 
            Show-TestFiles
        }
        "5" { 
            Write-ColorText "👋 Thanks for trying OpenBee Load Testing!" $Cyan
            exit 0
        }
        default { 
            Write-ColorText "❌ Invalid option. Please select 1-5." $Red
        }
    }
    
    Write-Host ""
    Read-Host "Press Enter to continue..."
}

Write-ColorText "🎉 Demo session completed!" $Green
