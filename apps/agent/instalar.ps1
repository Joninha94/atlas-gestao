# Instala o agente da Produtiva Gestão no Agendador de Tarefas do Windows.
# Executar como Administrador, na pasta onde estão agente.exe (ou agente.mjs) e agente.config.json:
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Minutos 15
param([int]$Minutos = 15, [string]$Usuario = "SYSTEM")

$ErrorActionPreference = "Stop"
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path "$pasta\agente.config.json")) { throw "Crie agente.config.json (copie de agente.config.exemplo.json) antes de instalar." }

if (Test-Path "$pasta\agente.exe") { $exe = "$pasta\agente.exe"; $argumentos = ""; $teste = @("--teste") }
else { $exe = (Get-Command node).Source; $argumentos = "`"$pasta\agente.mjs`""; $teste = @("$pasta\agente.mjs", "--teste") }

Write-Host "Testando conexão e pasta de importação..."
& $exe @teste
if ($LASTEXITCODE -ne 0) { throw "O teste falhou. Veja agente.log." }

if ($argumentos) { $acao = New-ScheduledTaskAction -Execute $exe -Argument $argumentos -WorkingDirectory $pasta }
else { $acao = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $pasta }
$gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutos)
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "Produtiva - Agente XML" -Action $acao -Trigger $gatilho -Settings $config -User $Usuario -RunLevel Highest -Force | Out-Null
Write-Host "Instalado: roda a cada $Minutos minutos. Log em $pasta\agente.log"
Write-Host "Para remover: Unregister-ScheduledTask -TaskName 'Produtiva - Agente XML' -Confirm:`$false"
