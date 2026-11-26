import { Router } from 'express';
import {
  login,
  register,
  getLoggedUser,
} from '../controllers/auth/auth.controller';
import { authenticated } from '../middlewares/authenticated';
import { rateLimit } from '../middlewares/rate-limit';

const router = Router();

// Dificulta força bruta de senha e criação de contas em massa
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.post('/login', authLimiter, login);
router.post('/register', authLimiter, register);
router.get('/logged-user', authenticated(), getLoggedUser);

export default router;
