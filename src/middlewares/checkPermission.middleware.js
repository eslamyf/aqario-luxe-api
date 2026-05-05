/**
 * checkPermission.middleware.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Granular Permission Guard (RBAC Layer 2).
 *
 * Works alongside restrictTo() to enforce fine-grained access control.
 * Admins with `permissions: []` (empty) are treated as Super Admin
 * and retain full backwards-compatible access.
 *
 * Usage:
 *   router.patch('/admin/properties/:id/approve',
 *     restrictTo('admin'),
 *     checkPermission('approve_property'),
 *     ownershipGuard(...),
 *     dashboardController.approveProperty
 *   );
 *
 * Available permissions (must match user.model.js enum):
 *   approve_property | reject_property
 *   approve_booking  | reject_booking
 *   ban_user         | change_role     | update_permissions
 *   approve_kyc      | reject_kyc
 *   delete_review    | view_audit_logs
 *   manage_auctions  | export_data     | bulk_actions
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * @param {...string} requiredPermissions - One or more permission strings required
 * @returns Express middleware
 */
const checkPermission = (...requiredPermissions) => (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ status: 'fail', message: 'Authentication required.' });
  }

  // ── Non-Admin / Super Admin Shortcuts ───────────────────────────────────────
  
  // Granular permissions only apply to admin roles. If restrictTo allowed a non-admin 
  // (e.g., owner/agent), they bypass this check.
  if (user.role !== 'admin') {
    return next();
  }

  // Admin with no explicit permissions list = legacy full-access super admin.
  // This ensures backwards compatibility with existing admin accounts.
  if (user.role === 'admin' && (!user.permissions || user.permissions.length === 0)) {
    return next();
  }

  // ── Granular Permission Check ────────────────────────────────────────────────
  const userPermissions = user.permissions || [];
  const missingPermissions = requiredPermissions.filter(p => !userPermissions.includes(p));

  if (missingPermissions.length > 0) {
    return res.status(403).json({
      status: 'fail',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `You do not have the required permission(s): ${missingPermissions.join(', ')}`,
    });
  }

  next();
};

module.exports = checkPermission;
