## 🔹 `v2.2.5` — 27 June 2026 *(Minor & Forced Update)*

### *General Changes & Fixes*
- `admin.html`
    - Fixed Teacher page API bug. Teacher details display fixed.

- `teacher.html`
    - My Profile fields + Assigned Classes empty.
    - Updated UI for new Attendance Method. Added PeriodNumber column **(bug exist)**
    - Tried to removed localStorage method completely. **(paritially)**

- `control.html`
    - Added new Collections in Db, reflecting it in control panel

- `attendance.routes.js` & other routes
    - Updated backend for new Attendance Method. `ClassAttendance`, `StudentAttendance` method. 

### *File Structure v2.0*
Each file has huge lines of code. Introduction of file structures will make it easy to understand the code and easy for file accessing. Version v2.0 brings `model.js` file separation.

#### Backend:
- `models/`
    - `attendance.models.js` - Reworked Attendance model, `AttendanceSchema` is now splited into `ClassAttendanceSchema` `StudentAttendanceSchema`.
    - `adders.models.js`, `admin.models.js`, `attendance.models.js`, `departments.models.js`, `exams.models.js`, `manage.models.js`, `timetable.models.js`, `users.models.js`

### `Total 19 Files changed and updated in v2.2.5`

----------------------------------

## 🔹 `v2.2.4` — 26 June 2026 (Complete Update)

### General Changes & Fixes
- `admin.html`
    - Tried to removed localStorage method completely. (paritially)
    - Reworked Add Teacher model.
    - Reworked trackId generation & last name spilter modal.
    - Edit Teacher modal in the Admin panel updated. (Still a bug exist)

- `student.html`
    - Updated Force Password Change menu.

- `model.js`
    - - Merged `SessionSchema` fields into `LoginHistorySchema`
    - Added `lastActivity` tracking field to session history in `LoginHistorySchema`.
    - Updated `TeacherSchema` specials options.
    - `UserSchema` updated and related apis.

- Added `/ping` POST endpoint in auth routes to report user activity and extend active sessions.
- Created `utils/sessionMonitor.js` to monitor active user sessions and handle auto-logout/extensions in the background.
- Updated authentication routes, middleware, and user/student/teacher routes to transition from the deprecated `active` boolean field to the new `status` enum field on `User`.
- Rewrote the client-side session checker in `services/logout.services.js` to perform backend-driven active session checks and pinging.
- Removed `start.js` from public directory.

### Introduction to File Structure v1.0 (new)
Each file has huge lines of code. Introduction of file structures will make it easy to understand the code and easy for file accessing. Version v1.0 brings `server.js` file separation.

#### Backend:
- Changes made:
    - `/config` - new dir contains - `index.js`, `db.js`.
    - `/middleware` - new dir contains - `auth.js`, `maintenance.js`.
    - `/routes` - new dir contains - `assignments.routes.js`, `attendance.routes.js`, `auth.routes.js`, `calendar.routes.js`, `classes.routes.js`, `dashboard.routes.js`, `departments.routes.js`, `examAttendance.routes.js`, `exams.routes.js`, `grievances.routes.js`, `index.js`, `liveSession.routes.js`, `logs.routes.js`, `manageAdmins.routes.js`, `notifications.routes.js`, `profile.routes.js`, `settings.routes.js`, `studentPortal.routes.js`, `students.routes.js`, `subjects.routes.js`, `system.routes.js`, `teachers.routes.js`, `timetable.routes.js`, `undo.routes.js`, `users.routes.js`.
    - `/utils` - new dir contains - `dateUtils.js`, `examUtils.js`, `logAction.js`, `serverState.js`.

    - `files/` - collections of files for readability. Project program files are now much easier to access and understand. Moved `CHANGELOG.MD` to `files/` directory.

### Security Improvements v1.0 
Made first step to improve logins and logouts. Introduction of `checkSessionExpiry()` function in all html files brings auto logout of user login after *45* minutes. This improvements needs more changes currently its at version 1, futher changes will include more improvements.

#### Login
- `checkSessionExpiry()` - auto logout of user login after *45* minutes.
- Improved backend api.

#### Logout
- `doLogut()` - completely reworked.
- Improved backend api.

### `Total 54 Files changed and updated in v2.2.4`

----------------------------------

## 🔹 `v2.2.0` — 14 June 2026 (Major Update)

### General Changes & Fixes
- `admin.html`
    - Deleted `pg-maintenance` an unused page.
    - `Add Subject` model bug fixed and improved user experience.
    - Fixed `No Student Found` and `No Teacher Found` messages bug  in Students and Teachers page - `initDB()` function fixed.
    - `Activity Log` page and `Analytics/Reports` No Data Found message bug fixed.
    - Add Class & Add Subject modal auto-select dept bug
    - `initAdminReports`, `tab('dept')`, `genDeptRpt()`, `genOverallRpt()`, `genStuRpt()`, `expAdminRpt('current','xlsx')`functions fixed.

- `models.js`
    - Removed `PasswordSchema`, `ManageSchema`, `StudentUserSchema` 
    - Added `LoginHistorySchema` for tracking login history.
    - Updated UserSchema, AdminSchema, TeacherSchema, StudentSchema, SettingsSchema and small changes made in models.
    - Default passwords are now refered from `.env` -> `config.js` file for more security.

- `server.js`
    - Seed Defaults(admin) to both UserSchema and AdminSchema, Moved M.Manage into settings menu. Changed all `M.User` to `M.user`. Fixed `StudentUser` and `Student`.
    - Delete password is redefined. 
    - Fixed Login (`api/auth/login`, `api/auth/change-password`) shifted `User` to respective user Schema.
    - `GET /api/students` and `GET /api/users` endpoints fixed and UserSchema changes.

- `control.html`
    - Updated with many settings in `control.html`. Each page, model and function has settings.
    - Added key label for more information.

### Manage Page (new)
A new Manage page is added to admin.html. This page defines College working days and exam dates. To Mark working days, leaves, holidays, and daily working timings and scheduling exams and track hall-wise attendance.

- Changes made:
    - `server.js` - `api/manage` endpoints for manage page.
    - `models.js` - `ManageSchema` added in models
    - `admin.html` - Reference added for `manage.html`.

----------------------------------

## 🔹 v2.1.1 — 06 June 2026 (Forced Update)

- `server.js`
    - Waste update, forgetten log of update :(.
    - Fixed Data management apis

- `control.html`
    - Fixed Data Management Page, Improved security in Data Management Page.
    - When logout, auto clears all browser caches.

- `index.html`
    - Removed default seeders (Teacher, Student) from db.

- `admin.html`
    - Reworked pages navigators
    - Fixing Empty data message(No data found.)

### ⚠️ Yet to Finish
- Add subject model bug.
- No student found, teacher found messages not display correctly.
- Activity log page bug.

----------------------------------

## 🔹 v2.1.0 — 05 May 2026 (Complete Update)

- `admin.html`
    - CSS converted to compact format.
    - Updated toast functions (`showToast`, `dbToast`)
    - Removed Old bulk Menu . 
- `bulk.html`
    - Remove 'Add Admin' Menu, Because No special admin id for any one.
    
### ✨ Added
- Add Clear button in Add Department Menu, Add Student Menu, Add Teacher Menu.

### 🔧 Updated
- Restructure with 2-digit code field in Add Department Menu
- Teacher trackId definition
- Changed showToast to dbToast for database actions.
- First step towards Setup wizard update.

### 🐛 Fixed
- Track Id generation bugs.

### ⚠️ Yet to Finish
- Bug in class & section page, clicking on department is not functioning

----------------------------------
## 🔹 v2.0.0 — 27 Apr 2026 (Complete Update)

### ✨ Added
- Introduction of Track ID generation
- Track ID column in teachers & students table
- In department menu, Hod trackId, CourseType, branch values added.
- Added Page loaders in `control.html` and `admin.html` files.
- Added Auto values updating in Add Student menu and Add department menu.

### 🔧 Updated
- Admin Track ID generation logic to allow department numbers
- Add department Menu updated.
- Shifted Bulk Menu to `bulk.html`.
- Complete changes in Add Student menu.

### 🐛 Fixed
- Fixed User Grid Page.
- Track ID generation error when department number used
- Missing trackId field in add teacher form
- Display issue with trackId values

### ⚠️ Yet to Finish
- Track Id generation bugs
- Add Clear button in Add Department Menu, Add Student Menu, Add Teacher Menu.
- Restructure with 2-digit code field in Add Department Menu


### 📁 Files Changed
- `admin.html` ------- `Complete changes`
- `server.js` -------- `Minor changes`
- `models.js` -------- `Minor changes`
- `bulk.html` -------- `Minor fixes`
- `control.html` ---- `Major fixes`  
<br><br>
----------------------
## 🔹 v1.1.0 — 27 Apr 2026 (Complete Update)

### ✨ Added
- Introduced ChangeLog.md file
- All updates, changes, new features, bug fixes and other information will be logged in this file

### 📁 Files Changed
- `CHANGELOG.md` - New File Added

---------------------