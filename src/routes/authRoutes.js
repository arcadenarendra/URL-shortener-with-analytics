import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { registerSchema, loginSchema, refreshSchema } from '../validators/schemas.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), auth.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), auth.login);
router.post('/refresh', authLimiter, validate({ body: refreshSchema }), auth.refresh);
router.post('/logout', validate({ body: refreshSchema.partial() }), auth.logout);
router.get('/me', requireAuth, auth.me);

export default router;
