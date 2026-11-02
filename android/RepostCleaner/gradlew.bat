@echo off
setlocal
set "GRADLE_VERSION=8.9"
set "BOOTSTRAP_ROOT=%USERPROFILE%\.gradle\repost-cleaner-bootstrap"
set "GRADLE_HOME=%BOOTSTRAP_ROOT%\gradle-%GRADLE_VERSION%"
if not exist "%GRADLE_HOME%\bin\gradle.bat" (
  if not exist "%BOOTSTRAP_ROOT%" mkdir "%BOOTSTRAP_ROOT%"
  echo Downloading official Gradle %GRADLE_VERSION% distribution...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $zip=Join-Path $env:TEMP 'gradle-8.9-bin.zip'; $sum=Join-Path $env:TEMP 'gradle-8.9-bin.zip.sha256'; Invoke-WebRequest -UseBasicParsing 'https://services.gradle.org/distributions/gradle-8.9-bin.zip' -OutFile $zip; Invoke-WebRequest -UseBasicParsing 'https://services.gradle.org/distributions/gradle-8.9-bin.zip.sha256' -OutFile $sum; $expected=(Get-Content $sum -Raw).Trim().Split(' ')[0].ToLower(); $actual=(Get-FileHash $zip -Algorithm SHA256).Hash.ToLower(); if ($expected -ne $actual) { throw 'Gradle checksum mismatch' }; Expand-Archive -Force $zip '%BOOTSTRAP_ROOT%'; Remove-Item $zip,$sum -Force"
  if errorlevel 1 exit /b 1
)
call "%GRADLE_HOME%\bin\gradle.bat" %*
exit /b %ERRORLEVEL%
