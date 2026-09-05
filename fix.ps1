
$files = @(".\js\app.js", ".\js\db.js", ".\js\notifications.js", ".\index.html")
foreach ($f in $files) {
  $t = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
  $b = [System.Text.Encoding]::GetEncoding(1252).GetBytes($t)
  $ftext = [System.Text.Encoding]::UTF8.GetString($b)
  [System.IO.File]::WriteAllText($f, $ftext, [System.Text.Encoding]::UTF8)
}

