# EAMS Token System — Task Tracker

## Phase 1: Backend Models & Config
- [x] Add `StudentTokenSchema` to models.js
- [x] Add `LeaveRequestSchema` to models.js
- [x] Add `StudentNotificationSchema` to models.js
- [x] Add `TOKEN_SCHEMA` config to config.js
- [x] Seed `tokenSystem` setting in server.js seedDefaults

## Phase 2: Server API Endpoints
- [x] `GET /api/settings/token-system` — public check
- [x] `GET /api/student/token-status` — token balance, cooldowns, blocks
- [x] `POST /api/student/spend-token` — spend tokens to unlock view
- [x] `GET /api/student/attendance-view` — token-gated attendance data
- [x] `POST /api/student/leave/apply` — apply for leave
- [x] `GET /api/student/leave/history` — leave request history
- [x] `GET /api/student/notifications` — student notifications
- [x] `PUT /api/student/notifications/:id/read` — mark read
- [x] `GET /api/teacher/leave-requests` — teacher pending leaves
- [x] `PUT /api/teacher/leave-requests/:id` — approve/reject
- [x] `GET /api/admin/token-management` — list all token states
- [x] `PUT /api/admin/token-management/:id` — adjust tokens
- [x] `PUT /api/admin/token-system/toggle` — enable/disable
- [x] Unauthorized absence detection logic (on attendance mark)
- [x] HMAC signing for attendance data

## Phase 3: Student Frontend (student.html)
- [/] Token balance widget (sidebar + dashboard)
- [ ] Color-only default attendance view
- [ ] Unlock buttons with costs & cooldown timers
- [ ] Leave application modal
- [ ] Student notifications (bell icon + dropdown)
- [ ] Token history section
- [ ] Free check banner for <75%

## Phase 4: Teacher Frontend (teacher.html)
- [ ] Leave Requests sidebar item + badge
- [ ] Leave requests list view
- [ ] Approve/Reject with note

## Phase 5: Admin Frontend (admin.html)
- [ ] Token System toggle
- [ ] Student token overview table
- [ ] Adjust tokens for individual students
- [ ] Emergency leave grant
