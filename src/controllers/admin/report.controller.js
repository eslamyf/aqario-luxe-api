const Report   = require('../../models/report.model');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const { createNotification } = require('../../utils/notificationHelper');

const { getPaginationParams } = require('../../utils/paginate');

// ─── Submit Report ────────────────────────────────────────────
exports.submitReport = asyncHandler(async (req, res, next) => {
  const { targetType, targetId, reason, description } = req.body;

  // Prevent reporting the same item twice
  const existing = await Report.findOne({
    reporter: req.user._id, targetType, targetId, status: { $in: ['pending', 'reviewed'] },
  });
  if (existing) return next(new AppError(req.t('REPORT.ALREADY_REPORTED'), 409));

  const report = await Report.create({
    reporter: req.user._id, targetType, targetId, reason, description,
  });

  res.status(201).json({ status: 'success', message: req.t('REPORT.SUBMITTED'), data: { report } });
});

// ─── Get All Reports (Admin) ──────────────────────────────────
exports.getAllReports = asyncHandler(async (req, res) => {
  const { status, targetType } = req.query;
  const filter = {};
  if (status)     filter.status     = status;
  if (targetType) filter.targetType = targetType;

  const { page, limit, skip } = getPaginationParams(req.query, 20, 100);

  const [total, reports] = await Promise.all([
    Report.countDocuments(filter),
    Report.find(filter)
      .populate('reporter', 'name email')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.status(200).json({ status: 'success', total, page, pages: Math.ceil(total / limit), data: { reports } });
});

// ─── Review Report (Admin) ────────────────────────────────────
exports.reviewReport = asyncHandler(async (req, res, next) => {
  const { status, adminNote } = req.body;
  const validStatuses = ['reviewed', 'resolved', 'dismissed'];
  if (!validStatuses.includes(status)) return next(new AppError(req.t('REPORT.INVALID_STATUS'), 400));

  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status, adminNote, reviewedBy: req.user._id, reviewedAt: new Date() },
    { returnDocument: 'after' }
  ).populate('reporter', '_id name');

  if (!report) return next(new AppError(req.t('REPORT.NOT_FOUND'), 404));

  // Notify reporter about the report result
  await createNotification(req.io, report.reporter._id, {
    type:    'system',
    title:   req.t('NOTIFICATION.REPORT_REVIEWED'),
    message: req.t('NOTIFICATION.REPORT_REVIEWED_MSG', { status }),
    link:    '/reports',
  }).catch(() => {});

  res.status(200).json({ status: 'success', data: { report } });
});

// ─── My Reports ───────────────────────────────────────────────
exports.getMyReports = asyncHandler(async (req, res) => {
  const reports = await Report.find({ reporter: req.user._id }).sort('-createdAt');
  res.status(200).json({ status: 'success', count: reports.length, data: { reports } });
});
