# Redis Setup Script for Windows
# This script helps set up Redis for the WhatsApp Campaign Automation Platform

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Redis Setup for WhatsApp Campaign Platform" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
Write-Host "Checking Docker installation..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Docker is installed: $dockerVersion" -ForegroundColor Green
    } else {
        throw "Docker not found"
    }
} catch {
    Write-Host "✗ Docker is not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Docker Desktop from:" -ForegroundColor Yellow
    Write-Host "https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "After installation:" -ForegroundColor Yellow
    Write-Host "1. Start Docker Desktop" -ForegroundColor White
    Write-Host "2. Wait for Docker to be ready (whale icon in system tray)" -ForegroundColor White
    Write-Host "3. Run this script again" -ForegroundColor White
    exit 1
}

# Check if Docker is running
Write-Host "Checking if Docker is running..." -ForegroundColor Yellow
try {
    docker ps > $null 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Docker is running" -ForegroundColor Green
    } else {
        throw "Docker not running"
    }
} catch {
    Write-Host "✗ Docker is not running" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start Docker Desktop and wait for it to be ready." -ForegroundColor Yellow
    Write-Host "Look for the whale icon in your system tray." -ForegroundColor White
    Write-Host ""
    Write-Host "Then run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Starting Redis container..." -ForegroundColor Yellow

# Check if Redis container already exists
$existingContainer = docker ps -a --filter "name=whatsapp-campaign-redis" --format "{{.Names}}" 2>&1

if ($existingContainer -eq "whatsapp-campaign-redis") {
    Write-Host "Redis container already exists. Checking status..." -ForegroundColor Yellow
    
    $containerStatus = docker ps --filter "name=whatsapp-campaign-redis" --format "{{.Status}}" 2>&1
    
    if ($containerStatus) {
        Write-Host "✓ Redis container is already running" -ForegroundColor Green
    } else {
        Write-Host "Starting existing Redis container..." -ForegroundColor Yellow
        docker start whatsapp-campaign-redis
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Redis container started successfully" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to start Redis container" -ForegroundColor Red
            exit 1
        }
    }
} else {
    # Start Redis using docker-compose
    Write-Host "Creating and starting Redis container..." -ForegroundColor Yellow
    docker-compose up -d redis
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Redis container created and started successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to start Redis container" -ForegroundColor Red
        Write-Host ""
        Write-Host "Trying alternative method..." -ForegroundColor Yellow
        
        # Try direct docker run command
        docker run -d `
            --name whatsapp-campaign-redis `
            -p 6379:6379 `
            -v redis_data:/data `
            redis:7-alpine redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Redis container started using docker run" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to start Redis" -ForegroundColor Red
            exit 1
        }
    }
}

# Wait for Redis to be ready
Write-Host ""
Write-Host "Waiting for Redis to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Test Redis connection
Write-Host "Testing Redis connection..." -ForegroundColor Yellow
$pingResult = docker exec whatsapp-campaign-redis redis-cli ping 2>&1

if ($pingResult -eq "PONG") {
    Write-Host "✓ Redis is responding correctly" -ForegroundColor Green
} else {
    Write-Host "✗ Redis is not responding" -ForegroundColor Red
    Write-Host "Result: $pingResult" -ForegroundColor Red
    exit 1
}

# Display Redis info
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Redis Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Redis Connection Details:" -ForegroundColor Yellow
Write-Host "  Host: localhost" -ForegroundColor White
Write-Host "  Port: 6379" -ForegroundColor White
Write-Host "  URL:  redis://localhost:6379" -ForegroundColor White
Write-Host ""
Write-Host "Useful Commands:" -ForegroundColor Yellow
Write-Host "  View logs:    docker logs whatsapp-campaign-redis" -ForegroundColor White
Write-Host "  Stop Redis:   docker stop whatsapp-campaign-redis" -ForegroundColor White
Write-Host "  Start Redis:  docker start whatsapp-campaign-redis" -ForegroundColor White
Write-Host "  Redis CLI:    docker exec -it whatsapp-campaign-redis redis-cli" -ForegroundColor White
Write-Host "  Monitor:      docker exec -it whatsapp-campaign-redis redis-cli monitor" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Start the backend server: cd node-backend && npm run dev" -ForegroundColor White
Write-Host "  2. Check logs for 'Redis client connected' message" -ForegroundColor White
Write-Host ""
Write-Host "For more information, see REDIS_SETUP.md" -ForegroundColor Cyan
Write-Host ""
