# Windows PowerShell 5.1+; launched by github-bootstrap.cmd.
# Auth uses the official GitHub CLI. No tokens are written to project files.
[CmdletBinding()]
param(
    [string]$ProjectDir = '',
    [string]$RepoName = 'blog-insight',
    [string]$RepoOwner = '',
    [ValidateSet('public','private')][string]$Visibility = 'public',
    [string]$Description = 'Personal Naver blog keyword insight dashboard',
    [ValidateSet('0','1')][string]$AutoInstallTools = '1',
    [ValidateSet('0','1')][string]$CreateVersionTag = '1'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$working = $null
$gh = $null
$git = $null

function Say([string]$kind,[string]$message) { Write-Host "[$kind] $message" }
function Fail([string]$message) { throw $message }
function Refresh-Path {
    $env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User') + ';' + $env:PATH
}
function Find-Executable([string]$name) {
    $c = Get-Command $name -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $locations = @()
    if ($name -eq 'git.exe') {
        $locations = @("$env:ProgramFiles\Git\cmd\git.exe", "${env:ProgramFiles(x86)}\Git\cmd\git.exe", "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")
    } elseif ($name -eq 'gh.exe') {
        $locations = @("$env:ProgramFiles\GitHub CLI\gh.exe", "${env:ProgramFiles(x86)}\GitHub CLI\gh.exe", "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe")
    }
    foreach ($p in $locations) { if ($p -and (Test-Path -LiteralPath $p -PathType Leaf)) { return $p } }
    return $null
}
function Ensure-Tool([string]$name,[string]$package,[string]$downloadUrl) {
    $found = Find-Executable $name
    if ($found) { Say 'OK' "$name detected"; return $found }
    Say 'WARN' "$name not found"
    if ($AutoInstallTools -eq '1' -and (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        Say 'CHECK' "Installing $package using Windows Package Manager. Windows may ask for permission."
        & winget.exe install --id $package -e --source winget --silent --accept-source-agreements --accept-package-agreements
        Refresh-Path
        $found = Find-Executable $name
        if ($found) { Say 'OK' "$name installed"; return $found }
        Say 'WARN' "Automatic installation was not completed (winget exit code: $LASTEXITCODE)."
    }
    Fail "$name is required. Install it from $downloadUrl, reopen CMD, and try again."
}
function Exec([string]$program,[string[]]$arguments,[string]$what) {
    & $program @arguments
    if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code: $LASTEXITCODE)." }
}
function Quiet-Exit([string]$program,[string[]]$arguments) {
    try { & $program @arguments *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}
function Get-Output([string]$program,[string[]]$arguments,[string]$what) {
    $output = & $program @arguments
    if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code: $LASTEXITCODE)." }
    return ($output -join "`n")
}
function Safe-Source([string]$relative) {
    $r = $relative.Replace('\','/')
    if ($r -match '(^|/)(\.git|node_modules|\.wrangler|\.venv|__pycache__|dist|_site)(/|$)') { return $false }
    if ($r -match '(^|/)(\.env(\..*)?|\.dev\.vars(\..*)?|credentials\.json|secrets\.json|\.DS_Store)(/|$)') { return $false }
    if ($r -match '(?i)\.(pem|p12|pfx|key|log)$') { return $false }
    return $true
}
function Set-SiteMetadata([string]$indexPath,[string]$siteUrl) {
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    $html = [System.IO.File]::ReadAllText($indexPath,[Text.Encoding]::UTF8)
    $metadata = @(
        @{ name='og:url'; value=$siteUrl },
        @{ name='og:image'; value=($siteUrl+'assets/og-image.png') },
        @{ name='twitter:image'; value=($siteUrl+'assets/og-image.png') }
    )
    foreach ($entry in $metadata) {
        $n = [regex]::Escape($entry.name)
        $pattern = '(<meta\s+(?:property|name)="' + $n + '"\s+content=")[^"]*("\s*/?>)'
        $rx = [regex]::new($pattern,[System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $match = $rx.Match($html)
        if (-not $match.Success) { Fail "Missing social metadata tag: $($entry.name)" }
        $html = $rx.Replace($html, [System.Text.RegularExpressions.MatchEvaluator]{param($m) $m.Groups[1].Value+$entry.value+$m.Groups[2].Value}, 1)
    }
    [System.IO.File]::WriteAllText($indexPath,$html,$utf8)
}

try {
    # Resolve the package folder from this .ps1 file rather than passing a
    # trailing-backslash path through cmd.exe/PowerShell argument parsing.
    # An argument such as -ProjectDir "C:\\folder\" can swallow the closing
    # quote on Windows, yielding illegal characters in GetFullPath().
    if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
        $ProjectDir = Join-Path $PSScriptRoot '..'
    }
    $ProjectDir = [IO.Path]::GetFullPath($ProjectDir)
    Say 'CHECK' "Project folder: $ProjectDir"
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectDir 'index.html') -PathType Leaf)) { Fail 'index.html is missing in the project folder.' }
    if ($RepoName -notmatch '^[A-Za-z0-9._-]{1,100}$' -or $RepoName -eq '.' -or $RepoName -eq '..') { Fail 'Invalid REPO_NAME. Use letters, numbers, dots, underscore or hyphen only.' }
    if ($RepoOwner -and $RepoOwner -notmatch '^[A-Za-z0-9-]{1,39}$') { Fail 'Invalid REPO_OWNER.' }
    Say 'CHECK' 'Inspecting Git and GitHub CLI'
    $git = Ensure-Tool 'git.exe' 'Git.Git' 'https://git-scm.com/downloads/win'
    $gh = Ensure-Tool 'gh.exe' 'GitHub.cli' 'https://cli.github.com/'
    Exec $git @('--version') 'Git version check'
    Exec $gh @('--version') 'GitHub CLI version check'

    Say 'CHECK' 'Verifying GitHub authentication'
    if (-not (Quiet-Exit $gh @('auth','status','-h','github.com'))) {
        Say 'WARN' 'GitHub sign-in required. The official GitHub CLI will open your browser.'
        Exec $gh @('auth','login','-h','github.com','-p','https','-w') 'GitHub login'
    }
    Exec $gh @('auth','setup-git') 'GitHub Git authentication setup'
    $login = (Get-Output $gh @('api','user','--jq','.login') 'GitHub user lookup').Trim()
    if (-not $RepoOwner) { $RepoOwner = $login }
    $fullRepo = "$RepoOwner/$RepoName"
    Say 'OK' "Signed in: $login"
    Say 'CHECK' "Target repository: $fullRepo ($Visibility)"

    $repoExists = Quiet-Exit $gh @('repo','view',$fullRepo,'--json','nameWithOwner')
    if (-not $repoExists) {
        Say 'CHECK' "Creating GitHub repository $fullRepo"
        $visibilityFlag = '--' + $Visibility
        Exec $gh @('repo','create',$fullRepo,$visibilityFlag,'--description',$Description) 'Repository creation'
        Say 'OK' 'Repository created'
    } else {
        Say 'OK' 'Repository already exists; it will not be recreated'
        $isPrivate = (Get-Output $gh @('repo','view',$fullRepo,'--json','isPrivate','--jq','.isPrivate') 'Repository visibility lookup').Trim()
        if ($isPrivate -eq 'true') { Say 'WARN' 'This repository is PRIVATE. Pages availability depends on GitHub plan.' }
    }

    $siteUrl = if ($RepoName -ieq "$RepoOwner.github.io") { "https://$RepoOwner.github.io/" } else { "https://$RepoOwner.github.io/$RepoName/" }
    $working = Join-Path ([IO.Path]::GetTempPath()) ('blog-insight-publish-' + [guid]::NewGuid().ToString('N'))
    Say 'CHECK' 'Cloning the current remote repository into a temporary folder'
    Exec $gh @('repo','clone',$fullRepo,$working,'--','--quiet') 'Safe repository clone'

    # Never replace an unrelated repository with the same name by accident.
    if ($repoExists -and (Test-Path -LiteralPath (Join-Path $working 'index.html'))) {
        $existingHtml = [IO.File]::ReadAllText((Join-Path $working 'index.html'),[Text.Encoding]::UTF8)
        if ($existingHtml -notmatch '블로그 인사이트|Blog Insight') {
            Fail "The existing repository appears to contain a different website. Change REPO_NAME in github-bootstrap.cmd to avoid overwriting it."
        }
    } elseif ($repoExists -and (Test-Path -LiteralPath (Join-Path $working 'README.md'))) {
        $existingReadme = [IO.File]::ReadAllText((Join-Path $working 'README.md'),[Text.Encoding]::UTF8)
        if ($existingReadme -notmatch '블로그 인사이트|Blog Insight') {
            Fail "The existing repository appears unrelated. Choose another REPO_NAME."
        }
    }
    $hasHistory = Quiet-Exit $git @('-C',$working,'rev-parse','--verify','HEAD')
    if (-not $hasHistory) {
        Exec $git @('-C',$working,'symbolic-ref','HEAD','refs/heads/main') 'Initialize main branch'
    } else {
        $branch = (Get-Output $git @('-C',$working,'branch','--show-current') 'Branch query').Trim()
        if ($branch -ne 'main') {
            if (Quiet-Exit $git @('-C',$working,'show-ref','--verify','refs/remotes/origin/main')) {
                Exec $git @('-C',$working,'switch','--track','origin/main') 'Switch to existing main branch'
            } else {
                Exec $git @('-C',$working,'switch','-c','main') 'Create main branch from existing history'
            }
        }
    }
    Say 'CHECK' 'Copying project files while excluding credentials and generated folders'
    $sourcePrefix = $ProjectDir.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    $copied = 0
    foreach ($item in Get-ChildItem -LiteralPath $ProjectDir -File -Recurse -Force) {
        $relative = $item.FullName.Substring($sourcePrefix.Length)
        if (-not (Safe-Source $relative)) { continue }
        $destination = Join-Path $working $relative
        $parent = Split-Path -Parent $destination
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Copy-Item -LiteralPath $item.FullName -Destination $destination -Force
        $copied++
    }
    if ($copied -lt 8) { Fail 'Too few project files copied; refusing to publish.' }
    Set-SiteMetadata (Join-Path $working 'index.html') $siteUrl
    Say 'OK' "Copied $copied files; metadata points to $siteUrl"

    Say 'CHECK' 'Configuring commit author locally'
    $authorName = (& $git -C $working config user.name)
    if (-not $authorName) { Exec $git @('-C',$working,'config','user.name',$login) 'Set local Git username' }
    $authorEmail = (& $git -C $working config user.email)
    if (-not $authorEmail) { Exec $git @('-C',$working,'config','user.email',"$login@users.noreply.github.com") 'Set local Git email' }

    Say 'CHECK' 'Scanning staged files for accidental credential filenames'
    Exec $git @('-C',$working,'add','--all') 'Stage project files'
    $staged = Get-Output $git @('-C',$working,'diff','--cached','--name-only') 'Staged file scan'
    foreach ($entry in ($staged -split "`r?`n")) {
        if ($entry -and (-not (Safe-Source $entry))) { Fail "Sensitive or generated path was staged: $entry. Remove it and retry." }
    }
    $hasChanges = -not (Quiet-Exit $git @('-C',$working,'diff','--cached','--quiet'))
    if ($hasChanges) {
        Say 'CHECK' 'Creating a conventional commit'
        Exec $git @('-C',$working,'commit','-m','chore: publish blog insight dashboard to GitHub Pages') 'Create Git commit'
    } else { Say 'OK' 'No changes to commit' }

    Say 'CHECK' 'Pushing main branch without force'
    try { Exec $git @('-C',$working,'push','-u','origin','main') 'Git push' }
    catch { Fail "Git push rejected. The remote may have new commits or branch protection. Run this CMD again or resolve the conflict on GitHub. Never use --force. Details: $($_.Exception.Message)" }
    Say 'OK' 'Repository pushed'
    $default = (Get-Output $gh @('repo','view',$fullRepo,'--json','defaultBranchRef','--jq','.defaultBranchRef.name') 'Default branch lookup').Trim()
    if ($default -ne 'main') {
        if (Quiet-Exit $gh @('repo','edit',$fullRepo,'--default-branch','main')) { Say 'OK' 'Default branch set to main' }
        else { Say 'WARN' 'Could not change default branch to main; workflow still deploys from main' }
    }

    Say 'CHECK' 'Applying repository information'
    if (Quiet-Exit $gh @('api',"repos/$fullRepo",'-X','PATCH','-f',"description=$Description",'-f',"homepage=$siteUrl")) { Say 'OK' 'Description and homepage updated' }
    else { Say 'WARN' 'Repository description/homepage could not be updated' }
    if (Quiet-Exit $gh @('api',"repos/$fullRepo/topics",'-X','PUT','-f','names[]=github-pages','-f','names[]=naver-blog','-f','names[]=keyword-analysis')) { Say 'OK' 'Topics updated' }
    else { Say 'WARN' 'Could not update topics (non-fatal)' }

    Say 'CHECK' 'Enabling GitHub Pages with GitHub Actions as the source'
    $hasPages = Quiet-Exit $gh @('api',"repos/$fullRepo/pages")
    if ($hasPages) { $pagesJson = Get-Output $gh @('api',"repos/$fullRepo/pages") 'Read Pages settings' }
    if (-not $hasPages) {
        Exec $gh @('api',"repos/$fullRepo/pages",'-X','POST','-f','build_type=workflow','--silent') 'Enable GitHub Pages'
        Say 'OK' 'GitHub Pages enabled'
    } else {
        $pageObj = (($pagesJson -join "`n") | ConvertFrom-Json)
        if ($pageObj.build_type -ne 'workflow') {
            Exec $gh @('api',"repos/$fullRepo/pages",'-X','PUT','-f','build_type=workflow','--silent') 'Change Pages deployment source'
            Say 'OK' 'Switched Pages source to GitHub Actions'
        } else { Say 'OK' 'GitHub Pages already configured for Actions' }
    }

    Say 'CHECK' 'Starting a deployment workflow'
    $triggered = $false
    $startTime = [DateTime]::UtcNow
    for ($attempt=1; $attempt -le 10; $attempt++) {
        if (Quiet-Exit $gh @('workflow','run','deploy.yml','-R',$fullRepo,'--ref','main')) { $triggered=$true; break }
        Start-Sleep -Seconds 4
    }
    if (-not $triggered) { Fail "Cannot trigger deploy.yml. Visit https://github.com/$fullRepo/actions and enable Actions if disabled, then rerun." }
    Say 'OK' 'Deployment requested'
    $runId = $null
    for ($attempt=1; $attempt -le 15; $attempt++) {
        $runsRaw = & $gh run list '-R' $fullRepo '--workflow' 'deploy.yml' '--branch' 'main' '--limit' '15' '--json' 'databaseId,event,createdAt,status'
        if ($LASTEXITCODE -eq 0) {
            $runs = @(($runsRaw -join "`n") | ConvertFrom-Json)
            $mine = @($runs | Where-Object { $_.event -eq 'workflow_dispatch' -and ([DateTime]::Parse($_.createdAt).ToUniversalTime() -ge $startTime.AddMinutes(-2)) } | Sort-Object -Property createdAt -Descending | Select-Object -First 1)
            if ($mine.Count -gt 0 -and $mine[0].databaseId) { $runId = [string]$mine[0].databaseId; break }
        }
        Start-Sleep -Seconds 4
    }
    if (-not $runId) { Fail "Deployment was requested but run ID was not found. Check https://github.com/$fullRepo/actions" }
    Say 'CHECK' "Waiting for Actions run $runId to finish"
    Exec $gh @('run','watch',$runId,'-R',$fullRepo,'--exit-status') 'GitHub Pages deployment workflow'
    Say 'OK' 'GitHub Pages deployment workflow completed successfully'

    $actualUrl = & $gh api "repos/$fullRepo/pages" '--jq' '.html_url'
    if ($LASTEXITCODE -eq 0 -and $actualUrl) { $siteUrl = ($actualUrl -join '').TrimEnd('/') + '/' }

    if ($CreateVersionTag -eq '1') {
        $tagExistsLocal = Quiet-Exit $git @('-C',$working,'show-ref','--verify','refs/tags/v1.0.0')
        $tagRemoteText = & $git -C $working ls-remote --tags origin refs/tags/v1.0.0
        $tagExistsRemote = ($LASTEXITCODE -eq 0 -and [bool]$tagRemoteText)
        if (-not $tagExistsLocal -and -not $tagExistsRemote) {
            Say 'CHECK' 'Creating version tag v1.0.0'
            Exec $git @('-C',$working,'tag','-a','v1.0.0','-m','First GitHub Pages release') 'Create version tag'
            Exec $git @('-C',$working,'push','origin','v1.0.0') 'Push version tag'
            Say 'OK' 'Version tag published'
        } else { Say 'OK' 'Version tag v1.0.0 already exists' }
    }

    Write-Host ''
    Say 'OK' "Repository: https://github.com/$fullRepo"
    Say 'OK' "Web site : $siteUrl"
    Say 'OK' "Actions  : https://github.com/$fullRepo/actions"
    Say 'WARN' 'The site starts with sample data. Live Naver data requires separate Worker/API credentials.'
    Say 'WARN' 'GitHub Pages content is public to visitors. Never commit real API keys or personal data.'
    exit 0
}
catch {
    Say 'ERROR' $_.Exception.Message
    Say 'WARN' 'Recovery: fix the issue above and rerun github-bootstrap.cmd. Existing remote files are not force-overwritten.'
    exit 1
}
finally {
    if ($working -and (Test-Path -LiteralPath $working)) {
        try { Remove-Item -LiteralPath $working -Force -Recurse -ErrorAction Stop }
        catch { Say 'WARN' "Temporary clone cleanup failed: $working" }
    }
}
