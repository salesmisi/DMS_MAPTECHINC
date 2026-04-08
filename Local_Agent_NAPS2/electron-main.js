const fs = require('fs');
const path = require('path');
const { app, Menu, Tray, nativeImage } = require('electron');
const {
  getLogFilePath,
  installConsoleFileLogger,
  installProcessErrorHandlers,
} = require('./logger');

app.setAppUserModelId('com.maptech.scanneragent');

process.env.SCANNER_AGENT_ROOT = app.isPackaged ? path.dirname(process.execPath) : __dirname;
process.env.SCANNER_AGENT_PACKAGED = app.isPackaged ? 'true' : 'false';
process.env.SCANS_DIR = process.env.SCANS_DIR || path.join(app.getPath('userData'), 'scans');
process.env.SCANNER_AGENT_LOG_DIR = process.env.SCANNER_AGENT_LOG_DIR || path.join(app.getPath('userData'), 'logs');

installConsoleFileLogger();
installProcessErrorHandlers();

const { startServer, stopServer } = require('./server');

let tray = null;
let isQuitting = false;
let currentStatus = 'Starting Scanner Agent...';

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  if (tray) {
    tray.popUpContextMenu();
  }
});

function getAssetPath(fileName) {
  return path.join(app.getAppPath(), 'assets', fileName);
}

function createTrayIcon() {
  const iconPath = getAssetPath('scanner-agent.png');

  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  }

  const svgPath = getAssetPath('scanner-agent.svg');
  if (fs.existsSync(svgPath)) {
    return nativeImage.createFromPath(svgPath).resize({ width: 16, height: 16 });
  }

  return nativeImage.createEmpty();
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: currentStatus, enabled: false },
    { type: 'separator' },
    { label: 'Exit', click: () => shutdownAndQuit() },
  ]);
}

function refreshTray() {
  if (!tray) {
    return;
  }

  tray.setToolTip('Scanner Agent Running');
  tray.setContextMenu(buildTrayMenu());
}

function configureAutoLaunch() {
  if (process.platform !== 'win32' || !app.isPackaged) {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: ['--hidden'],
  });
}

async function shutdownAndQuit() {
  if (isQuitting) {
    return;
  }

  isQuitting = true;

  try {
    await stopServer();
  } catch (error) {
    console.error('[electron] Failed to stop scanner server cleanly:', error);
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }

  app.quit();
}

async function bootstrap() {
  await app.whenReady();

  tray = new Tray(createTrayIcon());
  refreshTray();
  configureAutoLaunch();

  try {
    await startServer();
    currentStatus = 'Scanner Agent Running';
    console.log(`[electron] Tray host started. Log file: ${getLogFilePath()}`);
  } catch (error) {
    currentStatus = 'Scanner Agent Error';
    console.error('[electron] Failed to start scanner server:', error);
  }

  refreshTray();
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

bootstrap().catch((error) => {
  console.error('[electron] Fatal bootstrap error:', error);
});