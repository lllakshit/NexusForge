@echo off
setlocal

echo Installing event SDK...
cd /d %~dp0..\event-bus\event-sdk && call npm install

echo Installing telemetry SDK...
cd /d %~dp0..\observability\telemetry-sdk && call npm install

echo Installing gateway...
cd /d %~dp0..\gateway && call npm install

echo Installing auth-service...
cd /d %~dp0..\auth-service && call npm install

echo Installing project-service...
cd /d %~dp0..\project-service && call npm install

echo Installing job-service...
cd /d %~dp0..\job-service && call npm install

echo Installing file-service...
cd /d %~dp0..\file-service && call npm install

echo Installing mcp-server...
cd /d %~dp0..\mcp-server && call npm install

echo Installing feature-flags...
cd /d %~dp0..\feature-flags && call npm install

echo Installing incident-service...
cd /d %~dp0..\incident-service && call npm install

echo Installing temporal worker...
cd /d %~dp0..\temporal\worker && call npm install

echo Installing backstage...
cd /d %~dp0..\backstage && call npm install

echo Installing frontend...
cd /d %~dp0..\frontend && call npm install

echo Installing worker-python requirements...
cd /d %~dp0..\worker-python && python -m pip install -r requirements.txt

echo Bootstrap complete.
endlocal
