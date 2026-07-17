## 🔹 `v2.2.10` — 18 July 2026 *(Performance Improvement Update)*

### *General Changes & Fixes*

- **Frontend (`admin.html`, `teacher.html`)**
    - Dashboard: split init into fast path + deferred widgets (attendance-overview, defaulters, unmarked-teachers) with `AbortController` 8s timeout & per-widget retry.
    - Students: cascade filter (year → batch → dept → class → section), Show List always enabled, default sort by `regNo`, limit=65, client-side live search, column sort triggers server re-fetch.
    - Teachers: dept dropdown uses `_id`, GET filtered by `?deptId=` param.
    - Reports/Analytics: date range gate on all three report generators.
    - Activity Logs: cursor-based pagination (initial 50, Load More via `?before=`), switched to `_logData` array instead of `DB.get('logs')`.
    - Classes/Subjects: `openCD` uses roster mode (`?classId=X&roster=1`), `studentCount` shown from server-side aggregation.
    - ETA: dropped localStorage history persistence; now computed live from current-session task durations.

- **Backend (`routes/*.js`)**
    - `students.routes.js`: response shape changed to `{data, total, page, hasMore}`, academic year format auto-conversion (`2025-2026` → `2025-26`).
    - `logs.routes.js`: sort/filter/cursor uses `createdAt` instead of `time`.
    - `teachers.routes.js`: GET supports `?deptId` (ObjectId) and `?dept` (code).
    - `attendance.routes.js`: filter-required guard + selective student query (only referenced `studentTrackId`s).
    - `dashboard.routes.js`: `/summary` wrapped in try/catch.

- **Database Models (`models/*.js`)**
    - Added 14 indexes across Student, Teacher, Class, Subject, Assignment, Log schemas.
    - TeacherSchema: added `deptId` and `deptCode` fields.
    - LogSchema: added `{createdAt: -1}` index.

- **Migration (`scripts/backfillTeacherDeptId.js`)**
    - One-shot migration that matches `Teacher.department` (case-insensitive) against `Department.name/code/threeLetterCode` and sets `deptId`+`deptCode`.

- **Utilities (`utils/logAction.js`, `start.js`)**
    - `logAction` fixes for new field names.
    - `start.js`: `addTeacher`/`addAdmin`/`addStudent` now create `User` entries; `_demoTeachers` sets `deptId`/`deptCode`; removed `password` from User.create params.

### `Total 19 Files changed`

---

## 🔹 `v2.2.9` — 18 July 2026 *(Performance Improvement Update)*

### *General Changes & Fixes*

- `admin.html` - Minor changes.
