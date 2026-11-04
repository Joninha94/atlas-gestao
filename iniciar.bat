@echo off
REM Sobe a Produtiva Gestao no Windows (modo sandbox). Requer Docker Desktop aberto.
cd /d "%~dp0"
docker info >nul 2>&1 || (echo Abra o Docker Desktop e rode de novo. & pause & exit /b 1)
if not exist .env.local-docker (
  powershell -NoProfile -Command "$r={-join((1..64)|%%{'0123456789abcdef'[(Get-Random -Max 16)]})}; \"JWT_SECRET=$(& $r)`nVAULT_MASTER_KEY=$(& $r)`nSEED_ADMIN_PASSWORD=Produtiva@2026\" | Set-Content -Encoding ascii .env.local-docker"
)
docker compose -f docker-compose.local.yml up -d --build
echo.
echo Painel: http://localhost:3000  (CNPJ 11444777000161 / admin@produtiva.local / Produtiva@2026)
echo App do cliente: http://localhost:8081
start http://localhost:3000
pause
