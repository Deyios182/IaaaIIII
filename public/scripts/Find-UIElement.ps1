param (
    [Parameter(Mandatory=$true)]
    [string]$ElementName
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$rootElement = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, 
    $ElementName
)

# Buscar en todo el árbol (puede ser lento, limitamos a la primera coincidencia que sea clickeable)
$element = $rootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)

if ($element -ne $null) {
    try {
        $rect = $element.Current.BoundingRectangle
        $result = @{
            Found = $true
            Name = $element.Current.Name
            X = $rect.Left + ($rect.Width / 2)
            Y = $rect.Top + ($rect.Height / 2)
            Width = $rect.Width
            Height = $rect.Height
        }
        $result | ConvertTo-Json
    } catch {
        Write-Output '{"Found": false, "Error": "Elemento encontrado pero no tiene BoundingRectangle"}'
    }
} else {
    Write-Output '{"Found": false}'
}
