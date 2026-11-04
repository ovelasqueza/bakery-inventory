# Instala el agente del cajón en ESTE equipo (el de la caja, con impresora y cajón conectados).
# No necesita permisos de administrador. Se puede volver a ejecutar para cambiar la impresora.

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
$destino = Join-Path $env:LOCALAPPDATA 'POS-Cajon'
$agente = Join-Path $destino 'agente-cajon.ps1'
$inicio = Join-Path ([Environment]::GetFolderPath('Startup')) 'POS Cajon.lnk'

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

# 2. Detener una instalación anterior que esté corriendo
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*agente-cajon.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

# 3. Copiar el agente y su configuración. Si ya había otra app instalada en este equipo
#    (por ejemplo el POS y el inventario), se conservan sus direcciones.
New-Item -ItemType Directory -Force -Path $destino | Out-Null
$configRuta = Join-Path $destino 'config.json'
if (Test-Path -LiteralPath $configRuta) {
  try {
    $anterior = Get-Content -LiteralPath $configRuta -Raw -Encoding UTF8 | ConvertFrom-Json
    $Origenes = @(@($anterior.origenes) + $Origenes | Where-Object { $_ } | Select-Object -Unique)
  } catch { }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'agente-cajon.ps1') -Destination $agente -Force
Unblock-File -LiteralPath $agente
@{ puerto = $Puerto; pin = $Pin; impresora = $elegida; origenes = $Origenes } |
  ConvertTo-Json | Set-Content -LiteralPath $configRuta -Encoding UTF8
Write-Host ''
Write-Host 'Direcciones permitidas:'
$Origenes | ForEach-Object { Write-Host "  $_" }

# 4. Arranque automático al iniciar sesión en Windows
$argumentos = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agente`""
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($inicio)
$lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$lnk.Arguments = $argumentos
$lnk.WorkingDirectory = $destino
$lnk.WindowStyle = 7
$lnk.Description = 'Agente del cajón del POS'
$lnk.Save()

# 5. Arrancarlo ya
Start-Process -FilePath $lnk.TargetPath -ArgumentList $argumentos -WindowStyle Hidden
Start-Sleep -Seconds 3

# 6. Comprobar
$cabecera = @{ Origin = $Origenes[0] }
try {
  $estado = Invoke-RestMethod -Uri "http://127.0.0.1:$Puerto/estado" -Headers $cabecera -TimeoutSec 5
  Write-Host ''
  Write-Host "OK: el agente está corriendo (impresora: $($estado.impresora))" -ForegroundColor Green
} catch {
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
Write-Host 'Listo. El agente arranca solo cada vez que se inicia sesión en Windows.'
