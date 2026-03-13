import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import {
  requestDelete,
  listDeleteRequests,
  approveDeleteRequest,
  denyDeleteRequest
} from '../controllers/delete-request.controller';

const router = Router();

// Staff: Request deletion
router.post('/', authenticate, requestDelete);

// Admin: List all pending delete requests
router.get('/', authenticate, requireRole(['admin']), listDeleteRequests);

// Admin: Approve a delete request
router.put('/:id/approve', authenticate, requireRole(['admin']), approveDeleteRequest);

// Admin: Deny a delete request
router.put('/:id/deny', authenticate, requireRole(['admin']), denyDeleteRequest);

export default router;
