
import { Router } from 'express';
import folderController from '../controllers/folder.controller';

const router = Router();

// List all folders
router.get('/', folderController.listFolders);
// Create a new folder
router.post('/', folderController.createFolder);
// Update a folder
router.put('/:id', folderController.updateFolder);
// Delete a folder
router.delete('/:id', folderController.deleteFolder);

export default router;
