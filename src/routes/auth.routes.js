const express = require('express');
const router = express.Router();
const authController       = require('../controllers/auth/auth.controller');
const googleAuthController = require('../controllers/auth/google.auth.controller');
const userController = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');
const restrictTo = require('../middlewares/restrictTo.middleware');
const validate = require('../middlewares/validation.middleware');
const { registerSchema, loginSchema, updateUserRoleSchema } = require('../validators/auth.validators');

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [🔐 Auth]
 *     summary: Register a new user
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:     { type: string, example: Ahmed Ali }
 *               email:    { type: string, format: email, example: ahmed@example.com }
 *               password: { type: string, minLength: 8, example: Password123! }
 *               phone:    { type: string, example: '+201234567890' }
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400: { $ref: '#/components/responses/400' }
 */
router.post('/register', validate(registerSchema), authController.register);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     tags: [🔐 Auth]
 *     summary: Verify user email with OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email, example: ahmed@example.com }
 *               otp:   { type: string, example: '123456' }
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/verify-otp', authController.verifyOTP);

/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     tags: [🔐 Auth]
 *     summary: Resend OTP for email verification
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: ahmed@example.com }
 *     responses:
 *       200:
 *         description: OTP resent successfully
 *       400:
 *         description: User not found or already verified
 */
router.post('/resend-otp', authController.resendOTP);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [🔐 Auth]
 *     summary: Login with email and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email, example: ahmed@example.com }
 *               password: { type: string, example: Password123! }
 *     responses:
 *       200:
 *         description: Login successful
 *       401: { $ref: '#/components/responses/401' }
 */
router.post('/login', validate(loginSchema), authController.login);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [🔐 Auth]
 *     summary: Get current authenticated user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Current user data
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/me', protect, userController.getMe);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     tags: [🔐 Auth]
 *     summary: Refresh access token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string, example: eyJhbGc... }
 *     responses:
 *       200:
 *         description: New access token issued
 *       401: { $ref: '#/components/responses/401' }
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [🔐 Auth]
 *     summary: Logout from current device
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401: { $ref: '#/components/responses/401' }
 */
router.post('/logout', protect, authController.logout);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     tags: [🔐 Auth]
 *     summary: Logout from all devices
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Logged out from all devices
 *       401: { $ref: '#/components/responses/401' }
 */
router.post('/logout-all', protect, authController.logoutAll);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [🔐 Auth]
 *     summary: Request password reset email
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: ahmed@example.com }
 *     responses:
 *       200:
 *         description: Reset email sent if user exists
 */
router.post('/forgot-password', authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password/{token}:
 *   patch:
 *     tags: [🔐 Auth]
 *     summary: Reset password using token
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: Password reset token from email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, minLength: 8, example: NewPassword123! }
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400: { $ref: '#/components/responses/400' }
 */
router.patch('/reset-password/:token', authController.resetPassword);

/**
 * @swagger
 * /auth/admin/users/{userId}/role:
 *   patch:
 *     tags: [🔐 Auth]
 *     summary: Update user role (Admin only)
 *     description: Change a user's role. Only admin users can access this endpoint. Role is whitelisted to ['buyer', 'owner', 'agent']
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         description: User ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, newRole]
 *             properties:
 *               userId:  { type: string, example: 507f1f77bcf86cd799439011 }
 *               newRole: { type: string, enum: [buyer, owner, agent], example: agent }
 *     responses:
 *       200:
 *         description: User role updated successfully
 *       400: { $ref: '#/components/responses/400' }
 *       403:
 *         description: Forbidden - only admin can update roles
 *       404:
 *         description: User not found
 */
router.patch('/admin/users/:userId/role', protect, restrictTo('admin'), validate(updateUserRoleSchema), authController.updateUserRole);

/**
 * @swagger
 * /auth/google-login:
 *   post:
 *     tags: [🔐 Auth]
 *     summary: Sign in / Sign up with Google
 *     description: |
 *       Frontend-driven OAuth flow:
 *       1. Frontend triggers Google Sign-In (Google Identity SDK)
 *       2. Google returns an `idToken` to the frontend
 *       3. Frontend sends `{ idToken }` to this endpoint
 *       4. Backend verifies token cryptographically and upserts user
 *
 *       **Edge cases handled:**
 *       - New user → creates account (email auto-verified)
 *       - Existing local user → links Google account
 *       - Returning Google user → direct login
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token from Google Sign-In SDK
 *                 example: eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...
 *     responses:
 *       200:
 *         description: Authenticated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:       { type: string, example: success }
 *                 message:      { type: string, example: Signed in with Google successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:  { type: string }
 *                     user:         { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Token missing or email not verified
 *       401:
 *         description: Invalid or expired Google token
 *       403:
 *         description: Account banned or suspended
 */
router.post('/google-login', googleAuthController.googleAuth);

module.exports = router;
