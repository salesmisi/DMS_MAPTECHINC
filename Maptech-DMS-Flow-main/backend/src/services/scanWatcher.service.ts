import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';

// Store pending scan sessions waiting for files
interface PendingScan {
  sessionId: string;
  title: string;
  format: string;
  folderId: string;
  userId: string;
  userName: string;
  department: string;
  departmentId?: string;
  createdAt: Date;
}

const pendingScans: Map<string, PendingScan> = new Map();
let watcher: chokidar.FSWatcher | null = null;

// Get the scans directory path
const SCANS_DIR = process.env.SCANS_DIR || path.join(process.cwd(), 'scans');

// Ensure scans directory exists
export function ensureScansDir(): void {
  if (!fs.existsSync(SCANS_DIR)) {
    fs.mkdirSync(SCANS_DIR, { recursive: true });
    console.log(`Created scans directory: ${SCANS_DIR}`);
  }
}

// Add a pending scan session
export function addPendingScan(scan: PendingScan): void {
  pendingScans.set(scan.sessionId, scan);
  console.log(`Added pending scan session: ${scan.sessionId} for "${scan.title}"`);
}

// Get pending scan by session ID
export function getPendingScan(sessionId: string): PendingScan | undefined {
  return pendingScans.get(sessionId);
}

// Remove pending scan
export function removePendingScan(sessionId: string): boolean {
  return pendingScans.delete(sessionId);
}

// Get the oldest pending scan (FIFO)
export function getOldestPendingScan(): PendingScan | undefined {
  let oldest: PendingScan | undefined;
  let oldestTime = Infinity;

  for (const scan of pendingScans.values()) {
    const time = scan.createdAt.getTime();
    if (time < oldestTime) {
      oldestTime = time;
      oldest = scan;
    }
  }

  return oldest;
}

// Process a new scanned file
async function processScannedFile(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase().slice(1);

  console.log(`New scan detected: ${fileName}`);

  // Get the oldest pending scan session
  const pendingScan = getOldestPendingScan();

  if (!pendingScan) {
    console.log(`No pending scan session for file: ${fileName}. Skipping.`);
    return;
  }

  try {
    // Read file content
    const fileBuffer = fs.readFileSync(filePath);
    const fileSize = fs.statSync(filePath).size;
    const fileSizeStr = `${(fileSize / 1024 / 1024).toFixed(1)} MB`;

    // Generate new filename based on document title
    const sanitizedTitle = pendingScan.title.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const newFileName = `${sanitizedTitle}_${timestamp}.${ext}`;
    const newFilePath = path.join(process.cwd(), 'uploads', newFileName);

    // Copy file to uploads directory
    fs.copyFileSync(filePath, newFilePath);

    // Generate unique reference number with retry logic
    const year = new Date().getFullYear();
    const deptCode = (pendingScan.department || 'GEN').slice(0, 3).toUpperCase();

    let reference = '';
    let lastNumber = 1;
    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries) {
      try {
        if (pendingScan.departmentId) {
          const upsertRes = await pool.query(`
            INSERT INTO document_counters (department_id, year, last_number) VALUES ($1, $2, 1)
            ON CONFLICT (department_id, year) DO UPDATE SET last_number = document_counters.last_number + 1
            RETURNING last_number
          `, [pendingScan.departmentId, year]);
          lastNumber = upsertRes.rows[0].last_number;
        } else {
          // No department ID - get max reference number from documents table
          const maxRes = await pool.query(`
            SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_num
            FROM documents
            WHERE reference LIKE $1
          `, [`${deptCode}_${year}_%`]);
          lastNumber = maxRes.rows[0]?.next_num || 1;
        }

        // Add random suffix if retrying to ensure uniqueness
        if (retries > 0) {
          const randomSuffix = Math.floor(Math.random() * 100);
          reference = `${deptCode}_${year}_${String(lastNumber).padStart(3, '0')}_${randomSuffix}`;
        } else {
          reference = `${deptCode}_${year}_${String(lastNumber).padStart(3, '0')}`;
        }

        // Check if reference already exists
        const existsCheck = await pool.query('SELECT 1 FROM documents WHERE reference = $1', [reference]);
        if (existsCheck.rows.length === 0) {
          break; // Reference is unique
        }
        retries++;
      } catch (err) {
        retries++;
        console.warn(`Reference generation retry ${retries}:`, err);
      }
    }

    // Final fallback - use timestamp-based reference
    if (!reference || retries >= maxRetries) {
      reference = `${deptCode}_${year}_${timestamp}`;
    }

    // Insert document into database
    const docId = uuidv4();
    const insertRes = await pool.query(`
      INSERT INTO documents (
        id, title, reference, date, uploaded_by, uploaded_by_id,
        status, version, file_type, size, folder_id, needs_approval,
        department, file_path, file_data, scanned_from, description, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW()
      ) RETURNING *
    `, [
      docId,
      pendingScan.title,
      reference,
      new Date().toISOString().split('T')[0],
      pendingScan.userName,
      pendingScan.userId,
      'approved', // Auto-approve scanned documents
      1,
      ext || pendingScan.format,
      fileSizeStr,
      pendingScan.folderId || null,
      false, // No approval needed for scanned documents
      pendingScan.department,
      `uploads/${newFileName}`,
      fileBuffer,
      'NAPS2 Scanner',
      `Scanned via NAPS2`
    ]);

    const document = insertRes.rows[0];

    // Log the scan activity
    await pool.query(`
      INSERT INTO activity_logs (
        user_id, user_name, user_role, action, target, target_type, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      pendingScan.userId,
      pendingScan.userName,
      'staff',
      'DOCUMENT_SCANNED',
      pendingScan.title,
      'document',
      `Scanned document "${pendingScan.title}" via NAPS2. Reference: ${reference}`
    ]);

    // Update scan session status
    await pool.query(`
      UPDATE scan_sessions
      SET status = 'completed', document_id = $1, completed_at = NOW()
      WHERE id = $2
    `, [docId, pendingScan.sessionId]);

    // Remove from pending scans
    removePendingScan(pendingScan.sessionId);

    // Optionally delete original file from scans folder
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.log(`Could not delete original scan file: ${filePath}`);
    }

    console.log(`Processed scanned document: ${pendingScan.title} (${reference})`);

    // Emit event for real-time notification (can be picked up by WebSocket)
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).lastScannedDocument = {
        id: docId,
        title: pendingScan.title,
        reference,
        fileName: newFileName,
        fileType: ext,
        size: fileSizeStr,
        sessionId: pendingScan.sessionId,
        timestamp: new Date().toISOString()
      };
    }

  } catch (err: any) {
    console.error(`Error processing scanned file: ${err.message}`);

    // Update scan session with error
    await pool.query(`
      UPDATE scan_sessions
      SET status = 'failed', error_message = $1
      WHERE id = $2
    `, [err.message, pendingScan.sessionId]);
  }
}

// Start the file watcher
export function startScanWatcher(): void {
  ensureScansDir();

  if (watcher) {
    console.log('Scan watcher already running');
    return;
  }

  console.log(`Starting scan watcher on: ${SCANS_DIR}`);

  watcher = chokidar.watch(SCANS_DIR, {
    ignored: /(^|[\/\\])\../, // Ignore dotfiles
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,  // Reduced to 200ms for faster detection
      pollInterval: 25          // Reduced to 25ms for faster polling
    }
  });

  watcher
    .on('add', (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      // Only process supported image/document formats
      if (['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif'].includes(ext)) {
        processScannedFile(filePath);
      }
    })
    .on('error', (error) => {
      console.error(`Scan watcher error: ${error}`);
    })
    .on('ready', () => {
      console.log('Scan watcher ready and monitoring for new files');
    });
}

// Stop the file watcher
export function stopScanWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.log('Scan watcher stopped');
  }
}

// Get watcher status
export function getWatcherStatus(): { running: boolean; directory: string; pendingScans: number } {
  return {
    running: watcher !== null,
    directory: SCANS_DIR,
    pendingScans: pendingScans.size
  };
}

export default {
  startScanWatcher,
  stopScanWatcher,
  getWatcherStatus,
  addPendingScan,
  getPendingScan,
  removePendingScan,
  ensureScansDir,
  SCANS_DIR
};
