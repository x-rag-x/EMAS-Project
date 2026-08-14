const mongoose = require('mongoose');

const LoginHistorySchema = new mongoose.Schema({
  username:   { type: String, required: true, trim: true, lowercase: true, unique: true},
  trackId:    { type: String,  unique: true, sparse: true },
  role:       { type: String, enum: ['student', 'teacher', 'admin'], required: true},
  firstLogin: { type: Date },
  lastLogin:  { type: Date },
  totalLogins: { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lockedUntil:  { type: Date, default: null },
  history: [{
    sessionId:  { type: String },
    time:       { type: Date },
    current:    { type: String, enum: ['Logged In', 'Logged Out'] },
    ip:         { type: String },
    userAgent:  { type: String },
    loginTime:  { type: Date },
    logoutTime: { type: Date },
    deviceType: { type: String, enum: ['Desktop', 'Mobile', 'Tablet', 'Unknown'] },
    browser:    { type: String, enum: ['Chrome','Firefox','Edge','Safari','Opera','Brave','Other'] },
    os:         { type: String, enum: ['Windows','Linux','MacOS','Android','iOS','Other'] },
    status:     { type: String, enum: ['success', 'failed'] },
    
    authToken:  { type: String }, // SHA-256 hash of the JWT — raw token is never persisted
    createdAt:  { type: Date },
    expiresAt:  { type: Date },
    active:     { type: Boolean, default: false },
    lastActivity: { type: Date },
  }],
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
  solvedAt:      { type: Date },
  cancelledAt:   { type: Date },
  time:          { type: Date },
}, { timestamps: true });

const GrievanceSchema = new mongoose.Schema({
  teacherId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacherName: { type: String, required: true },
  subject:     { type: String, required: true },
  category:    { type: String, default: 'Other' },
  detail:      { type: String, required: true },
  status:      { type: String, enum: ['Pending','Resolved','Cancelled'], default: 'Pending' },
  resolvedBy:  { type: String, default: '' },
  resolvedAt:  { type: Date },
  cancelledAt: { type: Date },
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
  time:      { type: Date, default: Date.now },
}, { timestamps: true });

LogSchema.index({ createdAt: -1 });

const LiveSessionSchema = new mongoose.Schema({
  trackId:   { type: String, required: true }, //teacherId
  classId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  date:      { type: String, required: true },
  passcode:  { type: String, required: true },
  expiresAt: { type: String, required: true},
  active:    { type: Boolean, default: true },
  markedStudents: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    regNo:     { type: String },
    time:      { type: Date },
    ip:        { type: String }
  }]
}, { timestamps: true });

const ManageAdminSchema = new mongoose.Schema({
  trackId    : { type: String, required: true, unique: true},
  role       : { type: String, enum: ['admin','teacher']},
  permissions: { type: [String], default: ['calendar','exam','attendance'] },
  addedBy    : { type: String, required: true },
  createdAt  : { type: Date, default: Date.now },
  status     : { type: String, enum: ['active','inactive'], default: 'active' },
});

module.exports = {
  LoginHistory: mongoose.model('LoginHistory', LoginHistorySchema),
  Notification: mongoose.model('Notification', NotificationSchema),
  Grievance:    mongoose.model('Grievance',    GrievanceSchema),
  Log:          mongoose.model('Log',          LogSchema),
  LiveSession:  mongoose.model('LiveSession',  LiveSessionSchema),
  ManageAdmin:  mongoose.model('ManageAdmin', ManageAdminSchema),
};
