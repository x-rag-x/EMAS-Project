# EAMS — Electronic Attendance Management System
### Sri Shakthi Institute of Engineering & Technology

> A full-stack web application for managing student attendance, teacher assignments, departments, classes, and academic records. Built with Node.js, Express, MongoDB Atlas, and vanilla HTML/CSS/JS.

---

## Project Files — What Each File Does

### ✅ Required Files (Keep These)

| File | Role | Required |
|------|------|----------|
| `server.js` | Main Node.js/Express API server — handles all routes, auth, DB operations | ✅ Yes |
| `models.js` | MongoDB Mongoose schemas for all 13 collections | ✅ Yes |
| `config.js` | Reads environment variables, exports DB/auth/server config | ✅ Yes |
| `package.json` | Node.js dependencies and start scripts | ✅ Yes |
| `.env` | Secret environment variables (MongoDB URI, JWT secret) | ✅ Yes (never commit) |
| `.gitignore` | Prevents `.env` from being pushed to GitHub | ✅ Yes |
| `index.html` | Login page — Admin and Teacher sign-in with role selector | ✅ Yes |
| `admin.html` | Full admin dashboard — departments, classes, students, teachers, logs | ✅ Yes |
| `teacher.html` | Teacher portal — attendance marking, timetable, grievances | ✅ Yes |
| `bulk.html` | Bulk upload drawer (iframe inside admin) — dept/class/subject/student upload | ✅ Yes |
| `control.html` | System Control Panel — settings, maintenance mode, DB stats, data management | ✅ Yes |
| `asserts/logo.png` | Institution logo shown on login page | ✅ Yes |
| `railway.json` | Deployment config for Railway.app hosting | ✅ Yes (if deploying) |

### ⚠️ Development/Utility Files (Optional)

| File | Role | Required |
|------|------|----------|
| `testdb.js` | One-time utility to test MongoDB connection | ❌ Dev only |
| `reset-teacher.js` | Resets teacher password to `teacher123` if login is broken | ❌ Dev only |
| `package-lock.json` | Auto-generated npm lock file | ✅ Keep (ensures consistent installs) |

### ❌ Not Needed / Can Delete

| File | Reason |
|------|--------|
| Any `*.zip` backup files | Use Git instead |
| Any `test-*.js` scripts | Dev utilities only |

---

## Architecture Overview

```
EAMS/
├── index.html          ← Login page (served by Express)
├── admin.html          ← Admin dashboard
├── teacher.html        ← Teacher portal
├── bulk.html           ← Bulk upload drawer (loaded as iframe in admin)
├── control.html        ← System control panel
├── asserts/
│   └── logo.png        ← Institution logo
├── server.js           ← Express API + MongoDB logic
├── models.js           ← Mongoose schemas (13 collections)
├── config.js           ← Environment config reader
├── package.json        ← Node.js project definition
├── .env                ← Secrets (NOT committed to git)
├── .gitignore          ← Ignores .env
└── railway.json        ← Railway deployment config
```

**Data Flow:**
```
Browser (HTML) ──fetch()──→ Express API (server.js)
                                    │
                              JWT Auth Check
                              Session Verify (MongoDB)
                                    │
                              MongoDB Atlas (mongoose)
                                    │
                     ←── JSON response ──
```

---

## Prerequisites

Before setting up, make sure you have:

- **Node.js** v18 or higher — [Download](https://nodejs.org)
- **npm** v9 or higher (comes with Node.js)
- **MongoDB Atlas account** (free) — [Sign up](https://www.mongodb.com/cloud/atlas)
- **Git** (optional, for version control)

---

## Setup — Step by Step

### Step 1 — Get the Project

**Option A: Clone from GitHub**
```bash
git clone https://github.com/your-username/EAMS-Project.git
cd EAMS-Project
```

**Option B: Extract from ZIP**
```bash
# Extract the zip, then open the folder in VS Code
# Press Ctrl+` to open terminal
```

---

### Step 2 — Install Dependencies

Open a terminal in the project folder and run:

```bash
npm install
```

This installs: `express`, `mongoose`, `bcryptjs`, `jsonwebtoken`, `cors`, `dotenv`, `multer`, `xlsx`

---

### Step 3 — Set Up MongoDB Atlas

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) and sign in
2. Create a new **Free Cluster (M0)**
3. Under **Database Access** → Add a database user with username + password
4. Under **Network Access** → Add IP Address → type `0.0.0.0/0` (allow all)
5. Click **Connect** → **Drivers** → copy your connection string

It will look like:
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?appName=Cluster0
```

---

### Step 4 — Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Windows
copy .env.example .env

# Mac/Linux
cp .env.example .env
```

Edit `.env` with your actual values:

```env
MONGO_URI=mongodb+srv://youruser:yourpassword@cluster0.xxxxx.mongodb.net/?appName=Cluster0
DB_NAME=eams_db
JWT_SECRET=replace_this_with_a_long_random_string_min_32_chars
PORT=3000
```

> ⚠️ **Never commit `.env` to GitHub.** It's already in `.gitignore`.

---

### Step 5 — Fix DNS (if on college/office network)

If you're connecting from a restricted network (college WiFi), add this to your `server.js` top (already included):

```js
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);
```

Also, in Windows — change your network DNS to `8.8.8.8` (Google DNS) if MongoDB connection fails.

---

### Step 6 — Start the Server

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
# or
node server.js
```

On first run, the terminal will show:

```
✅ MongoDB connected → eams_db

┌──────────────────────────────────────────┐
│          EAMS DEFAULT CREDENTIALS         │
├──────────────────────────────────────────┤
│  ADMIN                                   │
│  Username : admin                        │
│  Password : admin123                     │
│  Status   : Must change password         │
├──────────────────────────────────────────┤
│  TEACHER                                 │
│  Username : teacher                      │
│  Password : teacher123                   │
│  Status   : Must change password         │
└──────────────────────────────────────────┘

🚀 EAMS API running → http://localhost:3000
```

> The displayed password is always the **current real password** fetched from MongoDB — if it has been changed, the new password appears here.

---

### Step 7 — Open the Application

Open your browser and go to:

```
http://localhost:3000
```

You will see the EAMS login page. Sign in with the credentials shown in the terminal.

---

## Default Credentials

| Role | Username | Password | Note |
|------|----------|----------|------|
| Admin | `admin` | `admin123` | Must change on first login |
| Teacher | `teacher` | `teacher123` | Must change on first login |

> Credentials are displayed in the terminal every time the server starts.

---

## Troubleshooting

### MongoDB connection fails
```
❌ MongoDB error: querySrv ECONNREFUSED
```
**Fix:** Change your DNS to `8.8.8.8`. In Windows PowerShell (run as admin):
```powershell
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses ("8.8.8.8","8.8.4.4")
```
Then test:
```bash
nslookup cluster0.xxxxx.mongodb.net
```

### Teacher login fails / Invalid credentials
The existing teacher account may have a broken password hash. Run:
```bash
node reset-teacher.js
```
This resets the teacher password to `teacher123` and lists all users in the DB.

### Server syntax error
```
SyntaxError: Unexpected end of input
```
**Fix:** Download a fresh `server.js` from the repository. The file may have been accidentally edited.

### MongoDB authentication failed
```
bad auth: authentication failed
```
**Fix:** Your MongoDB password changed. Go to Atlas → Database Access → Edit user → Reset password → update `.env` with the new connection string.

### Port already in use
```
Error: listen EADDRINUSE :::3000
```
**Fix:** Kill the existing process:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Mac/Linux
kill -9 $(lsof -ti:3000)
```

---

## First Time Setup Workflow

After logging in as Admin for the first time:

1. **Change password** — a popup will appear forcing a password change
2. **Go to Bulk Upload** → click **🚀 Setup Wizard** — guides you through in order:
   - Upload Departments (name, code, icon)
   - Upload Teachers (name, empId, dept, username, password)
   - Upload Classes (dept, hallNo, year, semester, section — name is auto-generated)
   - Upload Subjects (name, code, dept, credits, type)
   - Upload Students (fullname, regNo, dept, class, section, email, username)
3. **Assign Roles** — in Teachers page, click **🎓 Assign Roles** to set HOD and Class Advisors
4. **Go to Control Panel** → Basic Settings → fill in institution details

---

## Bulk Upload File Formats

All uploads accept `.xlsx`, `.xls`, or `.csv`.

### Departments
| Column | Required | Example |
|--------|----------|---------|
| DeptName | ✅ | Computer Science Engineering |
| Code | ✅ | CSE |
| Icon | — | 💻 |

### Teachers
| Column | Required | Example |
|--------|----------|---------|
| Name | ✅ | John Doe |
| EmployeeID | — | EMP001 |
| Department | — | CSE |
| Designation | — | Assistant Professor |
| Username | ✅ | johndoe |
| Password | — | teacher123 |

### Classes
| Column | Required | Example |
|--------|----------|---------|
| Department | ✅ | CSE |
| HallNo | — | LH01 |
| Year | — | I Year |
| Semester | ✅ | I |
| Section | ✅ | A |

> ClassName is auto-generated as `DEPTCODE-SEM-SECTION` (e.g. `CSE-I-A`)

### Subjects
| Column | Required | Example |
|--------|----------|---------|
| Name | ✅ | Data Structures |
| Code | ✅ | CS201 |
| Department | ✅ | CSE |
| Credits | — | 4 |
| Type | — | Theory / Lab / Elective |
| Teacher | — | John Doe |

### Students
| Column | Required | Example |
|--------|----------|---------|
| FullName | ✅ | Arun Kumar |
| RegisterNo | ✅ | CSE25001 |
| AcademicYear | — | 2025-26 |
| CourseType | — | UG |
| Branch | — | B.E |
| Department | ✅ | CSE |
| Year | — | I Year |
| Class | — | CSE-I-A |
| Section | — | A |
| Email | — | arun@eams.edu |
| Username | — | arun25 |
| Password | — | Student@123 |

---

## API Reference

### Authentication
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/login` | Public | Login, returns JWT token + sessionId |
| POST | `/api/auth/logout` | Any | Invalidates session in DB |
| POST | `/api/auth/change-password` | Any | Change own password |
| GET | `/api/auth/verify-session` | Any | Check if session is valid |

### Departments
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/api/departments` | Any |
| POST | `/api/departments` | Admin |
| PUT | `/api/departments/:id` | Admin |
| DELETE | `/api/departments/:id` | Admin |

> Alias routes: `/api/depts` (same as above)

### Classes, Subjects, Assignments, Timetable, Attendance
| Method | Endpoint | Access |
|--------|----------|--------|
| GET/POST | `/api/classes` | Any/Admin |
| GET/POST | `/api/subjects` | Any/Admin |
| GET/POST | `/api/assignments` | Any/Admin |
| GET/POST | `/api/timetable` | Any |
| GET/POST | `/api/attendance` | Any |
| GET | `/api/attendance/unmarked-teachers` | Admin |

### Students & Teachers
| Method | Endpoint | Access |
|--------|----------|--------|
| GET/POST | `/api/students` | Any/Admin |
| GET | `/api/students/count` | Any |
| POST | `/api/students/bulk-upload` | Admin |
| PUT/DELETE | `/api/students/:id` | Admin |
| GET/POST | `/api/teachers` | Admin |
| PUT/DELETE | `/api/teachers/:id` | Admin |

### Notifications & Grievances
| Method | Endpoint | Access |
|--------|----------|--------|
| GET/POST | `/api/notifications` | Any |
| PUT | `/api/notifications/:id` | Any |
| GET/POST | `/api/grievances` | Any |

### Settings & System
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/api/settings` | Admin |
| PUT | `/api/settings/:key` | Admin |
| POST | `/api/settings/verify-delete-password` | Admin |
| GET | `/api/logs` | Admin |
| DELETE | `/api/logs` | Admin |
| GET | `/api/dashboard/summary` | Admin |
| GET | `/api/system/dbstats` | Admin |
| GET | `/api/users` | Admin |
| PUT/DELETE | `/api/users/:id` | Admin |

### Authentication Header
All protected routes require:
```
Authorization: Bearer <jwt_token>
```

---

## Security Features

| Feature | Details |
|---------|---------|
| Password hashing | bcrypt with 10 rounds |
| JWT tokens | Expire in 8 hours |
| Session DB tracking | Every login creates a DB session; logout invalidates it |
| Account lockout | Locked for 15 minutes after 5 failed login attempts |
| Auto maintenance mode | Enabled automatically if brute-force attack detected |
| Right-click disabled | Context menu blocked on all pages |
| DevTools blocked | F12, Ctrl+Shift+I/J/C/K, Ctrl+U blocked |
| DevTools detection | Window size check — shows lock screen if devtools opened |
| Special delete password | Data Management in Control Panel requires extra password (`987543210`) |
| Force password change | Admin and teacher must change default password on first login |
| No text selection | `user-select:none` on all pages |

---

## MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `users` | Admin, teacher, and student login accounts |
| `sessions` | Active login sessions (auto-expire 24h) |
| `settings` | System configuration key-value store |
| `departments` | Academic departments |
| `classes` | Class sections (dept + semester + section) |
| `students` | Student records |
| `subjects` | Subject definitions |
| `assignments` | Teacher ↔ Class ↔ Subject links |
| `timetables` | Teacher schedule slots |
| `attendances` | Daily attendance records |
| `notifications` | Admin-teacher notification system |
| `grievances` | Teacher grievance submissions |
| `logs` | All system activity logs (login, data changes, security events) |

---

## Deployment — Railway.app

1. Push your project to a GitHub repository (without `.env`)
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repository
4. Add environment variables in Railway dashboard:
   ```
   MONGO_URI=mongodb+srv://...
   DB_NAME=eams_db
   JWT_SECRET=your_secret_here
   PORT=3000
   NODE_ENV=production
   ```
5. Railway uses `railway.json` automatically — start command is `node server.js`
6. Your app will be live at a `*.up.railway.app` URL

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | ✅ | `mongodb://localhost:27017/eams_db` | MongoDB connection string |
| `DB_NAME` | — | `eams_db` | Database name |
| `JWT_SECRET` | ✅ | `eams_jwt_secret_change_in_production` | JWT signing secret (change this!) |
| `JWT_EXPIRES_IN` | — | `8h` | Token expiry duration |
| `BCRYPT_ROUNDS` | — | `10` | bcrypt hashing rounds |
| `PORT` | — | `3000` | HTTP server port |
| `NODE_ENV` | — | `development` | Environment mode |
| `CORS_ORIGIN` | — | `http://localhost:5500` | Allowed CORS origin |

---

## Special Passwords

| Purpose | Password |
|---------|----------|
| Admin login | Set on first login change |
| Teacher login | Set on first login change |
| Control Panel data management | `987543210` (or your admin login password) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js v18+, Express.js v4 |
| Database | MongoDB Atlas (Mongoose ODM) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| File Upload | multer + xlsx |
| Hosting | Railway.app (or any Node.js host) |
| Fonts | Google Fonts (Poppins, Playfair Display) |
| Excel parsing | SheetJS (xlsx) via CDN |

---

## Contributing / Development

```bash
# Install dev dependencies (includes nodemon)
npm install

# Start with auto-restart
npm run dev

# Test DB connection only
node testdb.js
```

For code style: all JS uses `var`/`function` declarations (no ES6 modules in frontend for broad browser compatibility). Backend uses `const`/`async await`.

---

*Built for Sri Shakthi Institute of Engineering and Technology, Coimbatore.*