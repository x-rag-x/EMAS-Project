const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

function parseYearNum(val) {
  if (typeof val === 'number') return val;
  if (!val) return 1;
  const str = String(val).toUpperCase();
  if (str.includes('IV') || str === '4') return 4;
  if (str.includes('III') || str === '3') return 3;
  if (str.includes('II') || str === '2') return 2;
  if (str.includes('I') || str === '1') return 1;
  const num = parseInt(str, 10);
  return isNaN(num) ? 1 : num;
}

function parseSemNum(val) {
  if (typeof val === 'number') return val;
  if (!val) return 1;
  const str = String(val).toUpperCase();
  const romanMap = { VIII: 8, VII: 7, VI: 6, V: 5, IV: 4, III: 3, II: 2, I: 1 };
  for (const [r, n] of Object.entries(romanMap)) {
    if (str.includes(r)) return n;
  }
  const num = parseInt(str, 10);
  return isNaN(num) ? 1 : num;
}

function normalizeStatus(status) {
  if (!status) return 'P';
  const s = String(status).toUpperCase().trim();
  if (s === 'PRESENT' || s === 'P') return 'P';
  return 'AB';
}

async function syncStudentAttendanceCounters(studentTrackId, targetClassId) {
  try {
    const studentQuery = [];
    if (mongoose.isValidObjectId(studentTrackId)) {
      studentQuery.push({ _id: studentTrackId });
    }
    studentQuery.push({ trackId: studentTrackId });
    const student = await M.Student.findOne({ $or: studentQuery }).select('-password').lean();
    if (!student) return;

    const classId = targetClassId || student.classId || student.class;
    const classQuery = [classId];
    if (student.classId) classQuery.push(String(student.classId));
    if (student.class) classQuery.push(student.class);
    const uniqueClassIds = [...new Set(classQuery)];

    const classAttDocs = await M.ClassAttendance.find({ classId: { $in: uniqueClassIds } }).lean();

    const subjectStats = {}; // subjectTrackId -> { sem, classesHeld, classesAttended }
    for (const doc of classAttDocs) {
      for (const period of doc.periods || []) {
        const sid = period.subjectTrackId;
        if (!sid) continue;
        if (!subjectStats[sid]) {
          subjectStats[sid] = { subjectTrackId: sid, sem: doc.sem || 1, classesHeld: 0, classesAttended: 0 };
        }
        subjectStats[sid].classesHeld += 1;
        const stuRec = (period.records || []).find(r => r.studentTrackId === studentTrackId);
        if (stuRec && stuRec.status === 'P') {
          subjectStats[sid].classesAttended += 1;
        }
      }
    }

    const records = Object.values(subjectStats).map(st => ({
      ...st,
      updatedAt: new Date()
    }));

    await M.StudentAttendance.findOneAndUpdate(
      { studentTrackId },
      {
        $set: {
          batch: student.batch,
          departmentCode: student.deptCode || student.department,
          classId: String(classId),
          records
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (err) {
    console.error('Error syncing student attendance counter:', err);
  }
}

// GET /api/attendance — Query attendance records, returning flattened session rows for UI compatibility
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Require at least one filter to prevent unconstrained fetch
    if (!req.query.from && !req.query.to && !req.query.date && !req.query.classId && !req.query.teacherId) {
      return res.json([]);
    }

    const filter = {};
    if (req.query.classId) {
      filter.$or = [{ classId: req.query.classId }];
      // Also match if classId stored as ObjectId string
      const classQuery = [];
      if (mongoose.isValidObjectId(req.query.classId)) {
        classQuery.push({ _id: req.query.classId });
      }
      classQuery.push({ classTrackId: req.query.classId });
      classQuery.push({ name: req.query.classId });

      const cls = await M.Class.findOne({ $or: classQuery }).lean();
      if (cls) {
        filter.$or.push({ classId: String(cls._id) });
        if (cls.classTrackId) filter.$or.push({ classId: cls.classTrackId });
      }
    }

    if (req.query.date) {
      const d = new Date(req.query.date);
      const start = new Date(d.setUTCHours(0, 0, 0, 0));
      const end = new Date(d.setUTCHours(23, 59, 59, 999));
      filter.date = { $gte: start, $lte: end };
    } else if (req.query.from && req.query.to) {
      const start = new Date(req.query.from + 'T00:00:00.000Z');
      const end = new Date(req.query.to + 'T23:59:59.999Z');
      filter.date = { $gte: start, $lte: end };
    }

    const classAttDocs = await M.ClassAttendance.find(filter).sort({ date: -1 }).limit(100).lean();

    // Collect unique student trackIds from the actual attendance records
    const studentTrackIds = new Set();
    for (const doc of classAttDocs) {
      for (const period of doc.periods || []) {
        for (const rec of period.records || []) {
          if (rec.studentTrackId) studentTrackIds.add(rec.studentTrackId);
        }
      }
    }

    // Fetch only the students referenced in these records
    const allStudents = studentTrackIds.size > 0
      ? await M.Student.find({
          $or: [
            { trackId: { $in: Array.from(studentTrackIds) } },
            { _id: { $in: Array.from(studentTrackIds).filter(id => mongoose.isValidObjectId(id)) } }
          ]
        }).select('_id trackId fullName registerNo classId').lean()
      : [];
    
    const studentMap = new Map();
    allStudents.forEach(s => {
      studentMap.set(String(s._id), s);
      if (s.trackId) studentMap.set(s.trackId, s);
    });

    const allSubjects = await M.Subject.find().lean();
    const subjectMap = new Map();
    allSubjects.forEach(sub => {
      subjectMap.set(String(sub._id), sub);
      if (sub.subjectTrackId) subjectMap.set(sub.subjectTrackId, sub);
      if (sub.subjectCode) subjectMap.set(sub.subjectCode, sub);
    });

    const allClasses = await M.Class.find().lean();
    const classMap = new Map();
    allClasses.forEach(c => {
      classMap.set(String(c._id), c);
      if (c.classTrackId) classMap.set(c.classTrackId, c);
    });

    const flattened = [];
    for (const doc of classAttDocs) {
      const dateStr = doc.date ? new Date(doc.date).toISOString().split('T')[0] : '';
      const clsObj = classMap.get(doc.classId);
      const className = clsObj ? clsObj.name : doc.classId;

      for (const period of doc.periods || []) {
        if (req.query.teacherId && period.teacherTrackId !== req.query.teacherId) {
          // If teacherId filter passed, check if matches teacher trackId or user id
          let targetTrackId = null;
          if (mongoose.isValidObjectId(req.query.teacherId)) {
            const tDoc = await M.Teacher.findById(req.query.teacherId).select('-password').lean();
            if (tDoc) targetTrackId = tDoc.trackId;
          }
          if (!targetTrackId) {
            const uDoc = await M.User.findOne({ $or: [{ _id: req.query.teacherId }, { trackId: req.query.teacherId }] }).lean();
            if (uDoc) targetTrackId = uDoc.trackId;
          }
          if (targetTrackId && period.teacherTrackId !== targetTrackId) {
            continue;
          }
        }

        const subObj = subjectMap.get(period.subjectTrackId);
        const subjectName = subObj ? subObj.name : period.subjectTrackId;
        const subjectId = subObj ? String(subObj._id) : period.subjectTrackId;

        for (const rec of period.records || []) {
          const stuObj = studentMap.get(rec.studentTrackId);
          const studentId = stuObj ? String(stuObj._id) : rec.studentTrackId;
          const studentName = stuObj ? stuObj.fullName : rec.studentTrackId;
          const regNo = stuObj ? stuObj.registerNo : '';

          flattened.push({
            _id: doc._id,
            classId: doc.classId,
            className,
            subjectId,
            subjectTrackId: period.subjectTrackId,
            subjectName,
            teacherId: period.teacherTrackId,
            teacherName: period.markedBy,
            date: dateStr,
            periodNumbers: period.periodNumbers,
            studentId,
            studentTrackId: rec.studentTrackId,
            studentName,
            regNo,
            status: rec.status === 'P' ? 'present' : 'absent',
            rawStatus: rec.status,
          });
        }
      }
    }

    res.json(flattened);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance — Save or batch update class attendance
router.post('/', authMiddleware, async (req, res) => {
  try {
    const isBatch = Array.isArray(req.body.records);
    const rawRecords = isBatch ? req.body.records : [req.body];

    const classIdInput = req.body.classId || (rawRecords[0] && rawRecords[0].classId);
    const subjectIdInput = req.body.subjectId || (rawRecords[0] && rawRecords[0].subjectId);
    const dateInput = req.body.date || (rawRecords[0] && rawRecords[0].date) || new Date().toISOString().split('T')[0];
    const periodNumInput = Number(req.body.periodNumber || req.body.period || (rawRecords[0] && rawRecords[0].periodNumber)) || 1;

    if (!classIdInput || !subjectIdInput) {
      return res.status(400).json({ error: 'classId and subjectId are required' });
    }

    // Resolve Class
    const classQuery = [];
    if (mongoose.isValidObjectId(classIdInput)) {
      classQuery.push({ _id: classIdInput });
    }
    classQuery.push({ classTrackId: classIdInput });
    classQuery.push({ name: classIdInput });

    const cls = await M.Class.findOne({ $or: classQuery }).lean();
    const targetClassId = cls ? (cls.classTrackId || String(cls._id)) : classIdInput;
    const batch = cls ? cls.batch : '2025-2029';
    const year = cls ? parseYearNum(cls.year) : 1;
    const sem = cls ? parseSemNum(cls.sem) : 1;
    const departmentCode = cls ? (cls.deptCode || cls.deptName || 'GEN') : 'GEN';

    // Resolve Subject
    const subjectQuery = [];
    if (mongoose.isValidObjectId(subjectIdInput)) {
      subjectQuery.push({ _id: subjectIdInput });
    }
    subjectQuery.push({ subjectTrackId: subjectIdInput });
    subjectQuery.push({ subjectCode: subjectIdInput });
    subjectQuery.push({ name: subjectIdInput });

    const sub = await M.Subject.findOne({ $or: subjectQuery }).lean();
    const targetSubjectTrackId = sub ? (sub.subjectTrackId || sub.subjectCode || String(sub._id)) : subjectIdInput;

    // Resolve Teacher
    const teacherTrackId = req.user.trackId || String(req.user._id);
    const markedBy = req.user.username || req.user.fullName || req.user.name || 'Teacher';

    const referencedInputs = [...new Set(rawRecords.map(rec => rec.studentTrackId || rec.studentId).filter(Boolean))];
    const referencedObjectIds = referencedInputs.filter(id => mongoose.isValidObjectId(id));
    const allStudents = referencedInputs.length
      ? await M.Student.find({
          $or: [
            { trackId: { $in: referencedInputs } },
            ...(referencedObjectIds.length ? [{ _id: { $in: referencedObjectIds } }] : [])
          ]
        }).select('-password').lean()
      : [];
    const studentLookup = new Map();
    allStudents.forEach(s => {
      studentLookup.set(String(s._id), s);
      if (s.trackId) studentLookup.set(s.trackId, s);
    });

    const formattedRecords = [];
    const affectedTrackIds = new Set();

    for (const rec of rawRecords) {
      const sInput = rec.studentTrackId || rec.studentId;
      const stuObj = studentLookup.get(sInput);
      const studentTrackId = stuObj ? (stuObj.trackId || String(stuObj._id)) : sInput;
      const status = normalizeStatus(rec.status);
      if (studentTrackId) {
        formattedRecords.push({ studentTrackId, status });
        affectedTrackIds.add(studentTrackId);
      }
    }

    // Normalize session date to UTC midnight
    const sessionDate = new Date(dateInput + 'T00:00:00.000Z');

    // Find or create ClassAttendance document for this class and date
    let classAttDoc = await M.ClassAttendance.findOne({
      classId: targetClassId,
      date: {
        $gte: new Date(dateInput + 'T00:00:00.000Z'),
        $lte: new Date(dateInput + 'T23:59:59.999Z')
      }
    });

    const periodObj = {
      periodNumbers: [periodNumInput],
      subjectTrackId: targetSubjectTrackId,
      teacherTrackId,
      markedBy,
      markedAt: new Date(),
      records: formattedRecords
    };

    if (classAttDoc) {
      // Check if period for this subject and period number already exists
      const existingPeriodIdx = classAttDoc.periods.findIndex(p =>
        p.subjectTrackId === targetSubjectTrackId && p.periodNumbers.includes(periodNumInput)
      );
      if (existingPeriodIdx !== -1) {
        classAttDoc.periods[existingPeriodIdx] = periodObj;
      } else {
        classAttDoc.periods.push(periodObj);
      }
      classAttDoc.updatedAt = new Date();
      await classAttDoc.save();
    } else {
      classAttDoc = await M.ClassAttendance.create({
        batch,
        year,
        sem,
        classId: targetClassId,
        departmentCode,
        date: sessionDate,
        periods: [periodObj],
        isFinalized: false
      });
    }

    // Sync student counters asynchronously
    for (const stTrackId of affectedTrackIds) {
      await syncStudentAttendanceCounters(stTrackId, targetClassId);
    }

    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Attendance Marked', `Class ${targetClassId} on ${dateInput} Period ${periodNumInput}`, 'attendance', 'info', req.ip);

    res.status(201).json({ ok: true, classAttendanceId: classAttDoc._id, savedCount: formattedRecords.length });
  } catch (err) {
    console.error('Error saving attendance:', err);
    res.status(400).json({ error: err.message });
  }
});

// Bulk delete all attendance (admin only)
router.delete('/all', authMiddleware, adminOnly, async (req, res) => {
  try {
    const res1 = await M.ClassAttendance.deleteMany({});
    const res2 = await M.StudentAttendance.deleteMany({});
    await logAction(req.user.trackId || req.user._id, req.user.name, req.user.role, 'Attendance Cleared', `Deleted ${res1.deletedCount} class sessions`, 'data', 'warning', req.ip);
    res.json({ deleted: res1.deletedCount + res2.deletedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete single session/record
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await M.ClassAttendance.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/unmarked-teachers', authMiddleware, adminOnly, async (req, res) => {
  try {
    const today = new Date(), monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekDates = Array.from({ length: 5 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d.toISOString().split('T')[0]; });
    const assignments = await M.Assignment.find().lean();
    const classAttDocs = await M.ClassAttendance.find().lean();

    const unmarked = [];
    for (const a of assignments) {
      const markedDates = [];
      for (const doc of classAttDocs) {
        const docDateStr = doc.date ? new Date(doc.date).toISOString().split('T')[0] : '';
        if (doc.classId === a.classId || doc.classId === a.classTrackId) {
          for (const p of doc.periods || []) {
            if (p.teacherTrackId === a.teacherId || p.teacherTrackId === a.teacherTrackId) {
              markedDates.push(docDateStr);
            }
          }
        }
      }
      const missingDays = weekDates.filter(d => !markedDates.includes(d));
      if (missingDays.length > 0) unmarked.push({ ...a, missingDays, missingCount: missingDays.length });
    }
    res.json(unmarked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;