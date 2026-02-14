@echo off
setlocal

echo Building event SDK...
cd /d %~dp0..\event-bus\event-sdk && call npm run build

echo Building telemetry SDK...
cd /d %~dp0..\observability\telemetry-sdk && call npm run build

echo Building gateway...
cd /d %~dp0..\gateway && call npm run build

echo Building auth-service...
cd /d %~dp0..\auth-service && call npm run build

echo Building project-service...
cd /d %~dp0..\project-service && call npm run build

echo Building job-service...
cd /d %~dp0..\job-service && call npm run build

echo Building file-service...
cd /d %~dp0..\file-service && call npm run build

echo Building mcp-server...
cd /d %~dp0..\mcp-server && call npm run build

echo Building feature-flags...
cd /d %~dp0..\feature-flags && call npm run build

echo Building incident-service...
cd /d %~dp0..\incident-service && call npm run build

echo Building temporal worker...
cd /d %~dp0..\temporal\worker && call npm run build

echo Building backstage...
cd /d %~dp0..\backstage && call npm run build

echo Building frontend...
cd /d %~dp0..\frontend && call npm run build

echo Build complete.
endlocal
