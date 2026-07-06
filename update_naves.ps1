$url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR8HsbsBKbuv6xzJgBG34db5NtBfjPc9Vm9MZvL6vStnI6x9jRQInxrQ8V1SIPmoA/pub?gid=2070743900&single=true&output=csv"
$outputFile = Join-Path (Get-Location) "data\naves.js"

Write-Host "Conectando a Google Drive para descargar las naves..."

try {
    # Habilitar TLS 1.2
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing
    
    # Escapar comillas invertidas y barras
    $csvData = $response.Content.Replace("\", "\\").Replace("`"", "\`"").Replace("``", "\``")
    
    # Envolver en formato JS para saltar el CORS de file:///
    $jsContent = "window.DATA_NAVES = `"```n$csvData`n```";"
    
    # Las comillas triples de Markdown en JS se manejan con template literals (backticks). 
    # Lo escribiremos asi: window.DATA_NAVES = ` [CONTENIDO] `;
    $jsContent = "window.DATA_NAVES = ``$csvData``;"
    
    [System.IO.File]::WriteAllText($outputFile, $jsContent, [System.Text.Encoding]::UTF8)
    Write-Host "¡Datos descargados y guardados exitosamente!"
} catch {
    Write-Host "Error al descargar la planilla: $_"
}
Start-Sleep -Seconds 3
