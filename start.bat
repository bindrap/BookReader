@echo off
REM BookReader Docker Startup Script for Windows

echo.
echo Starting BookReader...
echo.

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)

REM Check if .env exists, if not create from example
if not exist .env (
    echo No .env file found. Creating from .env.example...
    if exist .env.example (
        copy .env.example .env
        echo Created .env file. You may want to edit it and set a secure JWT_SECRET.
        echo.
    )
)

REM Start the application
echo Starting Docker containers...
docker compose up -d

REM Wait a moment for the container to start
timeout /t 3 /nobreak >nul

REM Check if container is running
docker compose ps | find "Up" >nul
if %errorlevel% equ 0 (
    echo.
    echo BookReader is now running!
    echo.
    echo Open your browser and go to:
    echo    http://localhost:8669
    echo.
    echo First time? Create an account to get started!
    echo.
    echo To view logs:    docker compose logs -f
    echo To stop:         docker compose down
    echo.
) else (
    echo.
    echo Failed to start BookReader. Check the logs:
    echo    docker compose logs
    pause
    exit /b 1
)

pause
