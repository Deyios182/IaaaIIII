[Windows.System.UserProfile.GlobalizationPreferences,Windows.System.UserProfile,ContentType=WindowsRuntime] | Out-Null
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asynco = [Windows.Devices.Geolocation.Geolocator,Windows.Devices.Geolocation,ContentType=WindowsRuntime]::new().GetGeopositionAsync()
$asynco.AsTask().Wait()
$pos = $asynco.GetResults().Coordinate.Point.Position
Write-Host "$($pos.Latitude),$($pos.Longitude)"
