[Setup]
AppName=Scanner Agent
AppVersion=1.0
DefaultDirName={pf}\Scanner Agent
DefaultGroupName=Scanner Agent
OutputDir=.
OutputBaseFilename=ScannerAgentSetup
Compression=lzma
SolidCompression=yes

[Files]
Source: "scanner-agent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Scanner Agent"; Filename: "{app}\scanner-agent.exe"
Name: "{commondesktop}\Scanner Agent"; Filename: "{app}\scanner-agent.exe"

[Run]
Filename: "{app}\scanner-agent.exe"; Description: "Launch Scanner Agent"; Flags: nowait postinstall skipifsilent