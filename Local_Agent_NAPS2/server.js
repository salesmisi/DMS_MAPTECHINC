// ============================================================================
// Local Scanner Agent for Maptech DMS
// Bridges local NAPS2 scanner hardware with the cloud backend on Railway
// ============================================================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { exec, spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const util = require('util');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

let consoleInstalled = false;
let processHandlersInstalled = false;

function getLogDirectory() {
  return process.env.SCANNER_AGENT_LOG_DIR || path.join(process.env.SCANNER_AGENT_ROOT || __dirname, 'logs');
}

function getLogFilePath() {
  return path.join(getLogDirectory(), 'scanner-agent.log');
}

function ensureLogDirectory() {
  fs.mkdirSync(getLogDirectory(), { recursive: true });
}

function formatLogArgs(args) {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return arg.stack || arg.message;
    }

    if (typeof arg === 'string') {
      return arg;
    }

    return util.inspect(arg, { depth: 5, colors: false, breakLength: Infinity });
  }).join(' ');
}

function writeLog(level, args) {
  try {
    ensureLogDirectory();
    fs.appendFileSync(getLogFilePath(), `[${new Date().toISOString()}] [${level}] ${formatLogArgs(args)}\n`, 'utf8');
  } catch (_error) {
    // Ignore logger write failures.
  }
}

function installConsoleFileLogger() {
  if (consoleInstalled) {
    return;
  }

  consoleInstalled = true;

  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);

    console[level] = (...args) => {
      writeLog(level.toUpperCase(), args);
      original(...args);
    };
  }
}

function installProcessErrorHandlers(options = {}) {
  if (processHandlersInstalled) {
    return;
  }

  processHandlersInstalled = true;
  const { exitOnUncaughtException = false } = options;

  process.on('unhandledRejection', (reason) => {
    writeLog('UNHANDLED_REJECTION', [reason]);
    console.error('[process] Unhandled promise rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    writeLog('UNCAUGHT_EXCEPTION', [error]);
    console.error('[process] Uncaught exception:', error);

    if (exitOnUncaughtException) {
      process.exitCode = 1;
    }
  });
}

installConsoleFileLogger();
installProcessErrorHandlers({ exitOnUncaughtException: false });

loadEnvironment();

const app = express();
const PORT = toInteger(process.env.PORT, 3001);
let httpServer = null;
const IS_PACKAGED_RUNTIME = process.env.SCANNER_AGENT_PACKAGED === 'true' || !!process.pkg;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const APP_ROOT = getAppRoot();
const SCANS_DIR = path.resolve(APP_ROOT, process.env.SCANS_DIR || 'scans');
const BIN_DIR = process.env.BIN_DIR
  ? path.resolve(process.env.BIN_DIR)
  : path.resolve(APP_ROOT, 'bin');
const SCAN_TIMEOUT = toInteger(process.env.SCAN_TIMEOUT, 300000); // 5 min default
const DEVICE_CACHE_MAX_AGE = toInteger(process.env.DEVICE_CACHE_MAX_AGE, 30000);
const DEVICE_DETECTION_TIMEOUT = toInteger(process.env.DEVICE_DETECTION_TIMEOUT, 3000);
const DEVICE_EMPTY_REFRESH_INTERVAL = toInteger(process.env.DEVICE_EMPTY_REFRESH_INTERVAL, 10000);
const DEVICE_STABLE_REFRESH_INTERVAL = toInteger(process.env.DEVICE_STABLE_REFRESH_INTERVAL, 60000);
const DEVICE_RECENT_CHANGE_INTERVAL = toInteger(process.env.DEVICE_RECENT_CHANGE_INTERVAL, 5000);
const DEVICE_RECENT_CHANGE_WINDOW = toInteger(process.env.DEVICE_RECENT_CHANGE_WINDOW, 30000);
const DEVICE_FAILURE_BACKOFF_INTERVAL = toInteger(process.env.DEVICE_FAILURE_BACKOFF_INTERVAL, 120000);
const DEVICE_FAILURE_BACKOFF_THRESHOLD = toInteger(process.env.DEVICE_FAILURE_BACKOFF_THRESHOLD, 3);
const DEVICE_ERROR_LOG_THROTTLE = toInteger(process.env.DEVICE_ERROR_LOG_THROTTLE, 60000);
const NAPS2_NAMES = ['naps2.console.exe', 'NAPS2.Console.exe'];
const VIRTUAL_PRINTER_PATTERN = /(pdf|xps|onenote|fax|microsoft print to pdf|microsoft xps document writer|send to onenote|adobe pdf|cutepdf|bullzip|do[pd]f|foxit pdf|print to file)/i;
const STATE_DIR = path.resolve(getStateDirectory());
const DEVICE_CACHE_FILE = path.join(STATE_DIR, 'device-cache.json');

const deviceEvents = new EventEmitter();

const deviceCache = {
  scanners: {
    items: [],
    lastUpdated: 0,
    lastError: null,
    signature: '',
  },
  printers: {
    items: [],
    lastUpdated: 0,
    lastError: null,
    signature: '',
  },
};

const deviceRefreshState = {
  ready: false,
  isRefreshing: false,
  refreshPromise: null,
  lastUpdated: 0,
  lastError: null,
  lastRefreshDuration: 0,
  deviceCount: 0,
  trayStatus: 'Initializing devices...',
  consecutiveFailures: 0,
  recentChangeUntil: 0,
  nextRefreshAt: 0,
  changeWatcherActive: false,
};

let deviceRefreshTimer = null;
let deviceWatcherRestartTimer = null;
let deviceChangeWatcher = null;
let deviceWatcherStdoutBuffer = '';
let deviceWatcherStderrBuffer = '';
let deviceManagerStarted = false;
let deviceManagerStopping = false;
const throttledDeviceLogs = new Map();

ensureDirectory(SCANS_DIR);
ensureDirectory(BIN_DIR);
ensureDirectory(STATE_DIR);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());
app.use(cors({
  origin: true,            // allow any origin (local agent is trusted)
  credentials: true,
}));

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---------------------------------------------------------------------------
// Helper: locate NAPS2
// ---------------------------------------------------------------------------

function findNaps2() {
  const configuredPath = resolveConfiguredNaps2Path(process.env.NAPS2_PATH);
  if (configuredPath) return configuredPath;

  const bundledPath = resolveBundledNaps2();
  if (bundledPath) return bundledPath;

  const localCandidates = [];
  for (const fileName of NAPS2_NAMES) {
    localCandidates.push(path.join(APP_ROOT, fileName));
    localCandidates.push(path.join(BIN_DIR, fileName));
    localCandidates.push(path.join(__dirname, fileName));
  }

  const candidates = [
    ...localCandidates,
    ...resolveExecutableFromPath(),
    'C:\\Program Files\\NAPS2\\NAPS2.Console.exe',
    'C:\\Program Files (x86)\\NAPS2\\NAPS2.Console.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'NAPS2', 'NAPS2.Console.exe'),
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper: run a shell command as a promise
// ---------------------------------------------------------------------------

function run(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = { timeout: SCAN_TIMEOUT, encoding: 'utf8', ...options };
    exec(cmd, opts, (error, stdout, stderr) => {
      if (error) return reject({ error, stdout, stderr });
      resolve({ stdout, stderr });
    });
  });
}

function createTimeoutError(operation, timeoutMs) {
  const error = new Error(`${operation} timed out after ${timeoutMs}ms`);
  error.code = 'DEVICE_DETECTION_TIMEOUT';
  return error;
}

async function withDetectionTimeout(operation, work) {
  let timeoutId;

  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(createTimeoutError(operation, DEVICE_DETECTION_TIMEOUT)), DEVICE_DETECTION_TIMEOUT);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function uniqueByName(devices) {
  const seen = new Set();
  const uniqueDevices = [];

  for (const device of devices) {
    const normalizedName = String(device.name || '').trim().toLowerCase();
    if (!normalizedName || seen.has(normalizedName)) {
      continue;
    }

    seen.add(normalizedName);
    uniqueDevices.push(device);
  }

  return uniqueDevices;
}

function createDeviceSignature(devices) {
  return devices.map((device) => device.id || String(device.name || '').trim().toLowerCase()).join('|');
}

function summarizeDeviceInventory() {
  return {
    scanners: deviceCache.scanners.items.length,
    printers: deviceCache.printers.items.length,
  };
}

function getCacheSnapshot(cacheKey) {
  const cacheEntry = deviceCache[cacheKey];
  return {
    items: Array.isArray(cacheEntry.items) ? [...cacheEntry.items] : [],
    lastUpdated: cacheEntry.lastUpdated || 0,
    lastError: cacheEntry.lastError,
  };
}

function getDeviceStatusSnapshot() {
  return {
    ready: deviceRefreshState.ready,
    lastUpdated: deviceRefreshState.lastUpdated,
    isRefreshing: deviceRefreshState.isRefreshing,
    lastError: deviceRefreshState.lastError,
    lastRefreshDuration: deviceRefreshState.lastRefreshDuration,
    deviceCount: deviceRefreshState.deviceCount,
    trayStatus: deviceRefreshState.trayStatus,
  };
}

function emitDeviceStatusChange() {
  deviceEvents.emit('status', getDeviceStatusSnapshot());
}

function onDeviceStatusChange(listener) {
  deviceEvents.on('status', listener);
  return () => deviceEvents.off('status', listener);
}

function isDeviceCacheStale() {
  if (!deviceRefreshState.lastUpdated) {
    return true;
  }

  return (Date.now() - deviceRefreshState.lastUpdated) >= DEVICE_CACHE_MAX_AGE;
}

function updateReadyState() {
  deviceRefreshState.ready = deviceCache.scanners.lastUpdated > 0 && deviceCache.printers.lastUpdated > 0;
}

function getLatestDeviceCacheUpdate() {
  return Math.max(deviceCache.scanners.lastUpdated || 0, deviceCache.printers.lastUpdated || 0);
}

function computeTrayStatus() {
  if (!deviceRefreshState.ready) {
    return 'Initializing devices...';
  }

  if (deviceRefreshState.deviceCount === 0) {
    return 'No devices found';
  }

  return 'Ready';
}

function syncDeviceStatusState() {
  updateReadyState();
  deviceRefreshState.lastUpdated = getLatestDeviceCacheUpdate();
  deviceRefreshState.deviceCount = deviceCache.scanners.items.length + deviceCache.printers.items.length;
  deviceRefreshState.trayStatus = computeTrayStatus();
  emitDeviceStatusChange();
}

function logDeviceMessage(level, message, throttleKey = null) {
  if (throttleKey) {
    const lastLoggedAt = throttledDeviceLogs.get(throttleKey) || 0;
    if ((Date.now() - lastLoggedAt) < DEVICE_ERROR_LOG_THROTTLE) {
      return;
    }

    throttledDeviceLogs.set(throttleKey, Date.now());
  }

  console[level](message);
}

function markRecentDeviceChange() {
  deviceRefreshState.recentChangeUntil = Date.now() + DEVICE_RECENT_CHANGE_WINDOW;
}

function getBaseRefreshReason(reason = 'scheduled') {
  return String(reason).replace(/^(adaptive:)+/, '') || 'scheduled';
}

function hasRecentDeviceChange() {
  return Date.now() < deviceRefreshState.recentChangeUntil;
}

function getNextRefreshDelay() {
  if (deviceRefreshState.consecutiveFailures >= DEVICE_FAILURE_BACKOFF_THRESHOLD) {
    return DEVICE_FAILURE_BACKOFF_INTERVAL;
  }

  if (hasRecentDeviceChange()) {
    return DEVICE_RECENT_CHANGE_INTERVAL;
  }

  if (deviceRefreshState.deviceCount === 0) {
    return DEVICE_EMPTY_REFRESH_INTERVAL;
  }

  return DEVICE_STABLE_REFRESH_INTERVAL;
}

function scheduleNextDeviceRefresh(reason = 'scheduled') {
  if (deviceManagerStopping) {
    return;
  }

  if (deviceRefreshTimer) {
    clearTimeout(deviceRefreshTimer);
  }

  const delay = getNextRefreshDelay();
  const baseReason = getBaseRefreshReason(reason);
  deviceRefreshState.nextRefreshAt = Date.now() + delay;
  deviceRefreshTimer = setTimeout(() => {
    deviceRefreshTimer = null;
    queueDeviceRefresh(`adaptive:${baseReason}`);
  }, delay);
}

function stopScheduledDeviceRefresh() {
  if (deviceRefreshTimer) {
    clearTimeout(deviceRefreshTimer);
    deviceRefreshTimer = null;
  }

  if (deviceWatcherRestartTimer) {
    clearTimeout(deviceWatcherRestartTimer);
    deviceWatcherRestartTimer = null;
  }

  deviceRefreshState.nextRefreshAt = 0;
}

function getStableDeviceOrder(cacheKey, devices) {
  const previousItems = deviceCache[cacheKey].items;
  const previousIndexes = new Map(previousItems.map((device, index) => [device.id, index]));

  return [...devices].sort((left, right) => {
    const leftIndex = previousIndexes.has(left.id) ? previousIndexes.get(left.id) : Number.MAX_SAFE_INTEGER;
    const rightIndex = previousIndexes.has(right.id) ? previousIndexes.get(right.id) : Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return String(left.name || '').localeCompare(String(right.name || ''));
  });
}

function buildDeviceCachePayload() {
  return {
    savedAt: Date.now(),
    ready: deviceRefreshState.ready,
    lastUpdated: deviceRefreshState.lastUpdated,
    lastRefreshDuration: deviceRefreshState.lastRefreshDuration,
    deviceCount: deviceRefreshState.deviceCount,
    scanners: {
      items: deviceCache.scanners.items,
      lastUpdated: deviceCache.scanners.lastUpdated,
    },
    printers: {
      items: deviceCache.printers.items,
      lastUpdated: deviceCache.printers.lastUpdated,
    },
  };
}

function persistDeviceCacheToDisk() {
  try {
    const tmpFilePath = `${DEVICE_CACHE_FILE}.tmp`;
    fs.writeFileSync(tmpFilePath, JSON.stringify(buildDeviceCachePayload(), null, 2), 'utf8');
    fs.renameSync(tmpFilePath, DEVICE_CACHE_FILE);
  } catch (error) {
    logDeviceMessage('warn', `[devices] Failed to persist device cache: ${formatDetectionError(error)}`, 'persist-device-cache');
  }
}

function normalizeLoadedCacheItems(cacheKey, items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const normalizedItems = items
    .filter((item) => item && item.name)
    .map((item) => ({
      ...item,
      id: item.id || `${cacheKey}:${String(item.name).trim().toLowerCase()}`,
    }));

  return getStableDeviceOrder(cacheKey, uniqueByName(normalizedItems));
}

function loadPersistedDeviceCache() {
  if (!fs.existsSync(DEVICE_CACHE_FILE)) {
    syncDeviceStatusState();
    return;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(DEVICE_CACHE_FILE, 'utf8'));

    for (const cacheKey of ['scanners', 'printers']) {
      const cachePayload = payload?.[cacheKey] || {};
      const items = normalizeLoadedCacheItems(cacheKey, cachePayload.items);
      deviceCache[cacheKey].items = items;
      deviceCache[cacheKey].signature = createDeviceSignature(items);
      deviceCache[cacheKey].lastUpdated = Number(cachePayload.lastUpdated) || 0;
      deviceCache[cacheKey].lastError = null;
    }

    deviceRefreshState.lastRefreshDuration = Number(payload?.lastRefreshDuration) || 0;
    deviceRefreshState.ready = Boolean(payload?.ready);
    syncDeviceStatusState();
    console.log(`[devices] Loaded persisted device cache from ${DEVICE_CACHE_FILE}`);
  } catch (error) {
    logDeviceMessage('warn', `[devices] Failed to load persisted device cache: ${formatDetectionError(error)}`, 'load-device-cache');
    syncDeviceStatusState();
  }
}

function buildDeviceChangeWatcherCommand() {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Register-WmiEvent -Class Win32_DeviceChangeEvent -SourceIdentifier 'ScannerAgentDeviceChange' | Out-Null",
    'try {',
    "  while ($true) {",
    "    $event = Wait-Event -SourceIdentifier 'ScannerAgentDeviceChange'",
    '    if ($event) {',
    '      Write-Output $event.SourceEventArgs.NewEvent.EventType',
    "      Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue",
    '    }',
    '  }',
    '} finally {',
    "  Unregister-Event -SourceIdentifier 'ScannerAgentDeviceChange' -ErrorAction SilentlyContinue",
    "  Get-EventSubscriber -SourceIdentifier 'ScannerAgentDeviceChange' | Unregister-Event -ErrorAction SilentlyContinue",
    '}',
  ].join('; ');
}

function stopDeviceChangeWatcher() {
  if (!deviceChangeWatcher) {
    deviceRefreshState.changeWatcherActive = false;
    return;
  }

  const watcher = deviceChangeWatcher;
  deviceChangeWatcher = null;
  deviceRefreshState.changeWatcherActive = false;
  deviceWatcherStdoutBuffer = '';
  deviceWatcherStderrBuffer = '';

  if (!watcher.killed) {
    watcher.kill();
  }
}

function scheduleDeviceWatcherRestart() {
  if (deviceManagerStopping || deviceWatcherRestartTimer || process.platform !== 'win32') {
    return;
  }

  deviceWatcherRestartTimer = setTimeout(() => {
    deviceWatcherRestartTimer = null;
    startDeviceChangeWatcher();
  }, DEVICE_CACHE_MAX_AGE);
}

function handleDeviceWatcherEvent(line) {
  if (!line) {
    return;
  }

  markRecentDeviceChange();
  console.log(`[devices] System device change detected (${line})`);
  queueDeviceRefresh('device-change', { force: true, recentChange: true });
}

function startDeviceChangeWatcher() {
  if (process.platform !== 'win32' || deviceChangeWatcher || deviceManagerStopping) {
    return;
  }

  try {
    deviceChangeWatcher = spawn('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      buildDeviceChangeWatcherCommand(),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    deviceRefreshState.changeWatcherActive = true;

    deviceChangeWatcher.stdout.setEncoding('utf8');
    deviceChangeWatcher.stdout.on('data', (chunk) => {
      deviceWatcherStdoutBuffer += chunk;
      const lines = deviceWatcherStdoutBuffer.split(/\r?\n/);
      deviceWatcherStdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        handleDeviceWatcherEvent(line.trim());
      }
    });

    deviceChangeWatcher.stderr.setEncoding('utf8');
    deviceChangeWatcher.stderr.on('data', (chunk) => {
      deviceWatcherStderrBuffer += chunk;
      const lines = deviceWatcherStderrBuffer.split(/\r?\n/);
      deviceWatcherStderrBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          logDeviceMessage('warn', `[devices] Device watcher warning: ${line.trim()}`, 'device-watcher-stderr');
        }
      }
    });

    deviceChangeWatcher.once('error', (error) => {
      deviceRefreshState.changeWatcherActive = false;
      logDeviceMessage('warn', `[devices] Device watcher unavailable, using adaptive refresh only: ${formatDetectionError(error)}`, 'device-watcher-error');
      scheduleDeviceWatcherRestart();
    });

    deviceChangeWatcher.once('exit', (code, signal) => {
      deviceChangeWatcher = null;
      deviceRefreshState.changeWatcherActive = false;

      if (!deviceManagerStopping) {
        logDeviceMessage('warn', `[devices] Device watcher exited (code=${code ?? 'null'}, signal=${signal ?? 'null'}); continuing with adaptive refresh`, 'device-watcher-exit');
        scheduleDeviceWatcherRestart();
      }
    });
  } catch (error) {
    deviceRefreshState.changeWatcherActive = false;
    logDeviceMessage('warn', `[devices] Failed to start device watcher: ${formatDetectionError(error)}`, 'device-watcher-start');
  }
}

function formatDetectionError(error) {
  return error?.stderr || error?.error?.message || error?.message || String(error);
}

function parseDeviceLines(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function detectNaps2Devices(naps2, driver) {
  const result = await run(`"${naps2}" --listdevices --driver ${driver}`, {
    timeout: DEVICE_DETECTION_TIMEOUT,
  });

  return parseDeviceLines(result.stdout).map((name) => ({
    id: `${driver}:${name.toLowerCase()}`,
    name,
    type: 'scanner',
    driver,
    connection: 'usb',
  }));
}

async function detectScanners() {
  const naps2 = findNaps2();
  if (!naps2) {
    throw new Error('NAPS2 not found');
  }

  const results = await Promise.allSettled([
    detectNaps2Devices(naps2, 'wia'),
    detectNaps2Devices(naps2, 'twain'),
  ]);

  const scanners = [];
  const detectionErrors = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      scanners.push(...result.value);
    } else {
      const errorMessage = formatDetectionError(result.reason);
      detectionErrors.push(errorMessage);
      console.warn('[devices] Scanner driver detection failed:', errorMessage);
    }
  }

  if (scanners.length === 0 && detectionErrors.length > 0) {
    throw new Error(detectionErrors.join(' | '));
  }

  return uniqueByName(scanners);
}

function findCachedScanner(identifier) {
  const normalizedIdentifier = String(identifier || '').trim().toLowerCase();

  if (!normalizedIdentifier) {
    return deviceCache.scanners.items.length === 1 ? deviceCache.scanners.items[0] : null;
  }

  return deviceCache.scanners.items.find((scanner) => {
    const normalizedId = String(scanner.id || '').trim().toLowerCase();
    const normalizedName = String(scanner.name || '').trim().toLowerCase();
    return normalizedId === normalizedIdentifier || normalizedName === normalizedIdentifier;
  }) || null;
}

function resolveScannerSelection(scannerIdentifier, requestedDriver) {
  const cachedScanner = findCachedScanner(scannerIdentifier);

  return {
    scannerName: cachedScanner?.name || scannerIdentifier || undefined,
    driver: requestedDriver || cachedScanner?.driver || 'wia',
  };
}

function buildPrinterEnumerationCommand() {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$printers = Get-CimInstance Win32_Printer | Select-Object Name, DriverName, PortName, Local, Network, WorkOffline, PrinterStatus, Default',
    '$printers | ConvertTo-Json -Compress',
  ].join('; ');

  return `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`;
}

function normalizePrinterStatus(status) {
  if (status === null || status === undefined || status === '') {
    return 'unknown';
  }

  if (typeof status === 'number') {
    const numericStatuses = {
      1: 'other',
      2: 'unknown',
      3: 'idle',
      4: 'printing',
      5: 'warmup',
      6: 'stopped',
      7: 'offline',
      8: 'paused',
      9: 'error',
    };

    return numericStatuses[status] || String(status);
  }

  const normalized = String(status).trim().toLowerCase();
  if (normalized === 'ok') return 'ok';
  if (normalized === 'normal') return 'ok';
  if (normalized === 'idle') return 'idle';
  return normalized;
}

function hasAllowedPrinterStatus(printer) {
  const status = normalizePrinterStatus(printer.PrinterStatus);
  return !printer.WorkOffline && (status === 'ok' || status === 'idle');
}

function resolvePrinterConnection(printer) {
  const normalizedPortName = String(printer.PortName || '').trim().toLowerCase();
  const normalizedName = String(printer.Name || '').trim().toLowerCase();

  if (printer.Network) {
    return 'network';
  }

  if (normalizedPortName.startsWith('ip_') || normalizedPortName.startsWith('wsd') || normalizedPortName.startsWith('http')) {
    return 'network';
  }

  if (normalizedPortName.includes(':') && !normalizedPortName.startsWith('usb') && !normalizedPortName.startsWith('lpt') && !normalizedPortName.startsWith('com')) {
    return 'network';
  }

  if (normalizedName.includes('(network)')) {
    return 'network';
  }

  return 'local';
}

function isInstalledPhysicalPrinter(printer) {
  const deviceName = `${printer.Name || ''} ${printer.DriverName || ''}`;
  const isInstalledPrinter = Boolean(printer.Local || printer.Network);
  return isInstalledPrinter && !VIRTUAL_PRINTER_PATTERN.test(deviceName);
}

function normalizePrinter(printer) {
  const normalizedStatus = normalizePrinterStatus(printer.PrinterStatus);
  const connection = resolvePrinterConnection(printer);
  return {
    id: `printer:${String(printer.Name || '').trim().toLowerCase()}`,
    name: printer.Name,
    type: 'printer',
    driverName: printer.DriverName || null,
    portName: printer.PortName || null,
    isDefault: Boolean(printer.Default),
    status: normalizedStatus,
    connection,
  };
}

async function detectPrinters() {
  return withDetectionTimeout('printer detection', async () => {
    const result = await run(buildPrinterEnumerationCommand(), {
      timeout: DEVICE_DETECTION_TIMEOUT,
      maxBuffer: 1024 * 1024,
    });

    const rawOutput = result.stdout.trim();
    if (!rawOutput) {
      return [];
    }

    const parsed = JSON.parse(rawOutput);
    const printers = Array.isArray(parsed) ? parsed : [parsed];

    return uniqueByName(
      printers
        .filter((printer) => printer && isInstalledPhysicalPrinter(printer) && hasAllowedPrinterStatus(printer))
        .map(normalizePrinter)
    );
  });
}

async function refreshSingleDeviceCache(cacheKey, detectionFn) {
  const cacheEntry = deviceCache[cacheKey];
  const startedAt = Date.now();

  try {
    const items = getStableDeviceOrder(cacheKey, await detectionFn());
    const signature = createDeviceSignature(items);
    const changed = signature !== cacheEntry.signature;

    cacheEntry.items = items;
    cacheEntry.signature = signature;
    cacheEntry.lastUpdated = Date.now();
    cacheEntry.lastError = null;

    if (changed) {
      markRecentDeviceChange();
    }

    return {
      cacheKey,
      ok: true,
      changed,
      itemCount: cacheEntry.items.length,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    cacheEntry.lastError = formatDetectionError(error);
    return {
      cacheKey,
      ok: false,
      changed: false,
      itemCount: cacheEntry.items.length,
      durationMs: Date.now() - startedAt,
      error: cacheEntry.lastError,
    };
  }
}

async function refreshAllDevices(reason = 'scheduled', { force = false } = {}) {
  if (!force && !isDeviceCacheStale()) {
    return {
      skipped: true,
      reason,
      ...getDeviceStatusSnapshot(),
    };
  }

  if (deviceRefreshState.refreshPromise) {
    return deviceRefreshState.refreshPromise;
  }

  deviceRefreshState.isRefreshing = true;
  const startedAt = Date.now();
  emitDeviceStatusChange();

  deviceRefreshState.refreshPromise = (async () => {
    try {
      const [scannerResult, printerResult] = await Promise.all([
        refreshSingleDeviceCache('scanners', detectScanners),
        refreshSingleDeviceCache('printers', detectPrinters),
      ]);

      const successfulRefresh = scannerResult.ok && printerResult.ok;
      const latestCacheUpdate = getLatestDeviceCacheUpdate();

      if (latestCacheUpdate > 0) {
        deviceRefreshState.lastUpdated = latestCacheUpdate;
      }

      if (successfulRefresh) {
        deviceRefreshState.consecutiveFailures = 0;
        deviceRefreshState.lastError = null;
      } else {
        deviceRefreshState.consecutiveFailures += 1;
        const errors = [scannerResult, printerResult]
          .filter((result) => !result.ok)
          .map((result) => `${result.cacheKey}: ${result.error}`);
        deviceRefreshState.lastError = errors.join(' | ');
      }

      deviceRefreshState.lastRefreshDuration = Date.now() - startedAt;
      syncDeviceStatusState();

      if ((scannerResult.ok || printerResult.ok) && (scannerResult.changed || printerResult.changed || !fs.existsSync(DEVICE_CACHE_FILE))) {
        persistDeviceCacheToDisk();
      }

      const inventory = summarizeDeviceInventory();
      console.log(`[devices] Refresh ${reason} completed in ${deviceRefreshState.lastRefreshDuration}ms (scanners=${inventory.scanners}, printers=${inventory.printers})`);

      if (deviceRefreshState.lastError) {
        logDeviceMessage('error', `[devices] Refresh ${reason} reported errors: ${deviceRefreshState.lastError}`, `refresh-error:${deviceRefreshState.lastError}`);
      }

      return {
        ...getDeviceStatusSnapshot(),
        skipped: false,
        results: {
          scanners: scannerResult,
          printers: printerResult,
        },
      };
    } finally {
      deviceRefreshState.isRefreshing = false;
      deviceRefreshState.refreshPromise = null;
      syncDeviceStatusState();
      scheduleNextDeviceRefresh(reason);
    }
  })();

  return deviceRefreshState.refreshPromise;
}

function queueDeviceRefresh(reason = 'scheduled', options = {}) {
  const { force = false, recentChange = false } = options;
  const shouldRefresh = force || isDeviceCacheStale();

  if (recentChange) {
    markRecentDeviceChange();
  }

  if (!shouldRefresh && !deviceRefreshState.refreshPromise) {
    scheduleNextDeviceRefresh(reason);
    return false;
  }

  setImmediate(() => {
    refreshAllDevices(reason, { force }).catch((error) => {
      logDeviceMessage('error', `[devices] Background refresh failed: ${formatDetectionError(error)}`, 'background-refresh-failed');
    });
  });

  return true;
}

function startDeviceManager() {
  if (deviceManagerStarted) {
    return;
  }

  deviceManagerStarted = true;
  deviceManagerStopping = false;
  loadPersistedDeviceCache();
  startDeviceChangeWatcher();
  queueDeviceRefresh('startup', { force: true });
  scheduleNextDeviceRefresh('startup');
}

async function stopDeviceManager() {
  deviceManagerStopping = true;
  stopScheduledDeviceRefresh();
  stopDeviceChangeWatcher();

  if (deviceRefreshState.refreshPromise) {
    await Promise.race([
      deviceRefreshState.refreshPromise.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, DEVICE_DETECTION_TIMEOUT + 500)),
    ]);
  }

  deviceManagerStarted = false;
}

// ---------------------------------------------------------------------------
// Helper: clean up a temp file (best-effort)
// ---------------------------------------------------------------------------

function cleanup(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn(`[cleanup] Failed to delete ${filePath}:`, err.message);
  }
}

function loadEnvironment() {
  const envCandidates = [
    path.join(getAppRoot(), '.env'),
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '.env'),
  ];

  for (const envPath of [...new Set(envCandidates)]) {
    if (!envPath || !fs.existsSync(envPath)) continue;

    dotenv.config({ path: envPath, override: false });
    console.log(`[config] Loaded environment from ${envPath}`);
    return;
  }

  dotenv.config();
}

function getStateDirectory() {
  return process.env.SCANNER_AGENT_STATE_DIR || path.join(getAppRoot(), 'state');
}

function getAppRoot() {
  return process.env.SCANNER_AGENT_ROOT || (process.pkg ? path.dirname(process.execPath) : __dirname);
}

function toInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveConfiguredNaps2Path(configuredPath) {
  if (!configuredPath) return null;

  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(APP_ROOT, configuredPath);

  return fs.existsSync(absolutePath) ? absolutePath : null;
}

function resolveExecutableFromPath() {
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const matches = [];

  for (const entry of pathEntries) {
    for (const fileName of NAPS2_NAMES) {
      matches.push(path.join(entry, fileName));
    }
  }

  return matches;
}

function resolveBundledNaps2() {
  for (const fileName of NAPS2_NAMES) {
    const assetPath = path.join(__dirname, fileName);
    if (!fs.existsSync(assetPath)) continue;

    if (!process.pkg) {
      return assetPath;
    }

    const extractedPath = path.join(BIN_DIR, fileName);

    try {
      if (!fs.existsSync(extractedPath)) {
        fs.copyFileSync(assetPath, extractedPath);
      }

      return extractedPath;
    } catch (err) {
      console.error(`[config] Failed to extract bundled NAPS2 executable: ${err.message}`);
    }
  }

  return null;
}

function requireAuthorization(req, res) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Missing token' });
    return null;
  }

  return authHeader;
}

function getFolderId(payload) {
  return payload.folder_id ?? payload.folderId;
}

function uploadDocumentToBackend({ authHeader, filePath, title, folderId, departmentId, description }) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const form = new FormData();

  form.append('file', fs.createReadStream(filePath), {
    filename: `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${ext}`,
    contentType: ext === 'pdf' ? 'application/pdf' : `image/${ext}`,
  });
  form.append('title', title);
  form.append('folder_id', String(folderId));
  form.append('needs_approval', 'false');
  form.append('scanned_from', 'local_scanner_agent');
  if (departmentId) form.append('department_id', String(departmentId));
  if (description) form.append('description', description);

  // The agent never stores the JWT. It forwards the incoming Authorization
  // header unchanged to the cloud backend for this single request.
  return axios.post(`${BACKEND_URL}/api/documents/`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: authHeader,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 120000,
  });
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  const naps2 = findNaps2();
  res.json({
    status: 'ok',
    packaged: IS_PACKAGED_RUNTIME,
    naps2Installed: !!naps2,
    naps2Path: naps2 || 'NOT FOUND',
    backendUrl: BACKEND_URL,
    scansDir: SCANS_DIR,
    appRoot: APP_ROOT,
    deviceStatus: getDeviceStatusSnapshot(),
  });
});

// ---------------------------------------------------------------------------
// GET /scanners — return cached scanner devices
// ---------------------------------------------------------------------------

app.get('/scanners', (_req, res) => {
  if (!deviceCache.scanners.lastUpdated && !deviceRefreshState.isRefreshing) {
    queueDeviceRefresh('first-scanners-request');
  }

  const cacheSnapshot = getCacheSnapshot('scanners');

  res.json({
    scanners: cacheSnapshot.items,
    lastUpdated: cacheSnapshot.lastUpdated,
  });
});

// ---------------------------------------------------------------------------
// GET /printers — return cached local printer devices
// ---------------------------------------------------------------------------

app.get('/printers', (_req, res) => {
  if (!deviceCache.printers.lastUpdated && !deviceRefreshState.isRefreshing) {
    queueDeviceRefresh('first-printers-request');
  }

  const cacheSnapshot = getCacheSnapshot('printers');

  res.json({
    printers: cacheSnapshot.items,
    lastUpdated: cacheSnapshot.lastUpdated,
  });
});

// ---------------------------------------------------------------------------
// GET /device-status — expose device cache readiness and refresh state
// ---------------------------------------------------------------------------

app.get('/device-status', (_req, res) => {
  if (!deviceRefreshState.lastUpdated && !deviceRefreshState.isRefreshing) {
    queueDeviceRefresh('status-request');
  }

  res.json(getDeviceStatusSnapshot());
});

// ---------------------------------------------------------------------------
// POST /refresh-scanners — queue a background device refresh
// ---------------------------------------------------------------------------

app.post('/refresh-scanners', (_req, res) => {
  queueDeviceRefresh('manual', { force: true });

  res.status(202).json({
    success: true,
    message: 'Device refresh queued',
    scanners: getCacheSnapshot('scanners').items,
    printers: getCacheSnapshot('printers').items,
    lastUpdated: getDeviceStatusSnapshot().lastUpdated,
    ready: getDeviceStatusSnapshot().ready,
  });
});

// ---------------------------------------------------------------------------
// POST /scan — execute a scan and upload to the cloud backend
//
// Body:
//   Authorization header: Bearer <jwt> (REQUIRED)
//   title       (string, REQUIRED) — document title
//   folder_id   (string | number, REQUIRED) — target folder ID
//   scannerName | scanner (string, optional) — specific scanner device name
//   driver      (string, optional) — "wia" | "escl" (default: "wia")
//   format      (string, optional) — "pdf" | "png" | "jpg" (default: "pdf")
//   dpi         (number, optional) — 150 | 200 | 300 | 600 (default: 300)
//   colorMode | color (string, optional) — "color" | "gray" | "bw" (default: "color")
//   paperSize   (string, optional) — "letter" | "a4" | "legal" (default: "letter")
//   scanSource  (string, optional) — "auto" | "glass" | "feeder"
//   multiPage   (boolean, optional) — enable multi-page (forces PDF)
// ---------------------------------------------------------------------------

app.post('/scan', async (req, res) => {
  const authHeader = requireAuthorization(req, res);
  if (!authHeader) {
    return;
  }

  const naps2 = findNaps2();
  if (!naps2) {
    return res.status(500).json({
      error: 'NAPS2 not found',
      message: 'Install NAPS2 from https://www.naps2.com/ or set NAPS2_PATH in .env',
    });
  }

  const {
    title,
    folder_id,
    folderId,
    scannerName,
    scanner,
    driver = 'wia',
    format = 'pdf',
    dpi = 300,
    colorMode,
    color = 'color',
    paperSize = 'letter',
    scanSource,
    multiPage = false,
    departmentId,
    description,
  } = req.body;

  const resolvedFolderId = getFolderId({ folder_id, folderId });
  const requestedScanner = scannerName || scanner;
  const resolvedScannerSelection = resolveScannerSelection(requestedScanner, driver);
  const resolvedScannerName = resolvedScannerSelection.scannerName;
  const resolvedDriver = resolvedScannerSelection.driver;
  const resolvedColorMode = colorMode || color;

  // Validation
  if (!title) return res.status(400).json({ error: 'Missing required field: title' });
  if (!resolvedFolderId) return res.status(400).json({ error: 'Missing required field: folder_id' });

  // Map color mode to NAPS2 bitdepth
  const bitdepthMap = { color: 'color', gray: 'gray', bw: 'bw' };
  const bitdepth = bitdepthMap[resolvedColorMode] || 'color';

  // Map paper size to NAPS2 pagesize
  const pagesizeMap = { letter: 'letter', a4: 'a4', legal: 'legal' };
  const pagesize = pagesizeMap[paperSize] || 'letter';

  // Determine output format — multiPage always forces PDF
  const effectiveFormat = multiPage ? 'pdf' : format;
  const ext = effectiveFormat === 'png' ? 'png' : effectiveFormat === 'jpg' ? 'jpg' : 'pdf';

  // Generate temp output path
  const sessionId = uuidv4();
  const outputFile = path.join(SCANS_DIR, `scan_${sessionId}.${ext}`);

  // Build NAPS2 command
  let cmd = `"${naps2}" -o "${outputFile}"`;
  cmd += ` --driver ${resolvedDriver}`;

  if (resolvedScannerName) {
    cmd += ` --device "${resolvedScannerName}"`;
  }

  cmd += ` --dpi ${dpi}`;
  cmd += ` --bitdepth ${bitdepth}`;
  cmd += ` --pagesize ${pagesize}`;

  if (scanSource === 'feeder') {
    cmd += ' --source feeder';
  } else if (scanSource === 'glass') {
    cmd += ' --source glass';
  }

  if (ext === 'pdf') {
    cmd += ' --pdfcompat PDF_A_2B';
  }

  cmd += ' --force';

  console.log(`[scan] Session ${sessionId}`);
  console.log(`[scan] Command: ${cmd}`);

  try {
    // Execute the scan
    const startTime = Date.now();
    await run(cmd);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[scan] NAPS2 finished in ${elapsed}s`);

    // Verify the output file was created
    if (!fs.existsSync(outputFile)) {
      return res.status(500).json({
        error: 'Scan completed but output file not found',
        details: 'The scan command completed without producing a file. Verify the selected scanner driver and that paper is loaded if using the feeder.',
        sessionId,
      });
    }

    const stats = fs.statSync(outputFile);
    console.log(`[scan] Output: ${outputFile} (${(stats.size / 1024).toFixed(1)} KB)`);

    // Upload to cloud backend
    console.log(`[scan] Uploading to ${BACKEND_URL}/api/documents/ ...`);

    const uploadRes = await uploadDocumentToBackend({
      authHeader,
      filePath: outputFile,
      title,
      folderId: resolvedFolderId,
      departmentId,
      description,
    });

    console.log(`[scan] Upload successful — document ID: ${uploadRes.data?.document?.id || 'unknown'}`);

    // Cleanup temp file
    cleanup(outputFile);

    res.json({
      success: true,
      sessionId,
      message: 'Scan completed and uploaded successfully',
      document: uploadRes.data?.document || uploadRes.data,
    });

  } catch (err) {
    console.error('[scan] Error:', err.error?.message || err.message || err);

    // Cleanup on failure too
    cleanup(outputFile);

    // Distinguish between scan errors and upload errors
    if (err.stdout !== undefined) {
      // NAPS2 execution error
      return res.status(500).json({
        error: 'Scan failed',
        details: err.stderr || err.error?.message,
        sessionId,
      });
    }

    if (err.response) {
      // Forward backend auth and validation failures so the frontend can handle re-login.
      return res.status(err.response.status).json({
        error: 'Upload to cloud backend failed',
        status: err.response.status,
        details: err.response.data,
        sessionId,
      });
    }

    // Network or other error
    res.status(500).json({
      error: 'Scan or upload failed',
      details: err.message,
      sessionId,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /scan-local — scan only, return file path (no upload)
//   Useful for preview before uploading
// ---------------------------------------------------------------------------

app.post('/scan-local', async (req, res) => {
  const naps2 = findNaps2();
  if (!naps2) {
    return res.status(500).json({ error: 'NAPS2 not found' });
  }

  const {
    scannerName,
    scanner,
    driver = 'wia',
    format = 'pdf',
    dpi = 300,
    colorMode,
    color = 'color',
    paperSize = 'letter',
    scanSource,
  } = req.body;

  const requestedScanner = scannerName || scanner;
  const resolvedScannerSelection = resolveScannerSelection(requestedScanner, driver);
  const resolvedScannerName = resolvedScannerSelection.scannerName;
  const resolvedDriver = resolvedScannerSelection.driver;
  const resolvedColorMode = colorMode || color;

  const ext = format === 'png' ? 'png' : format === 'jpg' ? 'jpg' : 'pdf';
  const sessionId = uuidv4();
  const outputFile = path.join(SCANS_DIR, `scan_${sessionId}.${ext}`);

  const bitdepthMap = { color: 'color', gray: 'gray', bw: 'bw' };
  const bitdepth = bitdepthMap[resolvedColorMode] || 'color';
  const pagesizeMap = { letter: 'letter', a4: 'a4', legal: 'legal' };
  const pagesize = pagesizeMap[paperSize] || 'letter';

  let cmd = `"${naps2}" -o "${outputFile}" --driver ${resolvedDriver}`;
  if (resolvedScannerName) cmd += ` --device "${resolvedScannerName}"`;
  cmd += ` --dpi ${dpi} --bitdepth ${bitdepth} --pagesize ${pagesize}`;
  if (scanSource === 'feeder') cmd += ' --source feeder';
  else if (scanSource === 'glass') cmd += ' --source glass';
  if (ext === 'pdf') cmd += ' --pdfcompat PDF_A_2B';
  cmd += ' --force';

  console.log(`[scan-local] Session ${sessionId} — ${cmd}`);

  try {
    await run(cmd);

    if (!fs.existsSync(outputFile)) {
      return res.status(500).json({
        error: 'Output file not created',
        details: 'The scan command completed without producing a file. Verify the selected scanner driver and that paper is loaded if using the feeder.',
        sessionId,
      });
    }

    const stats = fs.statSync(outputFile);
    res.json({
      success: true,
      sessionId,
      filePath: outputFile,
      fileName: path.basename(outputFile),
      size: stats.size,
      format: ext,
    });
  } catch (err) {
    cleanup(outputFile);
    res.status(500).json({
      error: 'Scan failed',
      details: err.stderr || err.error?.message,
      sessionId,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /upload — upload a previously scanned local file to the cloud
// ---------------------------------------------------------------------------

app.post('/upload', async (req, res) => {
  const authHeader = requireAuthorization(req, res);
  if (!authHeader) {
    return;
  }

  const { title, folderId, folder_id, sessionId, departmentId, description } = req.body;
  const resolvedFolderId = getFolderId({ folder_id, folderId });

  if (!title) return res.status(400).json({ error: 'Missing required field: title' });
  if (!resolvedFolderId) return res.status(400).json({ error: 'Missing required field: folder_id' });
  if (!sessionId) return res.status(400).json({ error: 'Missing required field: sessionId' });

  // Find the file by sessionId
  const files = fs.readdirSync(SCANS_DIR).filter(f => f.includes(sessionId));
  if (files.length === 0) {
    return res.status(404).json({ error: 'Scan file not found for this sessionId' });
  }

  const filePath = path.join(SCANS_DIR, files[0]);
  try {
    const uploadRes = await uploadDocumentToBackend({
      authHeader,
      filePath,
      title,
      folderId: resolvedFolderId,
      departmentId,
      description,
    });

    cleanup(filePath);

    res.json({
      success: true,
      message: 'Uploaded successfully',
      document: uploadRes.data?.document || uploadRes.data,
    });
  } catch (err) {
    console.error('[upload] Error:', err.message);
    if (err.response) {
      return res.status(err.response.status).json({
        error: 'Upload failed',
        status: err.response.status,
        details: err.response.data,
      });
    }
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /scan/:sessionId/preview — serve a local scan file for preview
// ---------------------------------------------------------------------------

app.get('/scan/:sessionId/preview', (req, res) => {
  const { sessionId } = req.params;
  const files = fs.readdirSync(SCANS_DIR).filter(f => f.includes(sessionId));

  if (files.length === 0) {
    return res.status(404).json({ error: 'Scan file not found' });
  }

  const filePath = path.join(SCANS_DIR, files[0]);
  const ext = path.extname(files[0]).slice(1);

  const mimeMap = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg' };
  res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
  res.sendFile(filePath);
});

// ---------------------------------------------------------------------------
// DELETE /scan/:sessionId — discard a local scan
// ---------------------------------------------------------------------------

app.delete('/scan/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const files = fs.readdirSync(SCANS_DIR).filter(f => f.includes(sessionId));

  if (files.length === 0) {
    return res.status(404).json({ error: 'Scan file not found' });
  }

  for (const f of files) {
    cleanup(path.join(SCANS_DIR, f));
  }

  res.json({ success: true, message: 'Scan discarded' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

function logStartupBanner() {
  const naps2 = findNaps2();
  console.log('');
  console.log('==============================================');
  console.log('  Maptech DMS — Local Scanner Agent');
  console.log('==============================================');
  console.log(`Scanner Agent running at http://localhost:${PORT}`);
  console.log(`  Server:   http://localhost:${PORT}`);
  console.log(`  Backend:  ${BACKEND_URL}`);
  console.log(`  NAPS2:    ${naps2 || 'NOT FOUND'}`);
  console.log(`  Scans:    ${SCANS_DIR}`);
  console.log(`  Mode:     ${IS_PACKAGED_RUNTIME ? 'packaged' : 'node'}`);
  console.log('==============================================');
  console.log('');

  if (!naps2) {
    console.warn('WARNING: NAPS2 not found! Scanning will not work.');
    console.warn('Install from https://www.naps2.com/ or set NAPS2_PATH in .env');
  }
}

function startServer(port = PORT) {
  if (httpServer) {
    return Promise.resolve(httpServer);
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port);

    server.once('error', (error) => {
      console.error('[server] Failed to start scanner agent:', error);
      reject(error);
    });

    server.once('listening', () => {
      httpServer = server;
      startDeviceManager();
      logStartupBanner();
      resolve(server);
    });
  });
}

function stopServer() {
  if (!httpServer) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        return reject(error);
      }

      stopDeviceManager()
        .catch((stopError) => {
          console.error('[server] Failed to stop device manager cleanly:', stopError);
        })
        .finally(() => {
          httpServer = null;
          resolve();
        });
    });
  });
}

if (require.main === module) {
  startServer().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  startServer,
  stopServer,
  getDeviceStatus: getDeviceStatusSnapshot,
  onDeviceStatusChange,
};
