## 🔹 v2.1.1 — 06 June 2026

### Forced Update

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

## 🔹 v2.1.0 — 05 May 2026

### Complete Update

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
## 🔹 v2.0.0 — 27 Apr 2026

### Complete Update

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
## 🔹 v1.1.0 — 27 Apr 2026

### Complete Update

### ✨ Added
- Introduced ChangeLog.md file
- All updates, changes, new features, bug fixes and other information will be logged in this file

### 📁 Files Changed
- `CHANGELOG.md` - New File Added

---------------------