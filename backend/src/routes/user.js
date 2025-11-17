// backend/src/routes/user.js
import express from 'express';
import userController from '../controllers/usercontroller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// User routes
router.get('/profile', userController.getProfile);
router.patch('/profile', userController.updateProfile);
router.post('/change-password', userController.changePassword);
router.delete('/delete', userController.deleteAccount);

// Admin routes
router.get('/all', userController.getAllUsers);
router.patch('/admin/role/:userId', userController.adminUpdateUserRole);

export default router;