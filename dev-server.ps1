param(
  [int]$Port = 8000,
  [string]$Root = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$prefix = "http://localhost:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "Serving '$Root' at $prefix" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray

function Get-ContentType([string]$path) {
  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  switch ($ext) {
    '.html' { 'text/html; charset=utf-8' }
    '.css'  { 'text/css; charset=utf-8' }
    '.js'   { 'application/javascript; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.svg'  { 'image/svg+xml' }
    '.png'  { 'image/png' }
    '.jpg'  { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.gif'  { 'image/gif' }
    '.ico'  { 'image/x-icon' }
    '.txt'  { 'text/plain; charset=utf-8' }
    default { 'application/octet-stream' }
  }
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()

    try {
      $relativePath = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }

      $safeRelative = $relativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar
      $localPath = Join-Path $Root $safeRelative

      if (Test-Path $localPath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($localPath)
        $ctx.Response.StatusCode = 200
        $ctx.Response.ContentType = Get-ContentType $localPath

        # Dev server: always disable cache (ES modules can be aggressively cached)
        $ctx.Response.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        $ctx.Response.Headers['Pragma'] = 'no-cache'
        $ctx.Response.Headers['Expires'] = '0'

        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $ctx.Response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $ctx.Response.ContentType = 'text/plain; charset=utf-8'
        $ctx.Response.ContentLength64 = $msg.Length
        $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      $ctx.Response.StatusCode = 500
      $msg = [System.Text.Encoding]::UTF8.GetBytes("500 Server Error`n$($_.Exception.Message)")
      $ctx.Response.ContentType = 'text/plain; charset=utf-8'
      $ctx.Response.ContentLength64 = $msg.Length
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    } finally {
      $ctx.Response.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
