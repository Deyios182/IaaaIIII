Add-Type -AssemblyName System.Device
$watcher = New-Object System.Device.Location.GeoCoordinateWatcher
$watcher.Start()
# Wait up to 5 seconds for location fix
$timeout = 50
while ($watcher.Status -eq [System.Device.Location.GeoPositionStatus]::NoData -and $timeout -gt 0) {
    Start-Sleep -Milliseconds 100
    $timeout--
}
$loc = $watcher.Position.Location
if ($loc.IsUnknown) {
    Write-Host "Unknown"
} else {
    Write-Host "$($loc.Latitude),$($loc.Longitude)"
}
