Add-Type -AssemblyName System.Device
$watcher = New-Object System.Device.Location.GeoCoordinateWatcher
$watcher.Start()
Start-Sleep -Seconds 10
$loc = $watcher.Position.Location
if ($loc.IsUnknown) {
    Write-Host "Unknown"
} else {
    Write-Host "$($loc.Latitude),$($loc.Longitude)"
}
