# Agente del cajón monedero (POS).
# Escucha SOLO en este equipo (127.0.0.1) y, cuando la app de caja lo pide, manda a la impresora
# el comando ESC/POS de apertura del cajón (ESC p) por la cola de Windows en modo RAW: no gasta papel.
# También imprime el recibo de cierre de turno que arma la app (bytes ESC/POS enviados en base64).
#
# Diseñado para sobrevivir reinicios, apagados nocturnos y errores transitorios de red/impresora:
#   - Evita instancias duplicadas mediante un Mutex del sistema (código de salida 99 si ya corre).
#   - Reintenta la compilación inicial y la apertura del puerto si Windows aún está arrancando.
#   - Captura cualquier excepción en el bucle principal de conexiones para no cerrarse nunca.

param([string]$Config = (Join-Path $PSScriptRoot 'config.json'))

$ErrorActionPreference = 'Continue'
$registro = Join-Path $PSScriptRoot 'agente.log'

function Anotar([string]$texto) {
  try {
    if ((Test-Path -LiteralPath $registro) -and (Get-Item -LiteralPath $registro).Length -gt 512KB) {
      Remove-Item -LiteralPath $registro -Force -ErrorAction SilentlyContinue
    }
    Add-Content -LiteralPath $registro -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $texto) -Encoding UTF8 -ErrorAction SilentlyContinue
  } catch { }
}

# 1. Evitar que corran dos copias al mismo tiempo (p. ej. por Registro + Carpeta Inicio + Tarea Programada).
#    Código de salida 99 le indica al vigilante (iniciar-oculto.vbs) que ya hay una instancia activa.
$creadoNuevo = $false
try {
  $script:mutex = New-Object System.Threading.Mutex($true, 'Local\POSCajonAgenteMutex', [ref]$creadoNuevo)
  if (-not $creadoNuevo) {
    exit 99
  }
} catch {
  # Si el mutex falla por permisos, seguimos y validaremos por el puerto TCP.
}

# 2. Cargar ImpresoraRaw con reintentos (al encender el PC, el temporal o el antivirus pueden tardar unos segundos).
$tipoCargado = $false
for ($intento = 1; $intento -le 10; $intento++) {
  try {
    if (-not ('ImpresoraRaw' -as [type])) {
      Add-Type -ErrorAction Stop -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ImpresoraRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string nombre, out IntPtr h, IntPtr def);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr h, int nivel, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] datos, int n, out int escritos);

  public static string Enviar(string impresora, byte[] datos) {
    return Enviar(impresora, datos, "Abrir cajon");
  }

  public static string Enviar(string impresora, byte[] datos, string documento) {
    IntPtr h;
    if (!OpenPrinter(impresora, out h, IntPtr.Zero)) return "No se pudo abrir la impresora (" + Marshal.GetLastWin32Error() + ")";
    try {
      DOCINFO di = new DOCINFO { pDocName = documento, pDataType = "RAW" };
      if (StartDocPrinter(h, 1, di) == 0) return "No se pudo iniciar el trabajo (" + Marshal.GetLastWin32Error() + ")";
      try {
        StartPagePrinter(h);
        int escritos;
        bool ok = WritePrinter(h, datos, datos.Length, out escritos);
        EndPagePrinter(h);
        if (!ok || escritos != datos.Length) return "No se pudo enviar el comando (" + Marshal.GetLastWin32Error() + ")";
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return null;
  }
}
"@
    }
    $tipoCargado = $true
    break
  } catch {
    Anotar "Intento $intento cargando ImpresoraRaw falló: $($_.Exception.Message)"
    Start-Sleep -Seconds 2
  }
}

if (-not $tipoCargado) {
  Anotar "No se pudo compilar ImpresoraRaw tras varios intentos."
  exit 1
}

function LeerConfig {
  try {
    return Get-Content -LiteralPath $Config -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
  } catch {
    return [pscustomobject]@{
      puerto = 17777
      pin = 2
      impresora = $null
      origenes = @(
        'https://inventario-lizpan.vercel.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      )
    }
  }
}

$cfg = LeerConfig
$puerto = if ($cfg.puerto) { [int]$cfg.puerto } else { 17777 }
$origenes = @($cfg.origenes | Where-Object { $_ })
$hostsValidos = @("127.0.0.1:$puerto", "localhost:$puerto")

function EsOrigenPermitido([string]$origen) {
  if (-not $origen) { return $true }
  if ($origenes -contains $origen) { return $true }
  if ($origen -match '^https?://(localhost|127\.0\.0\.1)(:\d+)?$') { return $true }
  if ($origen -match '^https://[a-zA-Z0-9-]+\.vercel\.app$') { return $true }
  return $false
}

$script:impresoraCache = if ($cfg.impresora) { [string]$cfg.impresora } else { $null }
$script:ultimaLecturaImp = [DateTime]::MinValue

function ImpresoraActual([bool]$forzar = $false) {
  if (-not $forzar -and $script:impresoraCache -and ((Get-Date) - $script:ultimaLecturaImp).TotalSeconds -lt 120) {
    return $script:impresoraCache
  }
  $cfgActual = LeerConfig
  if ($cfgActual.impresora) {
    $script:impresoraCache = [string]$cfgActual.impresora
    $script:ultimaLecturaImp = Get-Date
    return $script:impresoraCache
  }
  try {
    $p = Get-CimInstance Win32_Printer -Filter 'Default=TRUE' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($p) {
      $script:impresoraCache = [string]$p.Name
      $script:ultimaLecturaImp = Get-Date
      return $script:impresoraCache
    }
  } catch { }
  return $script:impresoraCache
}

$script:pinCajon = if ($cfg.pin -and [int]$cfg.pin -eq 5) { 1 } else { 0 }
$script:bytesCajon = [byte[]](0x1B, 0x70, $script:pinCajon, 0x19, 0xFA)

# ESC p m t1 t2: m = 0 (pin 2, el más común) o 1 (pin 5); pulso de 25 x 2 ms y espera de 250 x 2 ms
function ComandoCajon {
  return $script:bytesCajon
}

function Responder($flujo, [string]$estado, [string]$cuerpo, [string]$origen) {
  $cab = "HTTP/1.1 $estado`r`nContent-Type: application/json; charset=utf-8`r`nCache-Control: no-store`r`nConnection: close`r`n"
  $origenCors = if ($origen) { $origen } else { '*' }
  $cab += "Access-Control-Allow-Origin: $origenCors`r`nVary: Origin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`n"
  $cab += "Access-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`n"
  $bytesCuerpo = [Text.Encoding]::UTF8.GetBytes($cuerpo)
  $cab += "Content-Length: $($bytesCuerpo.Length)`r`n`r`n"
  $bytesCab = [Text.Encoding]::ASCII.GetBytes($cab)
  $flujo.Write($bytesCab, 0, $bytesCab.Length)
  if ($bytesCuerpo.Length -gt 0) { $flujo.Write($bytesCuerpo, 0, $bytesCuerpo.Length) }
  $flujo.Flush()
}

$maxCuerpo = 65536

function LeerCuerpo($flujo, [byte[]]$buf, [int]$total, [int]$fin, [int]$largo) {
  if ($fin -lt 0) { return $null }
  $cuerpo = New-Object byte[] $largo
  $inicio = $fin + 4
  $leidos = [Math]::Min([Math]::Max($total - $inicio, 0), $largo)
  if ($leidos -gt 0) { [Array]::Copy($buf, $inicio, $cuerpo, 0, $leidos) }
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  try {
    while ($leidos -lt $largo) {
      $resta = 2000 - [int]$reloj.ElapsedMilliseconds
      if ($resta -le 0) { return $null }
      $flujo.ReadTimeout = $resta
      $n = $flujo.Read($cuerpo, $leidos, $largo - $leidos)
      if ($n -le 0) { return $null }
      $leidos += $n
    }
  } catch { return $null }
  return ,$cuerpo
}

function Atender($cliente) {
  $cliente.ReceiveTimeout = 2000
  $cliente.SendTimeout = 2000
  $flujo = $cliente.GetStream()

  $buf = New-Object byte[] 8192
  $total = 0
  $texto = ''
  $fin = -1
  while ($total -lt $buf.Length) {
    $n = $flujo.Read($buf, $total, $buf.Length - $total)
    if ($n -le 0) { break }
    $total += $n
    $texto = [Text.Encoding]::ASCII.GetString($buf, 0, $total)
    $fin = $texto.IndexOf("`r`n`r`n")
    if ($fin -ge 0) { break }
  }
  $encabezados = if ($fin -ge 0) { $texto.Substring(0, $fin) } else { $texto }
  $lineas = $encabezados -split "`r`n"
  $partes = $lineas[0] -split ' '
  if ($partes.Length -lt 2) { return }
  $metodo = $partes[0].ToUpperInvariant()
  $ruta = ($partes[1] -split '\?')[0]

  $cabeceras = @{}
  foreach ($l in ($lineas | Select-Object -Skip 1)) {
    $i = $l.IndexOf(':')
    if ($i -gt 0) { $cabeceras[$l.Substring(0, $i).Trim().ToLowerInvariant()] = $l.Substring($i + 1).Trim() }
  }

  $origen = [string]$cabeceras['origin']
  $permitido = EsOrigenPermitido $origen
  $origenRespuesta = if ($origen) { $origen } else { '*' }

  if (-not ($hostsValidos -contains [string]$cabeceras['host']) -or -not $permitido) {
    Anotar "Rechazado: $metodo $ruta origen='$origen' host='$($cabeceras['host'])'"
    Responder $flujo '403 Forbidden' '{"ok":false,"error":"No permitido"}' $null
    return
  }

  if ($metodo -eq 'OPTIONS') { Responder $flujo '204 No Content' '' $origenRespuesta; return }

  if ($metodo -eq 'GET' -and $ruta -eq '/estado') {
    $imp = ImpresoraActual
    $json = @{ ok = [bool]$imp; impresora = $imp } | ConvertTo-Json -Compress
    Responder $flujo '200 OK' $json $origenRespuesta
    return
  }

  if ($metodo -eq 'POST' -and $ruta -eq '/abrir') {
    $imp = ImpresoraActual
    $fallo = if ($imp) { [ImpresoraRaw]::Enviar($imp, (ComandoCajon)) } else { 'No hay impresora predeterminada' }
    if ($fallo) {
      Anotar "Error al abrir en '$imp': $fallo"
      Responder $flujo '500 Internal Server Error' (@{ ok = $false; error = $fallo } | ConvertTo-Json -Compress) $origenRespuesta
    } else {
      Anotar "Cajón abierto ($imp) desde $origen"
      Responder $flujo '200 OK' '{"ok":true}' $origenRespuesta
    }
    return
  }

  if ($metodo -eq 'POST' -and $ruta -eq '/imprimir') {
    $cl = [string]$cabeceras['content-length']
    if ($cl -notmatch '^\d+$') {
      Anotar "Recibo rechazado (sin Content-Length) desde $origen"
      Responder $flujo '411 Length Required' '{"ok":false,"error":"Falta Content-Length"}' $origenRespuesta
      return
    }
    if ($cl.TrimStart('0').Length -gt 7 -or [int]$cl -gt $maxCuerpo) {
      Anotar "Recibo rechazado (muy grande: $cl bytes) desde $origen"
      Responder $flujo '413 Payload Too Large' '{"ok":false,"error":"Recibo muy grande"}' $origenRespuesta
      return
    }
    $largo = [int]$cl
    $cuerpo = LeerCuerpo $flujo $buf $total $fin $largo
    $datos = $null
    if ($null -ne $cuerpo -and $cuerpo.Length -gt 0) {
      try { $datos = [Convert]::FromBase64String([Text.Encoding]::ASCII.GetString($cuerpo).Trim()) } catch { $datos = $null }
    }
    if ($null -eq $datos -or $datos.Length -eq 0) {
      Anotar "Recibo inválido ($largo bytes declarados) desde $origen"
      Responder $flujo '400 Bad Request' '{"ok":false,"error":"Recibo inválido"}' $origenRespuesta
      return
    }
    $imp = ImpresoraActual
    $fallo = if ($imp) { [ImpresoraRaw]::Enviar($imp, $datos, 'Recibo cierre') } else { 'No hay impresora predeterminada' }
    if ($fallo) {
      Anotar "Error al imprimir recibo en '$imp': $fallo"
      Responder $flujo '500 Internal Server Error' (@{ ok = $false; error = $fallo } | ConvertTo-Json -Compress) $origenRespuesta
    } else {
      Anotar "Recibo impreso ($imp, $($datos.Length) bytes) desde $origen"
      Responder $flujo '200 OK' '{"ok":true}' $origenRespuesta
    }
    return
  }

  Responder $flujo '404 Not Found' '{"ok":false,"error":"Ruta no existe"}' $origenRespuesta
}

# 3. Bucle principal inquebrantable: si al encender el PC la red loopback aún no está lista
#    o ocurre un error de socket, reintenta sin cerrar el proceso.
$escucha = $null
for ($intento = 1; $intento -le 15; $intento++) {
  try {
    $escucha = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $puerto)
    $escucha.Start()
    break
  } catch {
    # Si el puerto ya está ocupado por otra instancia del agente que responde /estado, salimos con 99
    try {
      $r = Invoke-RestMethod -Uri "http://127.0.0.1:$puerto/estado" -TimeoutSec 2 -ErrorAction Stop
      if ($null -ne $r) {
        exit 99
      }
    } catch { }
    Anotar "Intento $intento abriendo puerto ${puerto}: $($_.Exception.Message)"
    Start-Sleep -Seconds 2
  }
}

if (-not $escucha) {
  Anotar "No se pudo abrir el puerto $puerto tras varios intentos."
  exit 1
}

Anotar "Agente iniciado en 127.0.0.1:$puerto · impresora: $(ImpresoraActual) · orígenes: $($origenes -join ', ')"

while ($true) {
  $cliente = $null
  try {
    $cliente = $escucha.AcceptTcpClient()
    Atender $cliente
  } catch {
    Anotar "Error en bucle de conexión: $($_.Exception.Message)"
    Start-Sleep -Milliseconds 250
  } finally {
    if ($null -ne $cliente) {
      try { $cliente.Close() } catch { }
    }
  }
}
