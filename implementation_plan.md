# EAMS Token-Based Attendance Visibility & Control System

Implement a **gamified token system** that controls how students view their attendance data. Students get a finite number of tokens per semester and must spend them strategically to unlock detailed views. The system includes cooldowns, bonuses, penalties, and a leave request workflow.

## User Review Required

> [!IMPORTANT]
> **Feature Gate**: The entire system is controlled by a `tokenSystem` setting (boolean). When `tokenSystem = false`, students see attendance normally (current behavior). When `true`, all token/cooldown/penalty logic activates.

> [!WARNING]
> **Breaking Change to Student Dashboard**: When the token system is active, the student dashboard will no longer show exact attendance percentages by default — only color indicators (🟢🟠🔴). Students must spend tokens to unlock detailed views.

> [!IMPORTANT]
> **Encryption**: Attendance percentages and token balances will be bcrypt-hashed in transit (signed payload) to prevent client-side tampering. The server is the single source of truth for all token/cooldown calculations.

---

## Proposed Changes

### Database — New Models & Schema Updates

#### [MODIFY] [models.js](file:///d:/Apps/Programs/Attendance%20Mangement/Git%20Clone/EAMS-Project/models.js)

Add **3 new schemas**:

1. **`StudentTokenSchema`** — Stores per-student token state
   ```js
   {
     studentId: ObjectId (ref Student),
     userId: ObjectId (ref User),
     semester: String, // e.g. "I" or "II"
     tokens: Number, // current balance (0–60)
     maxTokens: Number, // 60
     initialTokens: Number, // 50 for sem2, 60 for sem1
     // Cooldown timestamps — null = not on cooldown
     cooldowns: {
       overallColor: { until: Date, default: null },
       overallPercent: { until: Date, default: null },
       theory: { until: Date, default: null },
       lab: { until: Date, default: null },
     },
     // Bonus cooldowns
     bonusCooldowns: {
       attendanceBonus: { until: Date, default: null },
       noLeave2w: { until: Date, default: null },
       noLeave1m: { until: Date, default: null },
     },
     // Block timestamps (from penalties)
     blocks: {
       overall: { until: Date, default: null },
       all: { until: Date, default: null }, // blocks everything
     },
     // Last check timestamps
     lastCheck: {
       overallColor: Date,
       overallPercent: Date,
       theory: Date,
       lab: Date,
     },
     // Currently blocked features list
     curBlocked: [String], // ['overall','theory','lab']
     // Free check for <75% students
     freeCheckUsed: Boolean,
     freeCheckAvailableAfter: Date,
     // Transaction history
     history: [{
       action: String, // 'spend','bonus','penalty','admin_adjust'
       feature: String,
       amount: Number,
       balance: Number,
       reason: String,
       date: Date
     }]
   }
   ```

2. **`LeaveRequestSchema`** — Student leave applications
   ```js
   {
     studentId: ObjectId (ref Student),
     userId: ObjectId (ref User),
     studentName: String,
     regNo: String,
     classId: ObjectId (ref Class),
     className: String,
     leaveDate: String, // YYYY-MM-DD
     reason: String,
     status: Enum ['Pending','Approved','Rejected'],
     teacherId: ObjectId (ref User, nullable),
     teacherName: String,
     teacherNote: String,
     reviewedAt: Date,
     createdAt: Date
   }
   ```

3. **`StudentNotificationSchema`** — Notifications for students
   ```js
   {
     studentId: ObjectId,
     userId: ObjectId,
     type: Enum ['leave-response','token-bonus','token-penalty','info'],
     title: String,
     message: String,
     read: Boolean,
     time: Date
   }
   ```

---

### Configuration

#### [MODIFY] [config.js](file:///d:/Apps/Programs/Attendance%20Mangement/Git%20Clone/EAMS-Project/config.js)

Add **`TOKEN_SCHEMA`** configuration constant containing all token costs, cooldown durations, bonus values, and penalty rules. This acts as the single source of truth for tuning:

```js
TOKEN_SCHEMA: {
  enabled: false, // master toggle — also stored in Settings DB
  initialTokens: { sem1: 60, sem2: 50 },
  maxTokens: 60,
  minTokens: 0,
  costs: {
    overallColor: 8,
    overallPercent: 15,
    theory: 15,
    lab: 10,
  },
  cooldowns: { // in days
    overallColor: 20,
    overallPercent: 35,
    theory: 30,
    lab: 20,
  },
  // What each view blocks during cooldown
  blocks: {
    overallColor: ['overallColor'],
    overallPercent: ['overallColor','overallPercent','theory','lab'],
    theory: ['theory'],
    lab: ['lab'],
  },
  bonuses: {
    attendance95: { tokens: 10, cooldown: 25 },
    attendance85: { tokens: 5, cooldown: 25 },
    noLeave2w: { tokens: 5, cooldown: 15 },
    noLeave1m: { tokens: 10, cooldown: 30 },
  },
  penalties: {
    applyLeave: { tokens: 5, blockOverall: 15 },
    unauthorizedLeave: { tokens: 10, blockAll: 30 },
  },
  freeCheck: {
    threshold: 75, // below this % = eligible
    cooldownDays: 20,
  }
}
```

---

### Server — New API Endpoints

#### [MODIFY] [server.js](file:///d:/Apps/Programs/Attendance%20Mangement/Git%20Clone/EAMS-Project/server.js)

**New endpoints (~15):**

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/student/token-status` | Get student's token balance, cooldowns, blocks |
| `POST` | `/api/student/spend-token` | Spend tokens to unlock a view (`overallColor`, `overallPercent`, `theory`, `lab`) |
| `GET` | `/api/student/attendance-view` | Replaces direct `/api/student/me` attendance — returns color-only or unlocked data based on token state |
| `POST` | `/api/student/leave/apply` | Apply for leave (deducts 5 tokens, notifies teacher) |
| `GET` | `/api/student/leave/history` | Student's own leave requests |
| `GET` | `/api/student/notifications` | Student notifications (leave responses, bonuses, penalties) |
| `PUT` | `/api/student/notifications/:id/read` | Mark notification as read |
| `GET` | `/api/teacher/leave-requests` | Teacher views pending leave requests |
| `PUT` | `/api/teacher/leave-requests/:id` | Teacher approves/rejects with note |
| `GET` | `/api/admin/token-management` | List all students' token states |
| `PUT` | `/api/admin/token-management/:studentId` | Admin adjusts tokens, grants emergency leave |
| `PUT` | `/api/admin/token-system/toggle` | Enable/disable tokenSystem globally |
| `GET` | `/api/settings/token-system` | Check if tokenSystem is enabled (public for any role) |

**Server-side enforcement:**
- Token deduction is **atomic** (findOneAndUpdate with `$inc`)
- Cooldown validation happens server-side before returning data
- Attendance percentages are **signed** with HMAC before sending to client (bcrypt-based integrity check)
- Bonus calculations run automatically after each `/api/student/spend-token` call for overall views
- Penalty for unauthorized leave is triggered when attendance is marked absent AND no approved leave exists for that date

---

### Student Frontend

#### [MODIFY] [student.html](file:///d:/Apps/Programs/Attendance%20Mangement/Git%20Clone/EAMS-Project/student.html)

**Major UI changes (when `tokenSystem = true`):**

1. **Token Status Widget** — Sidebar and dashboard show token balance with animated coin icon
2. **Color-Only Default View** — Hero section and subject table show 🟢🟠🔴 instead of exact percentages
3. **"Unlock" Buttons** — For each view category (Overall Color, Overall %, Theory, Lab) with cost display
4. **Cooldown Timers** — Show countdown when features are on cooldown
5. **Leave Application Button** — New sidebar item + modal with date picker, reason field
6. **Student Notifications** — Bell icon with badge for unread leave responses / token events
7. **Token History** — Dedicated section showing spend/bonus/penalty log
8. **Free Check Banner** — When attendance < 75%, show availability after cooldown

**Visual design approach:**
- Token balance: Gold coin animation with current count
- Cooldown indicators: Pulsing timer badges on locked features
- Color indicators: Large colored circles/bars replacing percentage numbers
- Unlock animations: Smooth reveal when spending tokens
- Penalty alerts: Red warning banners for blocks

---

### Teacher Frontend

#### [MODIFY] [teacher.html](file:///d:/Apps/Programs/Attendance%20Mangement/Git%20Clone/EAMS-Project/teacher.html)

Add **Leave Requests** section:
- New sidebar item: "📋 Leave Requests" with pending count badge
- List view of pending requests showing student name, date, reason
- Approve/Reject buttons with optional teacher note
- Notification is sent to student upon action

---

### Admin Frontend

#### [MODIFY] [admin.html](file:///d:/Apps/Programs/Attendance%20Mangement/Git%20Clone/EAMS-Project/admin.html)

Add **Token Management** panel:
- Toggle switch for `tokenSystem` enable/disable
- Token config editor (view/edit TOKEN_SCHEMA values)
- Student token overview table (search by name/regNo)
- Adjust tokens for individual students
- Emergency leave grant (bypasses penalty)
- Bulk token reset for new semester

---

## Open Questions

> [!IMPORTANT]
> **Semester Detection**: How should the system determine which semester a student is in (for initial token allocation of 50 vs 60)? Options:
> 1. Use the academic settings `sem` value from `Settings` collection
> 2. Use the student's class `sem` field
> 3. Manual selection

> [!IMPORTANT]
> **Unauthorized Leave Detection**: Currently, attendance records only have `present`/`absent` status. How should we detect "unauthorized leave" (absent without applying)?
> - **Recommended approach**: When attendance is marked `absent` for a student, check if they have an approved `LeaveRequest` for that date. If not → trigger unauthorized leave penalty.

> [!WARNING]
> **Teacher for Leave Requests**: Which teacher should receive leave request notifications?
> - Option A: Class Advisor (teacher with `isClassAdvisor` for that class)
> - Option B: All teachers assigned to that class
> - Option C: Student selects teacher when applying

> [!IMPORTANT]
> **Token Schema Location**: You mentioned adding `TokenSchema` to `config.js`. I'll add the **configuration constants** (costs, cooldowns, etc.) to `config.js` and the **database schema** (StudentToken model) to `models.js`. Is this separation acceptable?

---

## Verification Plan

### Automated Tests
1. **Token deduction flow**: Spend tokens → verify balance decreases → verify cooldown is set
2. **Cooldown enforcement**: Try spending during cooldown → verify rejection
3. **Bonus calculation**: After viewing overall with ≥95% → verify bonus tokens added
4. **Penalty flow**: Apply leave → verify 5 token deduction + 15-day overall block
5. **Feature gate**: With `tokenSystem = false`, verify normal attendance display
6. **Leave workflow**: Apply → teacher approves → verify student notification

### Manual Verification
- Browser test of student dashboard with token system enabled
- Visual verification of color-only indicators
- Test cooldown timer display
- Test leave request flow end-to-end (student → teacher → notification)
- Test admin token management panel
