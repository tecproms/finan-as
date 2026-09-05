[Net.ServicePointManager]::Expect100Continue = $false
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# Servidor HTTP Local para FinControl Pro
# Escuta em 0.0.0.0 (acessivel pelo PC e pelo Celular conectado no mesmo Wi-Fi)

$port = 8080
$rootPath = $PSScriptRoot

# Identifica o IP local na rede Wi-Fi / Ethernet
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -notlike '127.*' -and 
    $_.IPAddress -notlike '169.254*' -and 
    $_.InterfaceAlias -notmatch 'vEthernet|Virtual|Loopback' 
} | Select-Object -ExpandProperty IPAddress | Select-Object -First 1)

if (-not $localIp) {
    $localIp = "127.0.0.1"
}

$endpoint = [System.Net.IPAddress]::Any
try {
    $listener = New-Object System.Net.Sockets.TcpListener ($endpoint, $port)
    $listener.Start()
} catch {
    $port = 8085
    $listener = New-Object System.Net.Sockets.TcpListener ($endpoint, $port)
    $listener.Start()
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "         FINCONTROL PRO - SERVIDOR ATIVO                  " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host " [PC Computador]  " -NoNewline
Write-Host "http://localhost:$port" -ForegroundColor Cyan
Write-Host " [Celular Wi-Fi]  " -NoNewline
Write-Host "http://${localIp}:$port" -ForegroundColor Yellow
Write-Host ""
Write-Host " IMPORTANTE NO CELULAR:" -ForegroundColor Yellow
Write-Host " Digite o endereco completo com numeros: " -NoNewline
Write-Host "http://${localIp}:$port" -ForegroundColor Green
Write-Host " (Nao digite 'localhost' no celular, pois 'localhost' se refere ao proprio aparelho)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

while ($true) {
    try {
        $client = $listener.AcceptTcpClient()
        $clientIp = $client.Client.RemoteEndPoint.ToString()
        $stream = $client.GetStream()
        $stream.ReadTimeout = 30000
        $stream.WriteTimeout = 30000

        $buf = New-Object byte[] 8192
        $bytesRead = $stream.Read($buf, 0, $buf.Length)
        if ($bytesRead -gt 0) {
            $reqText = [System.Text.Encoding]::UTF8.GetString($buf, 0, $bytesRead)

            # Lê o restante do body se houver Content-Length
            if ($reqText -match "Content-Length:\s*(\d+)") {
                $contentLen = [int]$matches[1]
                $headEnd = $reqText.IndexOf("`r`n`r`n")
                if ($headEnd -ge 0) {
                    $bodyPart = $reqText.Substring($headEnd + 4)
                    $currentBodyLen = [System.Text.Encoding]::UTF8.GetByteCount($bodyPart)
                    while ($currentBodyLen -lt $contentLen) {
                        $toRead = [Math]::Min($buf.Length, $contentLen - $currentBodyLen)
                        $extra = $stream.Read($buf, 0, $toRead)
                        if ($extra -gt 0) {
                            $reqText += [System.Text.Encoding]::UTF8.GetString($buf, 0, $extra)
                            $currentBodyLen += $extra
                        } else { break }
                    }
                }
            }

            $firstLine = ($reqText -split "`r?`n")[0]
            $parts = $firstLine -split " "
            $httpMethod = if ($parts.Length -gt 0) { $parts[0].ToUpper() } else { "GET" }
            $urlPath = if ($parts.Length -gt 1) { $parts[1].Split("?")[0].TrimStart('/') } else { "" }

            # Suporte a CORS Preflight (OPTIONS)
            if ($httpMethod -eq "OPTIONS") {
                $respHeader = "HTTP/1.1 204 No Content`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nAccess-Control-Max-Age: 86400`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
                $hBytes = [System.Text.Encoding]::ASCII.GetBytes($respHeader)
                $stream.Write($hBytes, 0, $hBytes.Length)
                $stream.Flush()
                $client.Close()
                continue
            }

            if ([string]::IsNullOrWhiteSpace($urlPath) -or $urlPath -eq "/") {
                $urlPath = "index.html"
            }

            # --- ENDPOINT SERVER-SIDE PLUGGY CONNECT TOKEN ---
            if ($urlPath -eq "api/pluggy/connect-token") {
                $pId = "050ca994-3522-47e6-8571-d7582767173f"
                $pSec = "-kq-NqVfPS7Yt4IxRzHWrTixx2veW03aAvBLyj2OaME"
                try {
                    $authRes = Invoke-RestMethod -Uri "https://api.pluggy.ai/auth" -Method POST -Body (@{ clientId = $pId; clientSecret = $pSec } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 10
                    $tokenRes = Invoke-RestMethod -Uri "https://api.pluggy.ai/connect_token" -Method POST -Headers @{ "X-API-KEY" = $authRes.apiKey } -ContentType "application/json" -TimeoutSec 10
                    $json = @{ accessToken = $tokenRes.accessToken; success = $true } | ConvertTo-Json
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $respHeader = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Headers: *`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                    $hBytes = [System.Text.Encoding]::ASCII.GetBytes($respHeader)
                    $stream.Write($hBytes, 0, $hBytes.Length)
                    $stream.Write($bytes, 0, $bytes.Length)
                } catch {
                    $errJson = @{ error = $_.Exception.Message } | ConvertTo-Json
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                    $respHeader = "HTTP/1.1 500 Internal Server Error`r`nContent-Type: application/json`r`nAccess-Control-Allow-Origin: *`r`nContent-Length: $($errBytes.Length)`r`nConnection: close`r`n`r`n"
                    $hBytes = [System.Text.Encoding]::ASCII.GetBytes($respHeader)
                    $stream.Write($hBytes, 0, $hBytes.Length)
                    $stream.Write($errBytes, 0, $errBytes.Length)
                }
                $stream.Flush()
                $client.Close()
                continue
            }

            # --- ENDPOINT SERVER-SIDE EVOLUTION API WEBHOOK ---
            if ($urlPath -eq "api/evolution/webhook") {
                $json = @{ received = $true; status = "ok" } | ConvertTo-Json
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $respHeader = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Headers: *`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                $hBytes = [System.Text.Encoding]::ASCII.GetBytes($respHeader)
                $stream.Write($hBytes, 0, $hBytes.Length)
                $stream.Write($bytes, 0, $bytes.Length)
                $stream.Flush()
                $client.Close()
                continue
            }

            # --- ENDPOINT SERVER-SIDE EVOLUTION API PROXY ---
            if ($urlPath -eq "api/evolution/proxy") {
                try {
                    $bodyIdx = $reqText.IndexOf("`r`n`r`n")
                    $jsonBody = if ($bodyIdx -ge 0) { $reqText.Substring($bodyIdx + 4) } else { "{}" }
                    $reqObj = $jsonBody | ConvertFrom-Json
                    
                    $targetUrl = $reqObj.targetUrl
                    $targetMethod = if ($reqObj.method) { $reqObj.method.ToUpper() } else { "GET" }
                    $apikey = if ($reqObj.apiKey) { $reqObj.apiKey } else { "6A55A3BBE45B-4F2B-8250-AE33F929D789" }
                    $headers = @{ "apikey" = $apikey }
                    
                    $res = if ($targetMethod -eq "POST" -or $targetMethod -eq "PUT") {
                        $pBody = if ($reqObj.payload) { $reqObj.payload | ConvertTo-Json -Compress } else { "{}" }
                        Invoke-RestMethod -Uri $targetUrl -Method $targetMethod -Headers $headers -ContentType "application/json" -Body $pBody -TimeoutSec 30 -DisableKeepAlive
                    } else {
                        Invoke-RestMethod -Uri $targetUrl -Method $targetMethod -Headers $headers -TimeoutSec 30 -DisableKeepAlive
                    }
                    
                    $respJson = @{ success = $true; data = $res } | ConvertTo-Json -Depth 5
                } catch {
                    $errMsg = $_.Exception.Message
                    if ($_.Exception.Response) {
                        try {
                            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                            $errMsg = $reader.ReadToEnd()
                        } catch {}
                    }
                    $respJson = @{ success = $false; error = $errMsg } | ConvertTo-Json
                }
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
                $respHeader = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Headers: *`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                $hBytes = [System.Text.Encoding]::ASCII.GetBytes($respHeader)
                $stream.Write($hBytes, 0, $hBytes.Length)
                $stream.Write($bytes, 0, $bytes.Length)
                $stream.Flush()
                $client.Close()
                continue
            }

            # --- ENDPOINT LOCAL DATABASE ---
            if ($urlPath -eq "api/db") {
                if ($httpMethod -eq "GET") {
                    $dbFile = Join-Path $rootPath "database.json"
                    $json = "{}"
                    if (Test-Path $dbFile) {
                        $json = Get-Content $dbFile -Raw
                    }
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $respHeader = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                    $hBytes = [System.Text.Encoding]::ASCII.GetBytes($respHeader)
                    $stream.Write($hBytes, 0, $hBytes.Length)
                    $stream.Write($bytes, 0, $bytes.Length)
                } elseif ($httpMethod -eq "POST" -or $httpMethod -eq "PUT") {
                    $bodyIdx = $reqText.IndexOf("`r`n`r`n")
                    $jsonBody = if ($bodyIdx -ge 0) { $reqText.Substring($bodyIdx + 4) } else { "{}" }
                    $dbFile = Join-Path $rootPath "database.json"
                    [System.IO.File]::WriteAllText($dbFile, $jsonBody, [System.Text.Encoding]::UTF8)
                    
                    $json = '{"success":true}'
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $respHeader = "HTTP/1.1 200 OK`r`nContent-Type: application/json; charset=utf-8`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
                    $hBytes = [System.Text.Encoding]::ASCII.GetBytes($respHeader)
                    $stream.Write($hBytes, 0, $hBytes.Length)
                    $stream.Write($bytes, 0, $bytes.Length)
                }
                $stream.Flush()
                $client.Close()
                continue
            }

            $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootPath, $urlPath))
            if (-not $filePath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
                $header = "HTTP/1.1 403 Forbidden`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
                $hBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                $stream.Write($hBytes, 0, $hBytes.Length)
                $client.Close()
                continue
            }

            if ([System.IO.File]::Exists($filePath)) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                $contentBytes = [System.IO.File]::ReadAllBytes($filePath)

                $header = "HTTP/1.1 200 OK`r`n" +
                          "Content-Type: $contentType`r`n" +
                          "Content-Length: $($contentBytes.Length)`r`n" +
                          "Cache-Control: no-cache, no-store, must-revalidate`r`n" +
                          "Pragma: no-cache`r`n" +
                          "Expires: 0`r`n" +
                          "Access-Control-Allow-Origin: *`r`n" +
                          "Connection: close`r`n`r`n"

                $hBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                $stream.Write($hBytes, 0, $hBytes.Length)
                $stream.Write($contentBytes, 0, $contentBytes.Length)
                Write-Host "[$clientIp] 200 OK -> $urlPath" -ForegroundColor DarkGray
            } else {
                $notFound = "Arquivo nao encontrado: $urlPath"
                $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes($notFound)
                $header = "HTTP/1.1 404 Not Found`r`n" +
                          "Content-Type: text/plain; charset=utf-8`r`n" +
                          "Content-Length: $($notFoundBytes.Length)`r`n" +
                          "Connection: close`r`n`r`n"

                $hBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                $stream.Write($hBytes, 0, $hBytes.Length)
                $stream.Write($notFoundBytes, 0, $notFoundBytes.Length)
                Write-Host "[$clientIp] 404 Not Found -> $urlPath" -ForegroundColor Red
            }
            $stream.Flush()
        }
    } catch {
        # Conexão resetada ou encerrada
    } finally {
        if ($client) {
            try { $client.Close() } catch {}
        }
    }
}


