# Instala el agente del cajón en ESTE equipo (el de la caja, con impresora y cajón conectados).
# Configura arranque automático persistente (Registro de Windows + Carpeta Inicio + Tarea Programada
# + Vigilante oculto VBS que lo revive si algún proceso lo cierra) para que funcione siempre al
# encender o reiniciar el computador sin tener que volver a instalarlo.

param(
  [int]$Puerto = 17777,
  # Pin del conector del cajón: 2 (el más común) o 5
  [ValidateSet(2, 5)][int]$Pin = 2,
  # Direcciones desde donde se abre la app de caja
  [string[]]$Origenes = @(
    'https://inventario-lizpan.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  )
)

$ErrorActionPreference = 'Stop'

# Usar C:\Users\Public\POS-Cajon permite que funcione aunque se instale como Administrador
# y luego inicie sesión otro usuario estándar de Windows en el PC del punto de venta.
$destino = Join-Path $env:PUBLIC 'POS-Cajon'
try {
  New-Item -ItemType Directory -Force -Path $destino | Out-Null
} catch {
  $destino = Join-Path $env:LOCALAPPDATA 'POS-Cajon'
  New-Item -ItemType Directory -Force -Path $destino | Out-Null
}

$agente = Join-Path $destino 'agente-cajon.ps1'
$lanzadorVbs = Join-Path $destino 'iniciar-oculto.vbs'
$inicioUsuario = Join-Path ([Environment]::GetFolderPath('Startup')) 'POS Cajon.lnk'
$inicioComun = Join-Path ([Environment]::GetFolderPath('CommonStartup')) 'POS Cajon.lnk'

Write-Host ''
Write-Host '=== Instalar agente del cajón (POS) ===' -ForegroundColor Green
Write-Host ''

# 1. Impresora
$impresoras = @(Get-Printer | Where-Object { $_.Name -notmatch 'PDF|OneNote|XPS|Fax' } | Select-Object -ExpandProperty Name)
if ($impresoras.Count -eq 0) { throw 'No hay impresoras instaladas en este equipo.' }
$predeterminada = (Get-CimInstance Win32_Printer -Filter 'Default=TRUE' | Select-Object -First 1).Name
Write-Host 'Impresoras de este equipo:'
for ($i = 0; $i -lt $impresoras.Count; $i++) {
  $marca = if ($impresoras[$i] -eq $predeterminada) { '  (predeterminada)' } else { '' }
  Write-Host ("  {0}. {1}{2}" -f ($i + 1), $impresoras[$i], $marca)
}
$elegida = $null
while (-not $elegida) {
  $r = Read-Host 'Número de la impresora que tiene el cajón conectado'
  $n = 0
  if ([int]::TryParse($r, [ref]$n) -and $n -ge 1 -and $n -le $impresoras.Count) { $elegida = $impresoras[$n - 1] }
}

# 2. Detener instalaciones anteriores (wscript vigilante y powershell del agente)
Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*iniciar-oculto.vbs*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*agente-cajon.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 600

# 3. Copiar el agente y su configuración (conservando orígenes previos si existían)
$configRuta = Join-Path $destino 'config.json'
$configAnteriorLocal = Join-Path (Join-Path $env:LOCALAPPDATA 'POS-Cajon') 'config.json'
foreach ($rutaPrev in @($configRuta, $configAnteriorLocal)) {
  if (Test-Path -LiteralPath $rutaPrev) {
    try {
      $anterior = Get-Content -LiteralPath $rutaPrev -Raw -Encoding UTF8 | ConvertFrom-Json
      $Origenes = @(@($anterior.origenes) + $Origenes | Where-Object { $_ } | Select-Object -Unique)
    } catch { }
  }
}

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'agente-cajon.ps1') -Destination $agente -Force
Unblock-File -LiteralPath $agente -ErrorAction SilentlyContinue
@{ puerto = $Puerto; pin = $Pin; impresora = $elegida; origenes = $Origenes } |
  ConvertTo-Json | Set-Content -LiteralPath $configRuta -Encoding UTF8

# 4. Crear lanzador oculto con vigilante (iniciar-oculto.vbs):
#    - Corre en segundo plano sin mostrar ventana negra de consola.
#    - Si el agente se cierra por cualquier motivo (código != 99), lo vuelve a levantar a los 5 segundos.
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$vbsContenido = @"
Option Explicit
Dim sh, cmd, codigo
Set sh = CreateObject("WScript.Shell")
cmd = """$psExe"" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ""$agente"""
Do
  codigo = sh.Run(cmd, 0, True)
  If codigo = 99 Then Exit Do
  WScript.Sleep 5000
Loop
"@
Set-Content -LiteralPath $lanzadorVbs -Value $vbsContenido -Encoding ASCII

$wscriptExe = Join-Path $env:SystemRoot 'System32\wscript.exe'
$argWscript = "//B //NoLogo `"$lanzadorVbs`""
$comandoRun = "`"$wscriptExe`" $argWscript"

# 5. Registrar arranque automático en múltiples lugares de Windows para garantizar que siempre inicie al prender el PC:

# 5a. Registro de Windows (HKCU\...\Run)
try {
  $regRun = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  if (-not (Test-Path $regRun)) { New-Item -Path $regRun -Force | Out-Null }
  Set-ItemProperty -Path $regRun -Name 'POS-Cajon' -Value $comandoRun -Force
} catch { }

# 5b. Registro de Windows para todos los usuarios (HKLM\...\Run, si se ejecutó como Administrador)
try {
  $regRunMachine = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'
  Set-ItemProperty -Path $regRunMachine -Name 'POS-Cajon' -Value $comandoRun -Force -ErrorAction Stop
} catch { }

# 5c. Acceso directo en la carpeta Inicio del usuario (y común si tiene permisos)
$sh = New-Object -ComObject WScript.Shell
foreach ($rutaLnk in @($inicioUsuario, $inicioComun)) {
  try {
    if (-not $rutaLnk) { continue }
    $lnk = $sh.CreateShortcut($rutaLnk)
    $lnk.TargetPath = $wscriptExe
    $lnk.Arguments = $argWscript
    $lnk.WorkingDirectory = $destino
    $lnk.WindowStyle = 7
    $lnk.Description = 'Agente del cajón del POS'
    $lnk.Save()
  } catch { }
}

# 5d. Tarea programada al iniciar sesión (schtasks)
try {
  & schtasks.exe /Create /TN "POS-Cajon" /TR $comandoRun /SC ONLOGON /RL LIMITED /F 2>&1 | Out-Null
} catch { }

Write-Host ''
Write-Host 'Direcciones permitidas:'
$Origenes | ForEach-Object { Write-Host "  $_" }

# 6. Arrancarlo ya mediante el vigilante oculto
Start-Process -FilePath $wscriptExe -ArgumentList $argWscript -WindowStyle Hidden
Start-Sleep -Seconds 3

# 7. Comprobar
$cabecera = @{ Origin = $Origenes[0] }
$respondio = $false
for ($i = 1; $i -le 5; $i++) {
  try {
    $estado = Invoke-RestMethod -Uri "http://127.0.0.1:$Puerto/estado" -Headers $cabecera -TimeoutSec 3
    Write-Host ''
    Write-Host "OK: el agente está corriendo (impresora: $($estado.impresora))" -ForegroundColor Green
    $respondio = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $respondio) {
  Write-Host ''
  Write-Host "El agente no respondió. Revisa $destino\agente.log" -ForegroundColor Red
  exit 1
}

$p = Read-Host '¿Probar abrir el cajón ahora? (S/N)'
if ($p -match '^[sS]') {
  try {
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Puerto/abrir" -Headers $cabecera -TimeoutSec 5 | Out-Null
    Write-Host 'Comando enviado. Si el cajón no abrió, ejecuta de nuevo con:  instalar.cmd -Pin 5' -ForegroundColor Green
  } catch {
    Write-Host "No se pudo abrir: $($_.ErrorDetails.Message)" -ForegroundColor Red
  }
}

Write-Host ''
Write-Host 'Listo. El agente quedó configurado con inicio automático permanente al encender o reiniciar Windows.' -ForegroundColor Green
