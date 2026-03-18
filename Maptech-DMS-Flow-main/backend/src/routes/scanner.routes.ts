import express from 'express';
import scannerController from '../controllers/scanner.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Check if NAPS2 is installed
router.get('/naps2/status', authenticate, scannerController.checkNaps2Installation);

// List available scanners
router.get('/devices', authenticate, scannerController.listScanners);

// Start a new scan
router.post('/scan', authenticate, scannerController.startScan);

// Finalize a multi-page scan batch into one document
router.post('/scan-batch/:batchId/finalize', authenticate, scannerController.finalizeScanBatch);

// Discard a multi-page scan batch
router.delete('/scan-batch/:batchId', authenticate, scannerController.discardScanBatch);

// Get scan session status
router.get('/scan/:sessionId', authenticate, scannerController.getScanStatus);

// Get recent scans for current user
router.get('/recent', authenticate, scannerController.getRecentScans);

// Get file watcher status
router.get('/watcher/status', authenticate, scannerController.getWatcherStatus);

// Get last scanned document (for preview)
router.get('/last-scanned', authenticate, scannerController.getLastScannedDocument);

// Cancel a pending scan
router.delete('/scan/:sessionId', authenticate, scannerController.cancelScan);

export default router;
