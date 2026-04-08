const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const candidates = [
  process.env.ISCC_PATH,
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
].filter(Boolean);

const isccPath = candidates.find((candidate) => fs.existsSync(candidate));

if (!isccPath) {
  console.error('Inno Setup Compiler was not found. Set ISCC_PATH or install Inno Setup 6.');
  process.exit(1);
}

const scriptPath = path.join(__dirname, 'ScannerAgent.iss');

execFileSync(isccPath, [scriptPath], {
  stdio: 'inherit',
  cwd: __dirname,
});