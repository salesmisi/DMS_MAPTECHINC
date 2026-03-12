
import { Router } from 'express';
import folderController from '../controllers/folder.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

// List all folders
router.get('/', folderController.listFolders);
// Create a new folder (authenticated)
router.post('/', verifyToken, folderController.createFolder);
// Update a folder
router.put('/:id', verifyToken, folderController.updateFolder);
// Delete a folder (admin only)
router.delete('/:id', verifyToken, requireRole(['admin']), folderController.deleteFolder);

export default router;
