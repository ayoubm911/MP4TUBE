@echo off
:loop
echo [%date% %time%] Starting serveo tunnel...
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o TCPKeepAlive=yes -o ExitOnForwardFailure=yes -R 80:localhost:3000 serveo.net
echo [%date% %time%] Tunnel exited with code %errorlevel%. Restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop
