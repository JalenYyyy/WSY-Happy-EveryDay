$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$baseUrl = "http://localhost:3000"

# Login first
$loginBody = @{ username = "user1"; password = "cat123" } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $session

# Get cats
$cats = Invoke-RestMethod -Uri "$baseUrl/api/cats" -Method Get -WebSession $session
$cats | ConvertTo-Json -Depth 5
