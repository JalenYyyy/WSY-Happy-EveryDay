$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$baseUrl = "http://localhost:3000"

# Step 1
$loginPage = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Get -WebSession $session
Write-Output "Step 1: Users count = $($loginPage.users.Count)"

# Step 2
$loginBody = @{ username = "user1"; password = "cat123" } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $session
Write-Output "Step 2: Logged in as $($loginRes.user.username)"

# Step 3
$me = Invoke-RestMethod -Uri "$baseUrl/api/auth/me" -Method Get -WebSession $session
Write-Output "Step 3: Me check - avatarUrl: $($me.avatarUrl -ne $null), bio: $($me.bio -ne $null)"

# Step 4
$cats = Invoke-RestMethod -Uri "$baseUrl/api/cats" -Method Get -WebSession $session
# Handle if $cats is an array or object with data property
$catList = if ($cats.GetType().IsArray) { $cats } else { $cats.data }
$catId = $catList[0].id
Write-Output "Step 4: Cat ID = $catId"

# Step 5
$patchBody = @{ nickname = "鱼鱼"; preference = "喜欢被先接住情绪，再慢慢聊建议。" } | ConvertTo-Json
Invoke-RestMethod -Uri "$baseUrl/api/cats/$catId/nicknames" -Method Patch -Body $patchBody -ContentType "application/json" -WebSession $session
Write-Output "Step 5: Nickname/Preference patched"

# Step 6
$msgBody = @{ content = "今天有点累，想先被安慰一下" } | ConvertTo-Json
Invoke-RestMethod -Uri "$baseUrl/api/cats/$catId/messages" -Method Post -Body $msgBody -ContentType "application/json" -WebSession $session
Write-Output "Step 6: Message sent"

Write-Output "Waiting for processing..."
Start-Sleep -Seconds 5

# Step 7
$finalCats = Invoke-RestMethod -Uri "$baseUrl/api/cats" -Method Get -WebSession $session
$finalCatList = if ($finalCats.GetType().IsArray) { $finalCats } else { $finalCats.data }
$targetCat = $finalCatList | Where-Object { $_.id -eq $catId }
$u1 = $targetCat.users | Where-Object { $_.username -eq "user1" }
$u2 = $targetCat.users | Where-Object { $_.username -eq "user2" }

Write-Output "Step 7 Verification:"
Write-Output "User1 Nickname: $($u1.nickname)"
Write-Output "User1 Preference: $($u1.preference)"
Write-Output "User1 MemorySummary exists: $( -not [string]::IsNullOrEmpty($u1.memorySummary) )"
Write-Output "User1 Relationship: $($u1.relationship)"
Write-Output "User2 Nickname (unchanged): $($u2.nickname)"
