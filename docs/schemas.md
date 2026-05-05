# 📐 Luxe Estates — Schema Reference Guide

> **Phase 3.4 — Schema Consistency Documentation**
> Last updated: May 2026 | Source of truth for all cross-model field naming.

---

## ⚠️ The Naming Inconsistency Problem

MongoDB doesn't enforce foreign key naming across collections. Over time, Luxe Estates accumulated inconsistent reference field names across models. This document is the **official reference** to prevent future mismatches.

---

## 📋 Model Reference Field Map

| Model | User Reference | Booking Reference | Property Reference |
|---|---|---|---|
| `Payment` | `user` (ObjectId) | `booking` (ObjectId) | `property` (ObjectId) |
| `Booking` | `user_id` (ObjectId) | — | `property_id` (ObjectId) |
| `Favorite` | `user_id` (ObjectId) | — | `property_id` (ObjectId) |
| `Property` | `owner` (ObjectId) | — | — |
| `Review` | `userId` (ObjectId) | — | `propertyId` (ObjectId) |
| `Inquiry` | `sender` / `receiver` | — | `property` (ObjectId) |
| `Notification` | `userId` (ObjectId) | — | — |
| `AuditLog` | `actor` (ObjectId) | — | `targetId` (ObjectId, polymorphic) |

---

## 🔍 Aggregation Query Cheat Sheet

When writing `$lookup` stages, always use the **exact field name** from this table:

### Payment → Booking
```javascript
{ $lookup: { from: 'bookings', localField: 'booking', foreignField: '_id', as: 'bookingData' } }
//                                                     ↑ 'booking' (NOT 'booking_id' or 'bookingId')
```

### Booking → Property
```javascript
{ $lookup: { from: 'properties', localField: 'property_id', foreignField: '_id', as: 'property' } }
//                                                ↑ 'property_id' (snake_case in Booking model)
```

### Booking → User
```javascript
{ $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'user' } }
//                                         ↑ 'user_id' (snake_case in Booking model)
```

### Payment → User
```javascript
{ $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userInfo' } }
//                                     ↑ 'user' (no suffix in Payment model)
```

---

## ✅ Field Naming Convention (New Code)

For **any new model** created after Phase 3.4, follow this standard:

| Relationship | Preferred Field Name | Example |
|---|---|---|
| User reference | `userId` | `userId: ObjectId` |
| Property reference | `propertyId` | `propertyId: ObjectId` |
| Booking reference | `bookingId` | `bookingId: ObjectId` |
| Owner reference | `ownerId` | `ownerId: ObjectId` |

> **Note:** Do NOT rename existing fields. The old names are maintained for backwards
> compatibility. Use this naming only in new models (e.g., `AuditLog`).

---

## 🧩 AuditLog Model (New — Phase 3.2)

The `AuditLog` model follows the new naming convention:

```javascript
{
  actor:      ObjectId → User       // Who performed the action
  action:     String (enum)          // What was done
  targetType: String (enum)          // Which resource type
  targetId:   ObjectId (polymorphic) // Which resource ID
  changes:    Mixed                  // { before: {}, after: {} }
  metadata:   Mixed                  // { ip, userAgent, reason }
  createdAt:  Date                   // Auto-timestamp (immutable)
}
```

---

## 🔐 Ownership Field Reference

Used by `ownershipGuard.middleware.js` to detect conflict of interest:

| Resource | `ownerField` | Notes |
|---|---|---|
| `Property` | `owner` | Direct ObjectId on Property doc |
| `Auction` | `seller` | Direct ObjectId on Auction doc |
| `Booking` → Property | `property_id.owner` | Requires populate of `property_id` |
| `User` (KYC self-check) | `_id` | `isSelfCheck: true` mode |

---

## 📌 Known Technical Debt (Do Not Break)

The following field names are intentionally kept as-is due to existing data in production:

1. `Booking.user_id` — Do NOT rename to `userId` (would require data migration)
2. `Booking.property_id` — Do NOT rename to `propertyId`
3. `Favorite.user_id` / `Favorite.property_id` — Same as above
4. `Review.userId` / `Review.propertyId` — camelCase but inconsistent with Booking
5. `Payment.user` / `Payment.booking` — No suffix at all

**Rule:** Always check this document before writing cross-model queries.
