@echo off
:: Windows wrapper to myWorld tilestore admin command 

setlocal

:: Init environment
call %~dp0\myw_env

:: Run command
call py %~dpn0.py %*
