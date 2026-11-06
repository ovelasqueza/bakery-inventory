# Quita el agente del cajón de este equipo (detiene, quita todos los arranques automáticos y borra sus archivos).
$ErrorActionPreference = 'Continue'
$destinos = @(
  (Join-Path $env:PUBLIC 'POS-Cajon'),
  (Join-Path $env:LOCALAPPDATA 'POS-Cajon')
)
$inicios = @(
  (Join-Path ([Environment]::GetFolderPath('Startup')) 'POS Cajon.lnk'),
  (Join-Path ([Environment]::GetFolderPath('CommonStartup')) 'POS Cajon.lnk')
)

# 1. Detener el vigilante oculto (wscript) y el proceso del agente (powershell)
Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*iniciar-oculto.vbs*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*agente-cajon.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

# 2. Quitar entradas del Registro, Tarea Programada y carpeta Inicio
try { Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'POS-Cajon' -Force -ErrorAction SilentlyContinue } catch { }
try { Remove-ItemProperty -Path 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'POS-Cajon' -Force -ErrorAction SilentlyContinue } catch { }
try { & schtasks.exe /Delete /TN "POS-Cajon" /F 2>&1 | Out-Null } catch { }

foreach ($lnk in $inicios) {
  if ($lnk -and (Test-Path -LiteralPath $lnk)) { Remove-Item -LiteralPath $lnk -Force -ErrorAction SilentlyContinue }
}

foreach ($dir in $destinos) {
  if ($dir -and (Test-Path -LiteralPath $dir)) { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host 'Agente del cajón desinstalado de este equipo.' -ForegroundColor Green
