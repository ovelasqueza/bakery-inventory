# Agente del cajón monedero (POS).
# Escucha SOLO en este equipo (127.0.0.1) y, cuando la app de caja lo pide, manda a la impresora
# el comando ESC/POS de apertura del cajón (ESC p) por la cola de Windows en modo RAW: no gasta papel.
# También imprime el recibo de cierre de turno que arma la app (bytes ESC/POS enviados en base64).
#
# Seguridad:
#   - Solo acepta conexiones desde el mismo equipo (127.0.0.1).
#   - Solo responde a páginas de los orígenes de config.json (la app de caja).
#   - Rechaza encabezados Host que no sean 127.0.0.1/localhost (evita DNS rebinding).
#   - Lo único que puede hacer es abrir el cajón, imprimir lo que mande la app de un origen
#     permitido (máx. 65.536 bytes de cuerpo) o decir si está vivo.
#   - En agente.log se anotan la impresora, el número de bytes y el origen, nunca el contenido.
#
# Rutas:  GET /estado    → { ok, impresora }
#         POST /abrir    → { ok } o { ok:false, error }
#         POST /imprimir → cuerpo base64 (text/plain) con los bytes ESC/POS → { ok } o { ok:false, error }
#                          411 sin Content-Length · 413 más de 65.536 · 400 base64 inválido/vacío/incompleto
#                          500 impresora ausente o con error

param([string]$Config = (Join-Path $PSScriptRoot 'config.json'))

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
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

  /// Devuelve null si todo salió bien, o el error.
  public static string Enviar(string impresora, byte[] datos) {
    return Enviar(impresora, datos, "Abrir cajon");
  }

  /// Igual, con el nombre del trabajo que se ve en la cola de impresión.
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

$cfg = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json
$puerto = [int]$cfg.puerto
$origenes = @($cfg.origenes)
$hostsValidos = @("127.0.0.1:$puerto", "localhost:$puerto")
$registro = Join-Path $PSScriptRoot 'agente.log'

function Anotar([string]$texto) {
  try {
    if ((Test-Path -LiteralPath $registro) -and (Get-Item -LiteralPath $registro).Length -gt 512KB) {
      Remove-Item -LiteralPath $registro -Force
    }
    Add-Content -LiteralPath $registro -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $texto) -Encoding UTF8
  } catch { }
}

function ImpresoraActual {
  if ($cfg.impresora) { return [string]$cfg.impresora }
  $p = Get-CimInstance Win32_Printer -Filter 'Default=TRUE' | Select-Object -First 1
  if ($p) { return [string]$p.Name }
  return $null
}

# ESC p m t1 t2: m = 0 (pin 2, el más común) o 1 (pin 5); pulso de 25 x 2 ms y espera de 250 x 2 ms
function ComandoCajon {
  $m = 0
  if ([int]$cfg.pin -eq 5) { $m = 1 }
  return [byte[]](0x1B, 0x70, $m, 0x19, 0xFA)
}

function Responder($flujo, [string]$estado, [string]$cuerpo, [string]$origen) {
  $cab = "HTTP/1.1 $estado`r`nContent-Type: application/json; charset=utf-8`r`nCache-Control: no-store`r`nConnection: close`r`n"
  if ($origen) {
    $cab += "Access-Control-Allow-Origin: $origen`r`nVary: Origin`r`nAccess-Control-Allow-Methods: GET, POST`r`n"
    $cab += "Access-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`n"
  }
  $bytesCuerpo = [Text.Encoding]::UTF8.GetBytes($cuerpo)
  $cab += "Content-Length: $($bytesCuerpo.Length)`r`n`r`n"
  $bytesCab = [Text.Encoding]::ASCII.GetBytes($cab)
  $flujo.Write($bytesCab, 0, $bytesCab.Length)
  if ($bytesCuerpo.Length -gt 0) { $flujo.Write($bytesCuerpo, 0, $bytesCuerpo.Length) }
  $flujo.Flush()
}

$maxCuerpo = 65536

# Devuelve los $largo bytes del cuerpo: primero los que ya llegaron junto con los encabezados
# (después de $fin + 4 en $buf) y luego lee el resto. Todo el cuerpo debe llegar en 2 segundos.
# Devuelve $null si los encabezados no terminaron, si el cliente cierra antes o si se agota el tiempo.
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
  # La coma evita que PowerShell desenrolle el arreglo de bytes
  return ,$cuerpo
}

function Atender($cliente) {
  $cliente.ReceiveTimeout = 2000
  $cliente.SendTimeout = 2000
  $flujo = $cliente.GetStream()

  # Se leen la línea de petición y los encabezados (máx. 8 KB). Pueden llegar también los primeros
  # bytes del cuerpo; LeerCuerpo los aprovecha.
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
  # Los encabezados se parsean solo hasta la línea vacía, para no confundir el cuerpo con encabezados
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
  $permitido = $origen -and ($origenes -contains $origen)
  $origenRespuesta = $null
  if ($permitido) { $origenRespuesta = $origen }

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
    # Más de 7 dígitos ya supera el máximo; así no se desborda el [int]
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

$escucha = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $puerto)
try {
  $escucha.Start()
} catch {
  Anotar "No se pudo usar el puerto $puerto (¿el agente ya está corriendo?): $($_.Exception.Message)"
  exit 1
}
Anotar "Agente iniciado en 127.0.0.1:$puerto · impresora: $(ImpresoraActual) · orígenes: $($origenes -join ', ')"

while ($true) {
  $cliente = $escucha.AcceptTcpClient()
  try { Atender $cliente } catch { Anotar "Error atendiendo: $($_.Exception.Message)" } finally { $cliente.Close() }
}
