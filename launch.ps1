$ErrorActionPreference = 'Stop'
$taskLauncher = Join-Path $PSScriptRoot 'start-pet.js'
Start-Process -FilePath 'node.exe' -ArgumentList ('"' + $taskLauncher + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
