// ═══════════════════════════════════════════════════════
//  EAMS — MongoDB Models (Mongoose)
// ═══════════════════════════════════════════════════════

const mongoose = require('mongoose');

// ── Users (Admin + Teacher + Student login) ───────────
const UserSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  username:   { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:   { type: String, required: true },
  role:       { type: String, enum: ['admin','teacher','student'], required: true },
  empId:      { type: String, default: '' },
  dept:       { type: String, default: '' },
  desig:      { type: String, default: 'Assistant Professor' },
  email:      { type: String, default: '', lowercase: true },
  phone:      { type: String, default: '' },
  regNo:      { type: String, default: '' },
  deptName:   { type: String, default: '' },
  active:             { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  // Teacher-specific fields
  isHOD:            { type: Boolean, default: false },
  isClassAdvisor:   { type: Boolean, default: false },
  advisorClassId:   { type: String, default: '' },
  advisorClassName: { type: String, default: '' },
  isWarden:         { type: Boolean, default: false },
  isExamCoordinator:{ type: Boolean, default: false },
  isPlacementCoord: { type: Boolean, default: false },
  qualifications:   { type: String, default: '' },
  experience:       { type: String, default: '' },
  joiningDate:      { type: String, default: '' },
  // Student-specific fields
  isClassRep:       { type: Boolean, default: false },
  isAssiClassRep:   { type: Boolean, default: false },
  isSportsRep:      { type: Boolean, default: false },
  isCulturalRep:    { type: Boolean, default: false },
  bloodGroup:       { type: String, default: '' },
  parentContact:    { type: String, default: '' },
  address:          { type: String, default: '' },
  // Session tracking
  lastLogin:        { type: Date, default: null },
  loginCount:       { type: Number, default: 0 },
  failedLogins:     { type: Number, default: 0 },
  lockedUntil:      { type: Date, default: null },
}, { timestamps: true });

// ── Session Tokens ─────────────────────────────────────
const SessionSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:   { type: String, required: true },
  role:       { type: String, required: true },
  token:      { type: String, required: true, unique: true },
  ip:         { type: String, default: '' },
  userAgent:  { type: String, default: '' },
  createdAt:  { type: Date, default: Date.now, expires: 86400 }, // auto-delete after 24h
  active:     { type: Boolean, default: true },
});

// ── Settings ───────────────────────────────────────────
const SettingsSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  updatedBy: { type: String, default: 'admin' },
}, { timestamps: true });

// ── Departments ──────────────────────────────────────
const DepartmentSchema = new mongoose.Schema({
  name:       { type: String, required: true, unique: true, trim: true },
  code:       { type: String, required: true, unique: true, trim: true, uppercase: true },
  icon:       { type: String, default: '🏛️' },
  hodId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  hodName:    { type: String, default: '' },
}, { timestamps: true });

// ── Classes ──────────────────────────────────────────
const ClassSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  deptId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  deptName:   { type: String, required: true },
  deptCode:   { type: String, required: true },
  year:       { type: String, default: 'I Year' },
  sem:        { type: String, default: 'I' },
  section:    { type: String, default: 'A' },
  hallNo:     { type: String, default: '' },
}, { timestamps: true });

// ── Students ─────────────────────────────────────────
const StudentSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  regNo:        { type: String, required: true, unique: true, trim: true },
  academicYear: { type: String, default: '2025-26' },
  courseType:   { type: String, enum: ['UG','PG','M.E','M.TECH','MBA','MCA','B.E','B.TECH'], default: 'UG' },
  branch:       { type: String, default: '' },
  deptId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  deptName:     { type: String, default: '' },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  className:    { type: String, default: '' },
  year:         { type: String, default: '' },
  section:      { type: String, default: 'A' },
  email:        { type: String, default: '', lowercase: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// ── Subjects ─────────────────────────────────────────
const SubjectSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  code:       { type: String, required: true, trim: true },
  credits:    { type: Number, default: 3 },
  type:       { type: String, enum: ['Theory','Lab','Project'], default: 'Theory' },
  deptId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  deptName:   { type: String, default: '' },
  deptCode:   { type: String, default: '' },
}, { timestamps: true });

// ── Assignments ──────────────────────────────────────
const AssignmentSchema = new mongoose.Schema({
  teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacherName:  { type: String, required: true },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  className:    { type: String, required: true },
  subjectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  subjectName:  { type: String, required: true },
  deptId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  deptName:     { type: String, default: '' },
}, { timestamps: true });

// ── Timetable ─────────────────────────────────────────
const TimetableSchema = new mongoose.Schema({
  teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacherName:  { type: String, required: true },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  className:    { type: String, required: true },
  subjectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  subjectName:  { type: String, required: true },
  day:          { type: String, enum: ['Mon','Tue','Wed','Thu','Fri'], required: true },
  start:        { type: String, required: true },
  end:          { type: String, required: true },
}, { timestamps: true });

// ── Attendance ────────────────────────────────────────
const AttendanceSchema = new mongoose.Schema({
  teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacherName:  { type: String, required: true },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  className:    { type: String, required: true },
  subjectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  subjectName:  { type: String, required: true },
  date:         { type: String, required: true },
  records: [{
    studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    regNo:      { type: String },
    name:       { type: String },
    status:     { type: String, enum: ['present','absent'], required: true },
  }],
  totalPresent: { type: Number, default: 0 },
  totalAbsent:  { type: Number, default: 0 },
  markedAt:     { type: Date, default: Date.now },
}, { timestamps: true });

// ── Notifications ─────────────────────────────────────
const NotificationSchema = new mongoose.Schema({
  type:         { type: String, enum: ['request','error','info','attendance-alert'], default: 'request' },
  from:         { type: String, required: true },
  fromRole:     { type: String, default: 'Teacher' },
  toTeacherId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  toTeacherName:{ type: String, default: '' },
  message:      { type: String, required: true },
  priority:     { type: String, enum: ['Normal','High','Urgent'], default: 'Normal' },
  status:       { type: String, enum: ['Pending','Solved','Cancelled'], default: 'Pending' },
  read:         { type: Boolean, default: false },
  grievanceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Grievance', default: null },
  solvedAt:     { type: Date, default: null },
  cancelledAt:  { type: Date, default: null },
  time:         { type: Date, default: Date.now },
}, { timestamps: true });

// ── Grievances ────────────────────────────────────────
const GrievanceSchema = new mongoose.Schema({
  teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacherName:  { type: String, required: true },
  subject:      { type: String, required: true },
  category:     { type: String, default: 'Other' },
  detail:       { type: String, required: true },
  status:       { type: String, enum: ['Pending','Resolved','Cancelled'], default: 'Pending' },
  resolvedBy:   { type: String, default: '' },
  resolvedAt:   { type: Date, default: null },
  cancelledAt:  { type: Date, default: null },
}, { timestamps: true });

// ── Activity Logs ─────────────────────────────────────
const LogSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:     { type: String, required: true },
  role:         { type: String, default: 'admin' },
  action:       { type: String, required: true },
  details:      { type: String, default: '' },
  category:     { type: String, default: 'general' }, // login/data/settings/security/attendance
  severity:     { type: String, default: 'info' },    // info/warning/critical
  ip:           { type: String, default: '' },
  sessionId:    { type: String, default: '' },
  time:         { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = {
  User:        mongoose.model('User',        UserSchema),
  Session:     mongoose.model('Session',     SessionSchema),
  Settings:    mongoose.model('Settings',    SettingsSchema),
  Department:  mongoose.model('Department',  DepartmentSchema),
  Class:       mongoose.model('Class',       ClassSchema),
  Student:     mongoose.model('Student',     StudentSchema),
  Subject:     mongoose.model('Subject',     SubjectSchema),
  Assignment:  mongoose.model('Assignment',  AssignmentSchema),
  Timetable:   mongoose.model('Timetable',   TimetableSchema),
  Attendance:  mongoose.model('Attendance',  AttendanceSchema),
  Notification:mongoose.model('Notification',NotificationSchema),
  Grievance:   mongoose.model('Grievance',   GrievanceSchema),
  Log:         mongoose.model('Log',         LogSchema),
};
