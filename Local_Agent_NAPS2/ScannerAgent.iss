[Setup]
AppName=Scanner Agent
AppVersion=1.0
DefaultDirName={autopf}\Scanner Agent
DefaultGroupName=Scanner Agent
OutputDir=.
OutputBaseFilename=ScannerAgentSetup
Compression=lzma
SolidCompression=yes
SetupIconFile=assets\scanner-agent.ico

[Files]
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
#ifexist ".env"
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist
#endif

[Icons]
Name: "{group}\Scanner Agent"; Filename: "{app}\scanner-agent.exe"; IconFilename: "{app}\scanner-agent.exe"
Name: "{commondesktop}\Scanner Agent"; Filename: "{app}\scanner-agent.exe"; IconFilename: "{app}\scanner-agent.exe"

[Run]
Filename: "{app}\scanner-agent.exe"; Description: "Launch Scanner Agent"; Flags: nowait postinstall skipifsilent