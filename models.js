// ═══════════════════════════════════════════════════════
//  EAMS — MongoDB Models (Mongoose)
// ═══════════════════════════════════════════════════════

// userId: trackId,
// subjectId: subjectCode,
// classId: className,
// deptId: code,

const mongoose = require('mongoose');
const { toIndianTime } = require('./utils/dateFormatter');

const IndianDate = {
  type: String,
  default: () => toIndianTime(new Date()),
  set: toIndianTime
};

const NullableIndianDate = {
  type: String,
  default: null,
  set: v => v ? toIndianTime(v) : null
};

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
  trackId:      { type: String, trim: true, required:true },
  isAdmin:      { type: Boolean, default: true },
  adminRights:  { type: mongoose.Schema.Types.Mixed, default: 'all' },
  mustChangePassword:   { type: Boolean, default: false },
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
  trackId:      { type: String, trim: true, required:true },
  specials:[{
    option:     { type: String, enum: ['isHod', 'HodDeptTrackId', 'isClassAdvisor', 'ClassAdvisorTrackId', 
      'isTimeTableCoordinator', 'TTDeptTrackId', 'isWarden', 'isExamCoordinator', 'isPlacementCoordinator']},
    key:        { type: String },
    value:      { type: mongoose.Schema.Types.Mixed },
  }],
  isAdmin:            { type: Boolean, default: false },
  adminRights:        { type: [String], enum : ['all', 'controlPage', 'timetablePage', 'managePage', 'adderModule', 
    'deleteModule', 'bulkPage', 'settingsModule', 'none'], default: 'all' },
  mustChangePassword:   { type: Boolean, default: false },
}, { timestamps: true });

// ── STUDENT User Schema ────────────────────────────────
const StudentSchema = new mongoose.Schema({
  fullName:     { type: String, required: true, trim: true },
  firstName:    { type: String, default: '', trim: true },
  lastName:     { type: String, default: '', trim: true },
  registerNo:   { type: String, default: '', trim: true },
  class:        { type: String, default: '' },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  section:      { type: String, default: '' },
  courseType:    { type: String, enum: ['None', 'UG','PG'], default: 'None'},
  branch:       { type: String, enum: ['None', 'M.E','M.TECH','B.E','B.TECH'], default: 'None' },
  department:   { type: String, default: '' },
  deptId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  admissionYear: { type: String, default: '' },   // like ADM-2025
  manageId:      { type: mongoose.Schema.Types.ObjectId, ref: 'DataManagement' },
  email:        { type: String, default: '', lowercase: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:     { type: String, required: true },
  trackId:      { type: String, trim: true, required:true },
  isRep:        { type: Boolean, default: false },
  mustChangePassword:   { type: Boolean, default: true },   // once changed, update to false
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual properties to dynamically fetch from DataManagement
StudentSchema.virtual('currentYear').get(function() {
  if (this.manageId && this.manageId.value) {
    return this.manageId.value.currentYear || '';
  }
  return '';
});

StudentSchema.virtual('currentSem').get(function() {
  if (this.manageId && this.manageId.value) {
    return this.manageId.value.currentSem || '';
  }
  return '';
});

StudentSchema.virtual('batch').get(function() {
  if (this.manageId && this.manageId.value) {
    return this.manageId.value.batch || '';
  }
  return '';
});

// ── UserSchema ─────────────────────────────────
const UserSchema = new mongoose.Schema({
  username:   { type: String, required: true, unique: true, trim: true, lowercase: true },
  role:       { type: String, enum: ['admin','teacher','student'], required: true },
  trackId:    { type: String,  unique: true, sparse: true },
  status:     { type: String, enum: ['active', 'inactive', 'locked'], default: 'active' },
  online:     { type: Boolean, default: false }, // to get currently active users count
}, { timestamps: true });

const LoginHistorySchema = new mongoose.Schema({
  username:   { type: String, required: true, trim: true, lowercase: true, unique: true},
  trackId:    { type: String,  unique: true, sparse: true },
  role:       { type: String, enum: ['student', 'teacher', 'admin'], required: true},
  firstLogin: NullableIndianDate,
  lastLogin:  NullableIndianDate,
  totalLogins: { type: Number, default: 0 },
  history: [{
    sessionId:  { type: String },
    time:       IndianDate,
    current:    { type: String, enum: ['Logged In', 'Logged Out'] },
    ip:         { type: String },
    userAgent:  { type: String },
    loginTime:  IndianDate,
    logoutTime: NullableIndianDate,
    deviceType: { type: String, enum: ['Desktop', 'Mobile', 'Tablet', 'Unknown'] },
    browser:    { type: String, enum: ['Chrome','Firefox','Edge','Safari','Opera','Brave','Other'] },
    os:         { type: String, enum: ['Windows','Linux','MacOS','Android','iOS','Other'] },
    status:     { type: String, enum: ['success', 'failed'] },
    
    authToken:  { type: String, required: true },
    createdAt:  IndianDate,
    expiresAt:  { type: String, required: true, set: toIndianTime },
    active:     { type: Boolean, required: true, default: false },
    lastActivity: IndianDate,
  }],
}, { timestamps: true });

const SettingsSchema = new mongoose.Schema({
  card:     { type: String, enum: ['Institution Details', 'Settings', 'Academic Settings',
     'Password Policy', 'System Utilities'] , required: true },
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  updatedBy: { type: String, required: true },
}, { timestamps: true });

const DepartmentSchema = new mongoose.Schema({
  name:            { type: String, required: true, unique: true, trim: true },
  code:            { type: String, required: true, unique: true, trim: true, uppercase: true },
  number:          { type: String, default: '', trim: true },         // 3-digit register code e.g. "104"
  twoLetterCode:   { type: String, default: '', trim: true, lowercase: true }, // e.g. "cs"
  threeLetterCode: { type: String, default: '', trim: true, uppercase: true }, // e.g. "CSE"
  hodId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  hodName: { type: String, default: '' },
  courseType:   { type: String, enum: ['UG','PG'], default: 'UG' },
  branch:       { type: String, enum: ['M.E','M.TECH','B.E','B.TECH'], default: 'B.E' },
}, { timestamps: true });

const ClassSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  deptId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  deptName: { type: String, required: true },
  deptCode: { type: String, required: true },
  year:     { type: String, required: true },
  batch:    { type: String, required: true },
  sem:      { type: String, required: true },
  section:  { type: String, required: true },
  hallNo:   { type: String, required: true },
}, { timestamps: true });


const SubjectSchema = new mongoose.Schema({
  subjectCode:  { type: String, required: true, trim: true, unique: true, sparse: true },
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
  trackId:      { type: String, required: true }, //teacherId
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
  trackId:      { type: String, required: true }, //teacherId
  teacherName:  { type: String, required: true },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  className:    { type: String, required: true },
  subjectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  subjectName:  { type: String, required: true },
  date:         { type: String, required: true },
  records: [{
    trackId:    { type: String, required: true }, //studentId
    studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    regNo:      { type: String },
    name:       { type: String },
    status:     { type: String, enum: ['present','absent'], required: true },
  }],
  totalPresent: { type: Number, default: 0 },
  totalAbsent:  { type: Number, default: 0 },
  markedAt:     IndianDate,
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
  solvedAt:      NullableIndianDate,
  cancelledAt:   NullableIndianDate,
  time:          IndianDate,
}, { timestamps: true });

const GrievanceSchema = new mongoose.Schema({
  teacherId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacherName: { type: String, required: true },
  subject:     { type: String, required: true },
  category:    { type: String, default: 'Other' },
  detail:      { type: String, required: true },
  status:      { type: String, enum: ['Pending','Resolved','Cancelled'], default: 'Pending' },
  resolvedBy:  { type: String, default: '' },
  resolvedAt:  NullableIndianDate,
  cancelledAt: NullableIndianDate,
}, { timestamps: true });

const LogSchema = new mongoose.Schema({
  userName:  { type: String, required: true },
  role:      { type: String, default: 'admin' },
  action:    { type: String, required: true },
  details:   { type: String, default: '' },
  category:  { type: String, default: 'general' },
  severity:  { type: String, default: 'info' },
  ip:        { type: String, default: '' },
  sessionId: { type: String, default: '' },
  time:      IndianDate,
}, { timestamps: true });

const UndoLogSchema = new mongoose.Schema({
  collectionName: { type: String, required: true },
  action:   { type: String, default: 'delete' },
  label:    { type: String, required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  deletedBy:{ type: String, default: 'admin' },
  expiresAt:{ type: String, required: true, set: toIndianTime },
}, { timestamps: true });
UndoLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LiveSessionSchema = new mongoose.Schema({
  trackId:   { type: String, required: true }, //teacherId
  classId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  date:      { type: String, required: true },
  passcode:  { type: String, required: true },
  expiresAt: { type: String, required: true, set: toIndianTime },
  active:    { type: Boolean, default: true },
  markedStudents: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    regNo:     { type: String },
    time:      IndianDate,
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

const DataManagementSchema = new mongoose.Schema({
  key: { type: String, unique: true }, // "ADM-2025"
  value: {
    currentSem: Number,
    currentYear: Number,
    batch: String,  
  },
  updatedBy : String,
}, { timestamps:true }); 

const editFieldHistory = new mongoose.Schema({
  editedModule : { type: String, required: true},
  editedField : { type: String, required: true},
  updatedBy : {
    role:     { type: String, required: true},
    username: { type: String, required: true},
    trackId:  { type: String, required: true},
  },
  time: IndianDate,
}, { timestamps:true });

// ── CALENDAR DAY Schema ───────────────────────────────
const CalendarDaySchema = new mongoose.Schema({
  date         : { type: String, required: true, unique: true }, // "YYYY-MM-DD"
  dayOfWeek    : { type: String, default: '' },                  // "Mon","Tue",…,"Sun"
  isWorkingDay : { type: Boolean, default: true },
  dayType      : { type: String, enum: ['regular','leave','holiday','exam','half-day','optional'], default: 'regular'},
  notes        : { type: String, default: '' },
  timing       : { start : { type: String, default: '08:30' }, end: { type: String, default: '16:30' }},
  affectedYears : { type: [String], default: [] },               // [] = ALL years
  isOverride    : { type: Boolean, default: false },             // admin explicitly set — skip bulk-generate
  markedBy      : { type: String, default: 'system' },
}, { timestamps: true });

// ── EXAM Schema ───────────────────────────────────────
const ExamSchema = new mongoose.Schema({
  title        : { type: String, required: true, trim: true },
  examType     : { type: String, enum: ['Internal1','Internal2','Practicals','Semester'], required: true },
  academicYear : { type: String, default: '' },
  studentYear  : { type: String, enum: ['I','II','III','IV','All'], default: 'All' },
  deptId       : { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  deptName     : { type: String, default: '' },
  startDate    : { type: String, required: true },
  endDate      : { type: String, required: true },
  timing       : { start : { type: String, default: '09:30' }, end: { type: String, default: '12:30' } },
  notes        : { type: String, default: '' },
  status       : { type: String, enum: ['upcoming','ongoing','completed','cancelled'], default: 'upcoming' },
  createdBy    : { type: String, default: 'admin' },
}, { timestamps: true });

// ── EXAM ATTENDANCE Schema ────────────────────────────
const ExamAttendanceSchema = new mongoose.Schema({
  examId       : { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  examTitle    : { type: String, default: '' },
  examType     : { type: String, default: '' },
  date         : { type: String, required: true },
  hallNo       : { type: String, required: true, trim: true },
  teacherId    : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacherName  : { type: String, required: true },
  records : [{
    studentId  : { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    regNo      : { type: String, required: true },
    name       : { type: String, default: '' },
    deptName   : { type: String, default: '' },
    year       : { type: String, default: '' },
    status     : { type: String, enum: ['present','absent'], default: 'present' }
  }],
  totalPresent : { type: Number, default: 0 },
  totalAbsent  : { type: Number, default: 0 },
  markedAt     : IndianDate
}, { timestamps: true });
ExamAttendanceSchema.index({ examId: 1, date: 1, hallNo: 1, teacherId: 1 }, { unique: true });

// ── MANAGE ADMIN Schema ───────────────────────────────
const ManageAdminSchema = new mongoose.Schema({
  name        : { type: String, required: true, trim: true },
  username    : { type: String, required: true, unique: true, trim: true, lowercase: true },
  password    : { type: String, required: true },
  email       : { type: String, default: '', lowercase: true, trim: true },
  active      : { type: Boolean, default: true },
  permissions : { type: [String], default: ['calendar','exam','attendance'] },
  addedBy     : { type: String, default: 'admin' },
  lastLogin   : NullableIndianDate,
}, { timestamps: true });

module.exports = {  
  Admin:            mongoose.model('Admin',             AdminSchema),
  Teacher:          mongoose.model('Teacher',           TeacherSchema),
  Student:          mongoose.model('Student',           StudentSchema),
  User:             mongoose.model('User',              UserSchema),
  LoginHistory:     mongoose.model('LoginHistory',      LoginHistorySchema),
  Settings:         mongoose.model('Settings',          SettingsSchema),
  Department:       mongoose.model('Department',        DepartmentSchema),
  Class:            mongoose.model('Class',             ClassSchema),
  Subject:          mongoose.model('Subject',           SubjectSchema),
  Assignment:       mongoose.model('Assignment',        AssignmentSchema),
  Timetable:        mongoose.model('Timetable',         TimetableSchema),
  Attendance:       mongoose.model('Attendance',        AttendanceSchema),
  Notification:     mongoose.model('Notification',      NotificationSchema),
  Grievance:        mongoose.model('Grievance',         GrievanceSchema),
  Log:              mongoose.model('Log',               LogSchema),
  UndoLog:          mongoose.model('UndoLog',           UndoLogSchema),
  LiveSession:      mongoose.model('LiveSession',       LiveSessionSchema),
  SectionTimetable: mongoose.model('SectionTimetable',  SectionTimetableSchema),
  DataManagement:   mongoose.model('DataManagement',    DataManagementSchema),
  editFieldHistory: mongoose.model('editFieldHistory',  editFieldHistory),
  CalendarDay:      mongoose.model('CalendarDay',       CalendarDaySchema),
  Exam:             mongoose.model('Exam',              ExamSchema),
  ExamAttendance:   mongoose.model('ExamAttendance',    ExamAttendanceSchema),
  ManageAdmin:      mongoose.model('ManageAdmin',       ManageAdminSchema),
};