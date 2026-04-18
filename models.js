// ═══════════════════════════════════════════════════════
//  EAMS — MongoDB Models (Mongoose)
//  Separate schemas: AdminSchema, TeacherSchema, StudentUserSchema
//  Legacy UserSchema kept for backward-compat auth lookup
// ═══════════════════════════════════════════════════════

const mongoose = require('mongoose');

// ── ADMIN User Schema ─────────────────────────────────
const AdminSchema = new mongoose.Schema({
  fullName:     { type: String, required: true, trim: true },
  firstName:    { type: String, default: '', trim: true },
  lastName:     { type: String, default: '', trim: true },
  employeeNo:   { type: String, default: '', trim: true },
  department:   { type: String, default: '', trim: true },
  email:        { type: String, default: '', lowercase: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:     { type: String, required: true },
  isAdmin:      { type: Boolean, default: true },
  adminRights:  { type: mongoose.Schema.Types.Mixed, default: 'all' },
  active:               { type: Boolean, default: true },
  mustChangePassword:   { type: Boolean, default: false },
  lastLogin:    { type: Date,   default: null },
  firstLogin:   { type: Date,   default: null },
  loginCount:   { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lockedUntil:  { type: Date,   default: null },
}, { timestamps: true });

// ── TEACHER User Schema ────────────────────────────────
const TeacherSchema = new mongoose.Schema({
  fullName:     { type: String, required: true, trim: true },
  firstName:    { type: String, default: '', trim: true },
  lastName:     { type: String, default: '', trim: true },
  employeeNo:   { type: String, default: '', trim: true },
  department:   { type: String, default: '', trim: true },
  designation:  { type: String, default: '', trim: true },
  email:        { type: String, default: '', lowercase: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:     { type: String, required: true },
  isHod:              { type: Boolean, default: false },
  HoddeptName:        { type: String,  default: '' },
  isClassAdvisor:     { type: Boolean, default: false },
  className:          { type: String,  default: '' },
  isTimeTableCoordinator: { type: Boolean, default: false },
  TTdeptName:         { type: String,  default: '' },
  isAdmin:            { type: Boolean, default: false },
  adminRights:        { type: mongoose.Schema.Types.Mixed, default: 'all' },
  active:               { type: Boolean, default: true },
  mustChangePassword:   { type: Boolean, default: false },
  lastLogin:    { type: Date,   default: null },
  firstLogin:   { type: Date,   default: null },
  loginCount:   { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lockedUntil:  { type: Date,   default: null },
}, { timestamps: true });

// ── STUDENT User Schema ────────────────────────────────
const StudentUserSchema = new mongoose.Schema({
  fullName:     { type: String, required: true, trim: true },
  firstName:    { type: String, default: '', trim: true },
  lastName:     { type: String, default: '', trim: true },
  registerNo:   { type: String, default: '', trim: true },
  class:        { type: String, default: '' },
  section:      { type: String, default: '' },
  branch:       { type: String, default: '' },
  course:       { type: String, default: '' },
  department:   { type: String, default: '' },
  currentSem:   { type: String, default: '' },
  currentYear:  { type: String, default: '' },
  academicYear: { type: String, default: '' },
  classAdvisorName: { type: String, default: '' },
  classAdvisorId: { type: String, default: '' },
  classRepName: { type: String, default: '' },
  classRepId: { type: String, default: '' },  
  classHallNo: { type: String, default: '' }, 
  
  email:        { type: String, default: '', lowercase: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:     { type: String, required: true },
  isRep:        { type: Boolean, default: false },
  active:               { type: Boolean, default: true },
  mustChangePassword:   { type: Boolean, default: false },
  lastLogin:    { type: Date,   default: null },
  firstLogin:   { type: Date,   default: null },
  loginCount:   { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lockedUntil:  { type: Date,   default: null },
}, { timestamps: true });

// ── LEGACY UserSchema ─────────────────────────────────
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
  isHOD:            { type: Boolean, default: false },
  HoddeptName:      { type: String,  default: '' },
  isClassAdvisor:   { type: Boolean, default: false },
  advisorClassId:   { type: String,  default: '' },
  advisorClassName: { type: String,  default: '' },
  isTimeTableCoordinator: { type: Boolean, default: false },
  TTdeptName:       { type: String,  default: '' },
  isWarden:         { type: Boolean, default: false },
  isExamCoordinator:{ type: Boolean, default: false },
  isPlacementCoord: { type: Boolean, default: false },
  qualifications:   { type: String,  default: '' },
  experience:       { type: String,  default: '' },
  joiningDate:      { type: String,  default: '' },
  isAdmin:      { type: Boolean, default: false },
  adminRights:  { type: mongoose.Schema.Types.Mixed, default: 'all' },
  isClassRep:       { type: Boolean, default: false },
  isAssiClassRep:   { type: Boolean, default: false },
  isSportsRep:      { type: Boolean, default: false },
  isCulturalRep:    { type: Boolean, default: false },
  bloodGroup:       { type: String,  default: '' },
  parentContact:    { type: String,  default: '' },
  address:          { type: String,  default: '' },
  lastLogin:        { type: Date,   default: null },
  firstLogin:       { type: Date,   default: null },
  loginCount:       { type: Number, default: 0 },
  failedLogins:     { type: Number, default: 0 },
  lockedUntil:      { type: Date,   default: null },
}, { timestamps: true });

const SessionSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:   { type: String, required: true },
  role:       { type: String, required: true },
  token:      { type: String, required: true, unique: true },
  ip:         { type: String, default: '' },
  userAgent:  { type: String, default: '' },
  createdAt:  { type: Date, default: Date.now, expires: 86400 },
  active:     { type: Boolean, default: true },
});

const SettingsSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  updatedBy: { type: String, default: 'admin' },
}, { timestamps: true });

const DepartmentSchema = new mongoose.Schema({
  name:    { type: String, required: true, unique: true, trim: true },
  code:    { type: String, required: true, unique: true, trim: true, uppercase: true },
  icon:    { type: String, default: '🏛️' },
  hodId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  hodName: { type: String, default: '' },
}, { timestamps: true });

const ClassSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  deptId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  deptName: { type: String, required: true },
  deptCode: { type: String, required: true },
  year:     { type: String, default: 'I Year' },
  sem:      { type: String, default: 'I' },
  section:  { type: String, default: 'A' },
  hallNo:   { type: String, default: '' },
}, { timestamps: true });

const StudentSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  regNo:        { type: String, required: true, unique: true, trim: true },
  academicYear: { type: String, default: '' },
  courseType:   { type: String, enum: ['UG','PG'], default: 'UG' },
  branch:       { type: String, enum: ['M.E','M.TECH','B.E','B.TECH'], default: '' },
  deptId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  deptName:     { type: String, default: '' },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  className:    { type: String, default: '' },
  year:         { type: String, default: '' },
  section:      { type: String, default: '' },
  email:        { type: String, default: '', lowercase: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

const SubjectSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  code:     { type: String, required: true, trim: true },
  credits:  { type: Number, default: 3 },
  type:     { type: String, enum: ['Theory','Lab','Project'], default: 'Theory' },
  deptId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  deptName: { type: String, default: '' },
  deptCode: { type: String, default: '' },
}, { timestamps: true });

const AssignmentSchema = new mongoose.Schema({
  subjectId:   { type: String, required: true },
  subjectName: { type: String },
  classId:     { type: String, required: true },
  className:   { type: String },
  teacherId:   { type: String, required: true },
  teacherName: { type: String },
  hallNo:      { type: String },          
  deptName:    { type: String },
  deptCode:    { type: String }
}, { timestamps: true });

const TimetableSchema = new mongoose.Schema({
  teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacherName:  { type: String, required: true },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  className:    { type: String, required: true },
  subjectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  subjectName:  { type: String, required: true },
  day:          { type: String, enum: ['Mon','Tue','Wed','Thu','Fri', 'Sat'], required: true },
  start:        { type: String, required: true },
  end:          { type: String, required: true },
}, { timestamps: true });

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
  markedAt:     { type: Date,   default: Date.now },
}, { timestamps: true });

const NotificationSchema = new mongoose.Schema({
  type:          { type: String, enum: ['request','error','info','attendance-alert'], default: 'request' },
  from:          { type: String, required: true },
  fromRole:      { type: String, default: 'Teacher' },
  toTeacherId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  toTeacherName: { type: String, default: '' },
  message:       { type: String, required: true },
  priority:      { type: String, enum: ['Normal','High','Urgent'], default: 'Normal' },
  status:        { type: String, enum: ['Pending','Solved','Cancelled'], default: 'Pending' },
  read:          { type: Boolean, default: false },
  grievanceId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Grievance', default: null },
  solvedAt:      { type: Date, default: null },
  cancelledAt:   { type: Date, default: null },
  time:          { type: Date, default: Date.now },
}, { timestamps: true });

const GrievanceSchema = new mongoose.Schema({
  teacherId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacherName: { type: String, required: true },
  subject:     { type: String, required: true },
  category:    { type: String, default: 'Other' },
  detail:      { type: String, required: true },
  status:      { type: String, enum: ['Pending','Resolved','Cancelled'], default: 'Pending' },
  resolvedBy:  { type: String, default: '' },
  resolvedAt:  { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });

const LogSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:  { type: String, required: true },
  role:      { type: String, default: 'admin' },
  action:    { type: String, required: true },
  details:   { type: String, default: '' },
  category:  { type: String, default: 'general' },
  severity:  { type: String, default: 'info' },
  ip:        { type: String, default: '' },
  sessionId: { type: String, default: '' },
  time:      { type: Date, default: Date.now },
}, { timestamps: true });

const UndoLogSchema = new mongoose.Schema({
  collectionName: { type: String, required: true },
  action:   { type: String, default: 'delete' },
  label:    { type: String, required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  deletedBy:{ type: String, default: 'admin' },
  expiresAt:{ type: Date, required: true },
}, { timestamps: true });
UndoLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LiveSessionSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  classId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  date:      { type: String, required: true },
  passcode:  { type: String, required: true },
  expiresAt: { type: Date, required: true },
  active:    { type: Boolean, default: true },
  markedStudents: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    regNo:     { type: String },
    time:      { type: Date, default: Date.now },
    ip:        { type: String }
  }]
}, { timestamps: true });

const SectionTimetableSchema = new mongoose.Schema({
  classId   : { type: mongoose.Schema.Types.ObjectId, ref:'Class', required:true, unique:true },
  className : String,
  deptId    : { type: mongoose.Schema.Types.ObjectId, ref:'Department' },
  deptName  : String,
  slots     : { type: mongoose.Schema.Types.Mixed, default:{} },
  updatedBy : String,
}, { timestamps:true });

// ── STUDENT TOKEN Schema (Token System) ──────────────────
const StudentTokenSchema = new mongoose.Schema({
  studentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  regNo:         { type: String, default: '' },
  studentName:   { type: String, default: '' },
  className:     { type: String, default: '' },
  semester:      { type: String, default: 'I' },
  tokens:        { type: Number, default: 50 },
  maxTokens:     { type: Number, default: 60 },
  initialTokens: { type: Number, default: 50 },
  // Cooldown timestamps — null = not on cooldown
  cooldowns: {
    overallColor:   { until: { type: Date, default: null } },
    overallPercent: { until: { type: Date, default: null } },
    theory:         { until: { type: Date, default: null } },
    lab:            { until: { type: Date, default: null } },
  },
  // Bonus cooldowns
  bonusCooldowns: {
    attendanceBonus: { until: { type: Date, default: null } },
    noLeave2w:       { until: { type: Date, default: null } },
    noLeave1m:       { until: { type: Date, default: null } },
  },
  // Block timestamps (from penalties)
  blocks: {
    overall: { until: { type: Date, default: null } },
    all:     { until: { type: Date, default: null } },
  },
  // Last check timestamps
  lastCheck: {
    overallColor:   { type: Date, default: null },
    overallPercent: { type: Date, default: null },
    theory:         { type: Date, default: null },
    lab:            { type: Date, default: null },
  },
  // Currently blocked feature names
  curBlocked: [{ type: String }],
  // Free check for <75% students
  freeCheckUsed:          { type: Boolean, default: false },
  freeCheckAvailableAfter:{ type: Date, default: null },
  // Transaction history
  history: [{
    action:  { type: String },   // 'spend','bonus','penalty','admin_adjust','free_check'
    feature: { type: String },   // 'overallColor','overallPercent','theory','lab',etc
    amount:  { type: Number },   // negative=spent, positive=gained
    balance: { type: Number },   // balance after this action
    reason:  { type: String, default: '' },
    date:    { type: Date, default: Date.now },
  }],
}, { timestamps: true });
StudentTokenSchema.index({ userId: 1 }, { unique: true });
StudentTokenSchema.index({ studentId: 1 }, { unique: true });

// ── LEAVE REQUEST Schema ─────────────────────────────────
const LeaveRequestSchema = new mongoose.Schema({
  studentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName:  { type: String, required: true },
  regNo:        { type: String, default: '' },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  className:    { type: String, default: '' },
  leaveDate:    { type: String, required: true },   // YYYY-MM-DD
  reason:       { type: String, required: true },
  status:       { type: String, enum: ['Pending','Approved','Rejected'], default: 'Pending' },
  teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  teacherName:  { type: String, default: '' },
  teacherNote:  { type: String, default: '' },
  isEmergency:  { type: Boolean, default: false },
  reviewedAt:   { type: Date, default: null },
}, { timestamps: true });
LeaveRequestSchema.index({ userId: 1, leaveDate: 1 });
LeaveRequestSchema.index({ teacherId: 1, status: 1 });

// ── STUDENT NOTIFICATION Schema ──────────────────────────
const StudentNotificationSchema = new mongoose.Schema({
  studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:       { type: String, enum: ['leave-response','token-bonus','token-penalty','unauthorized-absence','info'], default: 'info' },
  title:      { type: String, required: true },
  message:    { type: String, required: true },
  read:       { type: Boolean, default: false },
  time:       { type: Date, default: Date.now },
}, { timestamps: true });
StudentNotificationSchema.index({ userId: 1, read: 1 });

module.exports = {
  Admin:        mongoose.model('Admin',        AdminSchema),
  Teacher:      mongoose.model('Teacher',      TeacherSchema),
  StudentUser:  mongoose.model('StudentUser',  StudentUserSchema),
  User:         mongoose.model('User',         UserSchema),
  Session:      mongoose.model('Session',      SessionSchema),
  Settings:     mongoose.model('Settings',     SettingsSchema),
  Department:   mongoose.model('Department',   DepartmentSchema),
  Class:        mongoose.model('Class',        ClassSchema),
  Student:      mongoose.model('Student',      StudentSchema),
  Subject:      mongoose.model('Subject',      SubjectSchema),
  Assignment:   mongoose.model('Assignment',   AssignmentSchema),
  Timetable:    mongoose.model('Timetable',    TimetableSchema),
  Attendance:   mongoose.model('Attendance',   AttendanceSchema),
  Notification: mongoose.model('Notification', NotificationSchema),
  Grievance:    mongoose.model('Grievance',    GrievanceSchema),
  Log:          mongoose.model('Log',          LogSchema),
  UndoLog:      mongoose.model('UndoLog',      UndoLogSchema),
  LiveSession:  mongoose.model('LiveSession',  LiveSessionSchema),
  SectionTimetable : mongoose.model('SectionTimetable', SectionTimetableSchema),
  StudentToken:        mongoose.model('StudentToken',        StudentTokenSchema),
  LeaveRequest:        mongoose.model('LeaveRequest',        LeaveRequestSchema),
  StudentNotification: mongoose.model('StudentNotification', StudentNotificationSchema),
};
