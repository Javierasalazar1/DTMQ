$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    Write-Host "El puerto $port esta ocupado. Intentando 8081..."
    $port = 8081
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
}

Write-Host "=================================================="
Write-Host "  Servidor del Dashboard TMQ iniciado"
Write-Host "  Corriendo en: http://localhost:$port/"
Write-Host "  Presiona Ctrl+C para detener el servidor"
Write-Host "=================================================="

# Abrir el navegador automaticamente
Start-Process "http://localhost:$port/"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    
    $localPath = $request.Url.LocalPath.TrimStart('/')
    if ($localPath -eq '') { $localPath = 'index.html' }
    
    # Limpiar path
    $localPath = $localPath.Replace("..", "")
    $filePath = Join-Path (Get-Location) $localPath
    
    if (Test-Path $filePath -PathType Leaf) {
        $content = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $content.Length
        
        if ($filePath.EndsWith(".html")) { $response.ContentType = "text/html; charset=utf-8" }
        elseif ($filePath.EndsWith(".json")) { $response.ContentType = "application/json; charset=utf-8" }
        elseif ($filePath.EndsWith(".css")) { $response.ContentType = "text/css; charset=utf-8" }
        elseif ($filePath.EndsWith(".js")) { $response.ContentType = "application/javascript; charset=utf-8" }
        elseif ($filePath.EndsWith(".png")) { $response.ContentType = "image/png" }
        elseif ($filePath.EndsWith(".svg")) { $response.ContentType = "image/svg+xml" }
        
        # Evitar cache de los JSON para que se actualicen al guardarlos
        $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
        
        try {
            $response.OutputStream.Write($content, 0, $content.Length)
        } catch { }
    } else {
        $response.StatusCode = 404
    }
    $response.Close()
}
