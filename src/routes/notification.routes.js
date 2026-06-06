const express  = require('express');
const router   = express.Router();
const { protect } = require('../middlewares/auth.middleware');
const Notification = require('../models/notification.model');

router.use(protect);

/**
 * @swagger
 * /notifications:
 *   get:
 *     tags: [🔔 Notifications]
 *     summary: Get my notifications
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: My notifications list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:      { type: string, example: success }
 *                 total:       { type: integer }
 *                 unreadCount: { type: integer }
 *                 page:        { type: integer }
 *                 pages:       { type: integer }
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Notification' }
 *       401: { $ref: '#/components/responses/401' }
 */
const { cursorPaginate } = require('../utils/cursorPaginate');

router.get('/', async (req, res, next) => {
  try {
    const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });

    const { data: notifications, nextCursor, hasMore, count } = await cursorPaginate(Notification, {
      filter:      { userId: req.user._id },
      sort:        'desc',
      limit:       parseInt(req.query.limit) || 20,
      afterCursor: req.query.cursor,
    });

    res.status(200).json({
      status: 'success',
      unreadCount,
      count,
      nextCursor,
      hasMore,
      data: { notifications },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     tags: [🔔 Notifications]
 *     summary: Mark all notifications as read
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       401: { $ref: '#/components/responses/401' }
 */
router.patch('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
    res.status(200).json({ status: 'success', message: req.t('INQUIRY.MARKED_READ') });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     tags: [🔔 Notifications]
 *     summary: Mark a notification as read
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       401: { $ref: '#/components/responses/401' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.patch('/:id/read', async (req, res, next) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true },
      { returnDocument: 'after' }
    );
    if (!notif) return res.status(404).json({ status: 'fail', message: req.t('COMMON.PATH_NOT_FOUND', { path: 'notification' }) });
    res.status(200).json({ status: 'success', data: { notification: notif } });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     tags: [🔔 Notifications]
 *     summary: Delete a notification
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Notification deleted
 *       401: { $ref: '#/components/responses/401' }
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
