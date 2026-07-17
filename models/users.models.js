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
  password:     { type: String, required: true, select: false },
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
  deptId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  deptCode:     { type: String, default: '', trim: true, uppercase: true },
  designation:  { type: String, default: '', trim: true },
  email:        { type: String, default: '', lowercase: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:     { type: String, required: true, select: false },
  trackId:      { type: String, trim: true, required:true },
  specials:[{
    option:     { type: String, enum: ['isHod', 'HodDeptTrackId', 'isClassAdvisor', 'ClassAdvisorTrackId', 
      'isTimeTableCoordinator', 'TTDeptTrackId', 'isWarden', 'isExamCoordinator', 'isPlacementCoordinator']},
    key:        { type: String },
    value:      { type: mongoose.Schema.Types.Mixed },
  }],
  isAdmin:            { type: Boolean, default: false },
  adminRights:        { type: [String], enum : ['all', 'controlPage', 'timetablePage', 'managePage', 'adderModule', 
    'deleteModule', 'bulkPage', 'settingsModule', 'none'], default: 'none' },
  mustChangePassword:   { type: Boolean, default: false },
}, { timestamps: true });

TeacherSchema.index({ deptId: 1 });

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
  batchTrackId:  { type: String, default: '', trim: true },  // like TR-BATCH-2630
  manageId:      { type: mongoose.Schema.Types.ObjectId, ref: 'DataManagement' },
  email:        { type: String, default: '', lowercase: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:     { type: String, required: true, select: false },
  trackId:      { type: String, trim: true, required:true },
  isRep:        { type: Boolean, default: false },
  mustChangePassword:   { type: Boolean, default: true },   // once changed, update to false
}, { timestamps: true });

StudentSchema.index({ deptId: 1 });
StudentSchema.index({ deptId: 1, classId: 1 });
StudentSchema.index({ deptId: 1, batchTrackId: 1 });
StudentSchema.index({ classId: 1, section: 1 });
StudentSchema.index({ fullName: 1 });
StudentSchema.index({ registerNo: 1 });

// ── UserSchema ─────────────────────────────────
const UserSchema = new mongoose.Schema({
  username:   { type: String, required: true, unique: true, trim: true, lowercase: true },
  role:       { type: String, enum: ['admin','teacher','student'], required: true },
  trackId:    { type: String,  unique: true, sparse: true },
  status:     { type: String, enum: ['active', 'inactive', 'locked'], default: 'active' },
  online:     { type: Boolean, default: false }, // to get currently active users count
}, { timestamps: true });

module.exports = {
    Admin:        mongoose.model('Admin', AdminSchema),
    Teacher:      mongoose.model('Teacher', TeacherSchema),
    Student:      mongoose.model('Student', StudentSchema),
    User:         mongoose.model('User', UserSchema),
};
