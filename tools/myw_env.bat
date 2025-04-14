@echo off
:: Initialise myWorld environment

:: Load site specific environment
if exist %~dpn0_site.bat call %~dpn0_site.bat

:: Handle differences between OS versions
if "%ProgramData%"=="" set ProgramData=c:\ProgramData

:: Set python environment
set MYW_PRODUCT_ROOT_DIR=%~dp0..\WebApps
set MYW_PYTHON_SITE_DIRS=%~dp0..\Externals\win32\Lib\site-packages;%MYW_PYTHON_SITE_DIRS%
set PATH=%~dp0..\Externals\win32\DLLs;%PATH%
if NOT "%MYW_PYTHON%"=="" set path="%MYW_PYTHON%";%PATH%

:: Set Java environment
set BIN_DIR=%~dp0\..\WebApps\myworldapp\core\server\base\tilestore\java
set CLASSPATH=%BIN_DIR%;%BIN_DIR%\pngj-2.1.1\pngj.jar;%BIN_DIR%\sqlite4java-392\sqlite4java.jar;%CLASSPATH%
if NOT "%MYW_JAVA%"=="" set path="%MYW_JAVA%";%PATH%

:: Make myWorld tools available
set path=%~dp0;%path%
