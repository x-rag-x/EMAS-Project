# EAMS – Electronic Attendance Management System
### Sri Shakthi Institute of Engineering & Technology

---

## Project Structure

```
eams/
├── index.html          # Login page (Admin + Teacher)
├── admin.html          # Admin dashboard
├── teacher.html        # Teacher portal
└── backend/
    ├── server.js       # Express API server
    ├── models.js       # MongoDB/Mongoose schemas
    ├── config.js       # Configuration (reads .env)
    ├── package.json    # Node.js dependencies
    ├── .env.example    # Environment variable template
    └── README.md       # This file
```

---

## Quick Start (Frontend Only)

No setup needed. Open `index.html` in a browser or use Live Server in VS Code.

**Default credentials:**
| Role    | Username  | Password   |
|---------|-----------|------------|
| Admin   | `admin`   | `admin123` |
| Teacher | `teacher` | `teacher`  |

Data is stored in browser `localStorage` under the `ss3_` prefix.

---

## Backend Setup (MongoDB)

### 1. Prerequisites
- Node.js v18+
- MongoDB v6+ (local) or a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster

### 2. Install dependencies
```bash
cd backend
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and set your `MONGO_URI`:
```env
# Local MongoDB
MONGO_URI=mongodb://localhost:27017/eams_db

# MongoDB Atlas
MONGO_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/eams_db

JWT_SECRET=your_long_random_secret_here
PORT=3000
```

### 4. Start the server
```bash
npm run dev    # development (auto-restart with nodemon)
npm start      # production
```

The server will:
- Connect to MongoDB
- Seed a default admin account (`admin` / `admin123`) if none exists
- Serve the frontend files from the parent directory
- Start on `http://localhost:3000`

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (returns JWT token) |
| POST | `/api/auth/change-password` | Change password |

### Collections
| Method | Endpoint | Auth |
|--------|----------|------|
| GET/POST | `/api/departments` | Any |
| PUT/DELETE | `/api/departments/:id` | Admin |
| GET/POST | `/api/classes` | Any |
| GET/POST | `/api/students` | Any |
| POST | `/api/students/bulk-upload` | Admin |
| GET/POST | `/api/teachers` | Admin |
| GET/POST | `/api/subjects` | Any |
| GET/POST | `/api/assignments` | Any |
| GET/POST | `/api/timetable` | Any |
| GET/POST | `/api/attendance` | Any |
| GET | `/api/attendance/unmarked-teachers` | Admin |
| GET/POST | `/api/notifications` | Any |
| PUT | `/api/notifications/:id` | Any |
| GET/POST | `/api/grievances` | Any |
| GET | `/api/logs` | Admin |
| GET | `/api/dashboard/summary` | Admin |

### Authentication
All protected routes require:
```
Authorization: Bearer <jwt_token>
```

---

## Bulk Student Upload Format

Upload `.xlsx`, `.xls`, or `.csv` with these columns:

| Column | Required | Notes |
|--------|----------|-------|
| FullName | ✅ | Student full name |
| RegisterNo | ✅ | Unique register number |
| AcademicYear | — | e.g. `2025-26` |
| CourseType | — | `UG` or `PG` |
| Branch | — | e.g. `B.E`, `B.Tech` |
| Department | ✅ | Must match existing dept name or code |
| Year | — | e.g. `I Year` |
| Class | — | e.g. `CSE-I-A` |
| Section | — | Default: `A` |
| Email | — | Validated format |
| Username | — | Creates login account if provided |
| Password | — | Default: `Student@123` |

---

## Connecting Frontend to Backend

The frontend currently uses `localStorage` as its DB. To switch to the MongoDB backend:

1. Start the backend server (`npm run dev`)
2. In each HTML file, replace the `DB` helper calls with `fetch()` calls to the API
3. Store the JWT token from login in `sessionStorage` and include it in all requests

Example login integration:
```javascript
// In index.html doSignIn()
const res = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password, role: selectedRole })
});
const data = await res.json();
if (data.token) {
  sessionStorage.setItem('eams_token', data.token);
  sessionStorage.setItem('eams_user', JSON.stringify(data.user));
  window.location.href = selectedRole === 'teacher' ? 'teacher.html' : 'admin.html';
}
```

---

## Security Notes

- Passwords are hashed with **bcrypt** (10 rounds by default)
- JWT tokens expire after **8 hours** by default
- Never commit `.env` to version control
- Change `JWT_SECRET` to a long random string in production
- Use HTTPS in production
- Set `CORS_ORIGIN` to your actual frontend domain in production
