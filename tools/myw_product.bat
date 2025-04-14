@echo off
:: DOS wrapper to myWorld product maintenance command 

setlocal

:: Init environment
call %~dp0\myw_env

:: Run command
call py %~dpn0.py %*