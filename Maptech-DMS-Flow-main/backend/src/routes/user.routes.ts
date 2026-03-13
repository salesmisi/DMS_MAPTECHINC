import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  changePassword,
} from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getUsers);
router.get('/:id', authenticate, getUserById);
router.post('/', authenticate, createUser);
router.put('/:id', authenticate, updateUser);
router.delete('/:id', authenticate, deleteUser);
router.put('/:id/reset-password', authenticate, resetPassword);
router.put('/:id/change-password', authenticate, changePassword);

export default router;
