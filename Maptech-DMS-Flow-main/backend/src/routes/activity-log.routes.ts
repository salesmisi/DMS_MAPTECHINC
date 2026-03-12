import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as activityLogController from '../controllers/activity-log.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/activity-logs - Get all activity logs (admin only, but we'll allow all authenticated users to write)
router.get('/', activityLogController.getActivityLogs);

// POST /api/activity-logs - Create a new activity log
router.post('/', activityLogController.createActivityLog);

export default router;
