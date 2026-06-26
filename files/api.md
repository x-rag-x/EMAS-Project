# EAMS API Documentation

This document lists all backend REST API endpoints available in the Electronic Attendance Management System (EAMS), grouped by route file and by user access category/role.

---

## 1. API Endpoints by Route File

### Authentication & Sessions (`routes/auth.routes.js`)
*Mounted at `/api/auth`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **POST** | `/login` | Public user sign-in (returns JWT token and stores session) | None |
| **POST** | `/logout` | Terminate user session and revoke token | `authMiddleware` |
| **POST** | `/change-password` | Change user password | `authMiddleware` |
| **GET** | `/verify-session` | Verify active JWT session token | `authMiddleware` |

### Profile Management (`routes/profile.routes.js`)
*Mounted at `/api/profile`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/me` | Retrieve profile data for the logged-in user | `authMiddleware` |
| **PUT** | `/me` | Update profile data for the logged-in user | `authMiddleware` |
| **GET** | `/users` | Get lists of system users | `authMiddleware` |
| **PUT** | `/users/:id` | Update status/details of a specific user | `authMiddleware` |

### Student Portal (`routes/studentPortal.routes.js`)
*Mounted at `/api/student`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/me` | Get student profile and homepage dashboard data | `authMiddleware`, `checkMaintenance` |

### Student Management (`routes/students.routes.js`)
*Mounted at `/api/students`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Fetch list of students (optionally filtered by dept, class, section) | `authMiddleware` |
| **GET** | `/count` | Retrieve total count of students | `authMiddleware` |
| **GET** | `/exam-search` | Search students by Reg No / Name (used for exam seating) | `authMiddleware` |
| **POST** | `/` | Add a new student record and shadow user login | `authMiddleware`, `adminOnly` |
| **PUT** | `/:id` | Update student profile and shadow user details | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Soft-delete student and move record to UndoLog | `authMiddleware`, `adminOnly` |
| **POST** | `/bulk-upload` | Import students from Excel sheet file | `authMiddleware`, `adminOnly` |

### Teacher Management (`routes/teachers.routes.js`)
*Mounted at `/api/teachers`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/trackid/:trackId` | Fetch teacher record by its unique track ID | `authMiddleware` |
| **GET** | `/` | Fetch all teacher records | `authMiddleware` |
| **POST** | `/` | Add a new teacher record and shadow user login | `authMiddleware`, `adminOnly` |
| **PUT** | `/:id` | Update teacher details | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Soft-delete teacher and move record to UndoLog | `authMiddleware`, `adminOnly` |

### Department Administration (`routes/departments.routes.js`)
*Mounted at `/api/depts`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Fetch all department records sorted alphabetically | `authMiddleware` |
| **POST** | `/` | Add a new department | `authMiddleware`, `adminOnly` |
| **PUT** | `/:id` | Update department details | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Delete department | `authMiddleware`, `adminOnly` |

### Class & Section Administration (`routes/classes.routes.js`)
*Mounted at `/api/classes`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Fetch list of all classes/sections | `authMiddleware` |
| **POST** | `/` | Add a new class/section | `authMiddleware`, `adminOnly` |
| **PUT** | `/:id` | Update class details | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Delete class | `authMiddleware`, `adminOnly` |

### Subject Administration (`routes/subjects.routes.js`)
*Mounted at `/api/subjects`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Fetch list of all subjects | `authMiddleware` |
| **POST** | `/` | Add a new subject | `authMiddleware`, `adminOnly` |
| **PUT** | `/:id` | Update subject details | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Delete subject | `authMiddleware`, `adminOnly` |

### Timetable Configuration (`routes/timetable.routes.js`)
*Mounted at `/api/timetable`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Get timetable entries | `authMiddleware` |
| **POST** | `/` | Create a timetable entry | `authMiddleware` |
| **PUT** | `/:id` | Update specific timetable entry | `authMiddleware` |
| **DELETE** | `/:id` | Remove timetable entry | `authMiddleware` |
| **GET** | `/section/:classId` | Retrieve complete weekly timetable for a class | `authMiddleware` |
| **PUT** | `/section/:classId/slot` | Update a specific timetable period/slot | `authMiddleware` |
| **PUT** | `/section/:classId` | Save entire weekly timetable for a class | `authMiddleware` |
| **POST** | `/check-conflicts` | Validate room/teacher conflicts for a schedule slot | `authMiddleware` |
| **POST** | `/auto-gen` | Generate optimized timetable slots | `authMiddleware` |

### Attendance Marking (`routes/attendance.routes.js`)
*Mounted at `/api/attendance`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Fetch attendance logs with date and class filters | `authMiddleware` |
| **POST** | `/` | Save/Submit class attendance sheet | `authMiddleware` |
| **GET** | `/unmarked-teachers` | Fetch list of teachers who have not marked attendance today | `authMiddleware`, `adminOnly` |
| **DELETE** | `/all` | Purge all attendance records | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Delete a single attendance log | `authMiddleware`, `adminOnly` |

### College Calendar (`routes/calendar.routes.js`)
*Mounted at `/api/calendar`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Fetch academic calendar days for a specific month/year | `authMiddleware` |
| **GET** | `/check/:date` | Check status of a single date | `authMiddleware` |
| **POST** | `/` | Set day status, hours, and notes | `authMiddleware`, `adminOnly` |
| **PUT** | `/:date` | Edit day parameters | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:date` | Revert day to default calendar status | `authMiddleware`, `adminOnly` |
| **POST** | `/bulk-generate` | Generate default academic calendar settings for a month | `authMiddleware`, `adminOnly` |

### Exams Scheduling (`routes/exams.routes.js`)
*Mounted at `/api/exams`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Get list of exams (supports filters: type, year, status) | `authMiddleware` |
| **GET** | `/active` | Get active/ongoing exam schedules | `authMiddleware` |
| **GET** | `/:id` | Fetch detailed single exam schedule | `authMiddleware` |
| **POST** | `/` | Create a new exam schedule | `authMiddleware`, `adminOnly` |
| **PUT** | `/:id` | Update exam schedule details | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Cancel/Delete exam schedule | `authMiddleware`, `adminOnly` |

### Exam Hall Attendance (`routes/examAttendance.routes.js`)
*Mounted at `/api/exam-attendance`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Fetch marked exam attendance lists | `authMiddleware` |
| **GET** | `/halls-today` | Retrieve summary of active exam halls for a given date | `authMiddleware` |
| **GET** | `/:id` | Fetch exam attendance details for a specific hall/class | `authMiddleware` |
| **POST** | `/` | Submit invigilator exam hall attendance | `authMiddleware` |

### Assignments & Study Materials (`routes/assignments.routes.js`)
*Mounted at `/api/assignments`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Get assignments | `authMiddleware` |
| **POST** | `/` | Upload a new assignment | `authMiddleware`, `adminOnly` |
| **POST** | `/bulk` | Bulk upload assignments | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Delete assignment record | `authMiddleware`, `adminOnly` |

### Grievances (`routes/grievances.routes.js`)
*Mounted at `/api/grievances`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Get list of all submitted grievances | `authMiddleware` |
| **POST** | `/` | File a new grievance | `authMiddleware` |

### Live RFID/App Sessions (`routes/liveSession.routes.js`)
*Mounted at `/api/live-session` | RFID integrations*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **POST** | `/start` | Open a live RFID attendance capture window | `authMiddleware` |
| **GET** | `/active` | Find active hardware live session | `authMiddleware` |
| **POST** | `/mark` | Register card scan from external reader device | `authMiddleware` |
| **GET** | `/status/:id` | Get connection status of current live session | `authMiddleware` |
| **POST** | `/end/:id` | Close live session and compile attendance sheet | `authMiddleware` |

### Dashboard Statistics (`routes/dashboard.routes.js`)
*Mounted at `/api/dashboard`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/summary` | Retrieve admin home screen cards statistics | `authMiddleware`, `adminOnly` |

### Settings & Policies (`routes/settings.routes.js`)
*Mounted at `/api/settings`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Get global settings | `authMiddleware`, `adminOnly` |
| **POST** | `/verify-delete-password` | Confirm admin password for high-risk operations | `authMiddleware`, `adminOnly` |
| **GET** | `/value/:settingKey` | Get current value of a specific setting key | `authMiddleware` |
| **GET** | `/:key` | Get setting detail by key | `authMiddleware` |
| **PUT** | `/:key` | Modify setting configuration | `authMiddleware`, `adminOnly` |

### System Logs (`routes/logs.routes.js`)
*Mounted at `/api/logs`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Retrieve action audit logs | `authMiddleware`, `adminOnly` |
| **POST** | `/` | Post log entries from client side | `authMiddleware` |
| **DELETE** | `/all` | Purge entire system action log database | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Delete a single audit log entry | `authMiddleware`, `adminOnly` |

### System Utilities (`routes/system.routes.js`)
*Mounted at `/api/system`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **POST** | `/backup` | Backup MongoDB database to JSON dump | `authMiddleware`, `adminOnly` |
| **GET** | `/backup/history` | List details of previous database backups | `authMiddleware`, `adminOnly` |
| **POST** | `/export` | Export master tables to Excel Workbook (.xlsx) | `authMiddleware`, `adminOnly` |
| **GET** | `/dbstats` | Get database storage size and collections statistics | `authMiddleware`, `adminOnly` |
| **GET** | `/serverlogs` | Read raw content of current log files | `authMiddleware`, `adminOnly` |
| **GET** | `/health` | Fetch CPU load, memory, disk, and database latency report | `authMiddleware`, `adminOnly` |

### Undo Deletion Module (`routes/undo.routes.js`)
*Mounted at `/api/undo`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Fetch list of items recently deleted and eligible for restore | `authMiddleware`, `adminOnly` |
| **POST** | `/:id` | Restore deleted item back to its primary collection | `authMiddleware`, `adminOnly` |
| **DELETE** | `/:id` | Permanently delete the backup log item | `authMiddleware`, `adminOnly` |

### Shadow User Management (`routes/users.routes.js`)
*Mounted at `/api/users`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | List all system shadow user accounts | `authMiddleware`, `adminOnly` |
| **PUT** | `/:id` | Update shadow user credentials / status | `authMiddleware` |
| **DELETE** | `/:id` | Remove shadow user | `authMiddleware`, `adminOnly` |

### Notifications & Alerts (`routes/notifications.routes.js`)
*Mounted at `/api/notifications`*

| Method | Endpoint | Description | Middleware / Access |
|:---|:---|:---|:---|
| **GET** | `/` | Fetch active user notifications | `authMiddleware` |
| **POST** | `/` | Send system-wide or user targeted notification | `authMiddleware` |
| **PUT** | `/:id` | Mark a notification as read | `authMiddleware` |
| **DELETE** | `/all` | Clear notifications for the user | `authMiddleware`, `adminOnly` |

---

## 2. API Endpoints Grouped by Conceptual Role / Category

### 🔑 Common & Public Access
These APIs are accessible without authentication or by any authenticated user regardless of their role.

*   `POST /api/auth/login` (Public login)
*   `POST /api/auth/logout` (Revoke session)
*   `GET /api/auth/verify-session` (Check session validity)
*   `GET /api/profile/me` (Retrieve self-profile data)
*   `PUT /api/profile/me` (Update self-profile details)
*   `POST /api/auth/change-password` (Update account password)
*   `GET /api/settings/value/:settingKey` (Get specific settings value)

---

### 👨‍🎓 Student Role Endpoints
These APIs are accessed by the student client applications.

*   `GET /api/student/me` (Retrieve student dashboard home summary)
*   `GET /api/calendar` (View academic calendar)
*   `GET /api/timetable` (Check class timetable)
*   `GET /api/notifications` (Fetch notifications)
*   `POST /api/grievances` (Submit a grievance/complaint)

---

### 👩‍🏫 Teacher Role Endpoints
These APIs are used by teachers to mark class attendance, invigilate exams, and coordinate lessons.

*   `POST /api/attendance` (Submit daily attendance sheets)
*   `GET /api/attendance` (View previous class logs)
*   `GET /api/timetable` (Check personal/class timetable)
*   `GET /api/depts` (Read departments list)
*   `GET /api/classes` (Read classes list)
*   `GET /api/subjects` (Read subjects list)
*   `GET /api/students` (Fetch student directory for attendance)
*   `GET /api/exams/active` (Identify exam schedules)
*   `GET /api/students/exam-search` (Search students by Reg No for hall check-in)
*   `POST /api/exam-attendance` (Submit exam hall attendance)
*   `GET /api/exam-attendance/halls-today` (Check hall submission progress)
*   `POST /api/live-session/start` (Initialize RFID live attendance session)
*   `POST /api/live-session/end/:id` (Finalize RFID live attendance session)

---

### 👑 Administrator Role Endpoints
These endpoints are restricted strictly to users with `role: 'admin'`. Any other request receives a `403 Forbidden` response.

#### User & Data Administration
*   `POST /api/students` (Add a student)
*   `PUT /api/students/:id` (Update a student)
*   `DELETE /api/students/:id` (Soft-delete student)
*   `POST /api/students/bulk-upload` (Excel import of students)
*   `POST /api/teachers` (Add a teacher)
*   `PUT /api/teachers/:id` (Update a teacher)
*   `DELETE /api/teachers/:id` (Soft-delete teacher)
*   `POST /api/depts` | `PUT /api/depts/:id` | `DELETE /api/depts/:id` (Manage departments)
*   `POST /api/classes` | `PUT /api/classes/:id` | `DELETE /api/classes/:id` (Manage classes)
*   `POST /api/subjects` | `PUT /api/subjects/:id` | `DELETE /api/subjects/:id` (Manage subjects)

#### Academic Operations
*   `POST /api/calendar` | `PUT /api/calendar/:date` | `DELETE /api/calendar/:date` (Academic calendar configuration)
*   `POST /api/calendar/bulk-generate` (Calendar month generator)
*   `POST /api/exams` | `PUT /api/exams/:id` | `DELETE /api/exams/:id` (Manage scheduled exams)
*   `GET /api/attendance/unmarked-teachers` (Identify delinquent teachers)
*   `DELETE /api/attendance/all` (Reset attendance data logs)

#### System Security, Audits & Maintenance
*   `GET /api/dashboard/summary` (Admin dashboard counters)
*   `GET /api/settings` | `PUT /api/settings/:key` (Configuration settings)
*   `POST /api/settings/verify-delete-password` (Re-verify admin credentials)
*   `GET /api/logs` | `DELETE /api/logs/all` (View and manage audit logs)
*   `GET /api/system/health` (Monitor server resource load)
*   `GET /api/system/dbstats` (Retrieve MongoDB metrics)
*   `GET /api/system/serverlogs` (Read active server log files)
*   `POST /api/system/backup` (Trigger system backup dump)
*   `POST /api/system/export` (Export dataset to Excel)
*   `GET /api/undo` | `POST /api/undo/:id` | `DELETE /api/undo/:id` (Restore soft-deleted items)
*   `GET /api/users` | `PUT /api/users/:id` | `DELETE /api/users/:id` (Direct user account management)
