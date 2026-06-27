const mongoose = require('mongoose');
const { toIndianTime } = require('../utils/dateFormatter');

// Reusable date type definitions for Indian timezone formatting
const IndianDate = { type: String, default: () => toIndianTime(new Date()) };
const NullableIndianDate = { type: String, default: null };

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
  CalendarDay:      mongoose.model('CalendarDay',       CalendarDaySchema),
  Exam:             mongoose.model('Exam',              ExamSchema),
  ManageAdmin:      mongoose.model('ManageAdmin',       ManageAdminSchema),
};