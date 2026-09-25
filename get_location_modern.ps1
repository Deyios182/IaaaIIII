[Windows.Devices.Geolocation.Geolocator,Windows.Devices.Geolocation,ContentType=WindowsRuntime] | Out-Null
$geolocator = [Windows.Devices.Geolocation.Geolocator]::new()
$geolocator.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High

$task = $geolocator.GetGeopositionAsync().AsTask()
$task.Wait()
$pos = $task.Result.Coordinate.Point.Position
Write-Host "$($pos.Latitude),$($pos.Longitude)"
