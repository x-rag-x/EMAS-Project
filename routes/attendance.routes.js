const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const { attendanceClearLimiter } = require('../utils/rateLimiters');
const { sanitizeToString } = require('../utils/sanitizeQuery');
const { checkAttendanceMarkGuard, getCachedSettings } = require('../middleware/portalGuard');

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

// GET /api/attendance — Query attendance records, returning flattened session rows with search, filters & pagination
router.get('/', authMiddleware, async (req, res) => {
  try {
    const qFrom = sanitizeToString(req.query.from);
    const qTo = sanitizeToString(req.query.to);
    const qDate = sanitizeToString(req.query.date);
    const qClassId = sanitizeToString(req.query.classId);
    const qTeacherId = sanitizeToString(req.query.teacherId);
    const qStatus = sanitizeToString(req.query.status);
    const qSearch = sanitizeToString(req.query.search);
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limitParam = req.query.limit;
    const limit = (limitParam === '0' || limitParam === 'all') ? 0 : Math.max(1, parseInt(limitParam || '50', 10));

    const filter = {};
    if (qClassId && qClassId !== 'all') {
      filter.$or = [{ classId: qClassId }];
      const classQuery = [];
      if (mongoose.isValidObjectId(qClassId)) {
        classQuery.push({ _id: qClassId });
      }
      classQuery.push({ classTrackId: qClassId });
      classQuery.push({ name: qClassId });

      const cls = await M.Class.findOne({ $or: classQuery }).lean();
      if (cls) {
        filter.$or.push({ classId: String(cls._id) });
        if (cls.classTrackId) filter.$or.push({ classId: cls.classTrackId });
      }
    }

    if (qDate) {
      const d = new Date(qDate);
      const start = new Date(d.setUTCHours(0, 0, 0, 0));
      const end = new Date(d.setUTCHours(23, 59, 59, 999));
      filter.date = { $gte: start, $lte: end };
    } else if (qFrom && qTo) {
      const start = new Date(qFrom + 'T00:00:00.000Z');
      const end = new Date(qTo + 'T23:59:59.999Z');
      filter.date = { $gte: start, $lte: end };
    }

    // Query recent class attendance docs
    const classAttDocs = await M.ClassAttendance.find(filter).sort({ date: -1 }).limit(300).lean();

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
        }).select('_id trackId fullName registerNo classId department deptCode').lean()
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

    let flattened = [];
    for (const doc of classAttDocs) {
      const dateStr = doc.date ? new Date(doc.date).toISOString().split('T')[0] : '';
      const clsObj = classMap.get(doc.classId);
      const className = clsObj ? clsObj.name : doc.classId;

      for (let pIdx = 0; pIdx < (doc.periods || []).length; pIdx++) {
        const period = doc.periods[pIdx];
        if (qTeacherId && period.teacherTrackId !== qTeacherId) {
          let targetTrackId = null;
          if (mongoose.isValidObjectId(qTeacherId)) {
            const tDoc = await M.Teacher.findById(qTeacherId).select('-password').lean();
            if (tDoc) targetTrackId = tDoc.trackId;
          }
          if (!targetTrackId) {
            const uDoc = await M.User.findOne({ $or: [{ _id: qTeacherId }, { trackId: qTeacherId }] }).lean();
            if (uDoc) targetTrackId = uDoc.trackId;
          }
          if (targetTrackId && period.teacherTrackId !== targetTrackId) {
            continue;
          }
        }

        const subObj = subjectMap.get(period.subjectTrackId);
        const subjectName = subObj ? subObj.name : period.subjectTrackId;
        const subjectId = subObj ? String(subObj._id) : period.subjectTrackId;

        for (let rIdx = 0; rIdx < (period.records || []).length; rIdx++) {
          const rec = period.records[rIdx];
          const stuObj = studentMap.get(rec.studentTrackId);
          const studentId = stuObj ? String(stuObj._id) : rec.studentTrackId;
          const studentName = stuObj ? stuObj.fullName : rec.studentTrackId;
          const regNo = stuObj ? stuObj.registerNo : '';
          const department = stuObj ? (stuObj.department || stuObj.deptCode || '') : (doc.departmentCode || '');

          const statusText = rec.status === 'P' ? 'present' : (rec.status === 'OD' ? 'od' : (rec.status === 'LEAVE' ? 'leave' : 'absent'));

          flattened.push({
            _id: `${doc._id}_${pIdx}_${rIdx}`,
            docId: doc._id,
            periodIndex: pIdx,
            recordIndex: rIdx,
            classId: doc.classId,
            className,
            department,
            subjectId,
            subjectTrackId: period.subjectTrackId,
            subjectName,
            teacherId: period.teacherTrackId,
            teacherName: period.markedBy || 'Faculty',
            date: dateStr,
            periodNumber: period.periodNumber || (period.periodNumbers ? period.periodNumbers[0] : 1),
            periodNumbers: period.periodNumbers,
            studentId,
            studentTrackId: rec.studentTrackId,
            studentName,
            regNo,
            status: statusText,
            rawStatus: rec.status,
            remarks: rec.remarks || period.topic || '',
          });
        }
      }
    }

    // Status filter
    if (qStatus && qStatus !== 'all') {
      const targetStat = qStatus.toLowerCase().trim();
      flattened = flattened.filter(r => r.status === targetStat || r.rawStatus.toLowerCase() === targetStat);
    }

    // Search filter
    if (qSearch) {
      const q = qSearch.toLowerCase().trim();
      flattened = flattened.filter(r =>
        (r.studentName && r.studentName.toLowerCase().includes(q)) ||
        (r.regNo && r.regNo.toLowerCase().includes(q)) ||
        (r.className && r.className.toLowerCase().includes(q)) ||
        (r.subjectName && r.subjectName.toLowerCase().includes(q)) ||
        (r.teacherName && r.teacherName.toLowerCase().includes(q)) ||
        (r.department && r.department.toLowerCase().includes(q)) ||
        (r.date && r.date.includes(q))
      );
    }

    const total = flattened.length;
    const stats = {
      total,
      present: flattened.filter(r => r.status === 'present').length,
      absent: flattened.filter(r => r.status === 'absent').length,
      od: flattened.filter(r => r.status === 'od' || r.status === 'leave').length,
    };

    const pages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
    const paginated = limit > 0 ? flattened.slice((page - 1) * limit, page * limit) : flattened;

    res.json(paginated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/attendance/:id — Update individual student attendance record
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status, remarks, studentTrackId, date, periodNumber } = req.body;
    const idParam = req.params.id;

    // Support composite ID: {docId}_{pIdx}_{rIdx}
    let classAttDoc = null;
    let pIdx = -1;
    let rIdx = -1;

    if (idParam.includes('_')) {
      const parts = idParam.split('_');
      const docId = parts[0];
      pIdx = parseInt(parts[1], 10);
      rIdx = parseInt(parts[2], 10);
      classAttDoc = await M.ClassAttendance.findById(docId);
    } else {
      classAttDoc = await M.ClassAttendance.findById(idParam);
    }

    if (!classAttDoc) return res.status(404).json({ error: 'Attendance document not found' });

    let targetStudentTrackId = studentTrackId;

    if (pIdx >= 0 && rIdx >= 0 && classAttDoc.periods[pIdx]?.records[rIdx]) {
      const rec = classAttDoc.periods[pIdx].records[rIdx];
      targetStudentTrackId = rec.studentTrackId;
      if (status) rec.status = status.toUpperCase() === 'PRESENT' || status === 'P' ? 'P' : (status.toUpperCase() === 'OD' ? 'OD' : (status.toUpperCase() === 'LEAVE' ? 'LEAVE' : 'AB'));
      if (remarks !== undefined) rec.remarks = remarks;
    } else if (targetStudentTrackId) {
      // Find record matching studentTrackId across all periods
      for (const p of classAttDoc.periods || []) {
        for (const r of p.records || []) {
          if (r.studentTrackId === targetStudentTrackId) {
            if (status) r.status = status.toUpperCase() === 'PRESENT' || status === 'P' ? 'P' : (status.toUpperCase() === 'OD' ? 'OD' : (status.toUpperCase() === 'LEAVE' ? 'LEAVE' : 'AB'));
            if (remarks !== undefined) r.remarks = remarks;
          }
        }
      }
    }

    classAttDoc.updatedAt = new Date();
    await classAttDoc.save();

    if (targetStudentTrackId) {
      await syncStudentAttendanceCounters(targetStudentTrackId, classAttDoc.classId);
    }

    await logAction(
      req.user.trackId || req.user._id,
      req.user.name,
      req.user.role,
      'Attendance Record Updated',
      `Updated status to ${status} for student ${targetStudentTrackId || ''}`,
      'attendance',
      'info',
      req.ip,
      req.user.sessionId,
      {
        module: 'teacher',
        subType: 'attendance',
        trackId: req.user.trackId,
        actingWithAdminRights: req.user.actingWithAdminRights,
        changes: { before: { status: 'PREVIOUS' }, after: { status } }
      }
    );

    res.json({ success: true, message: 'Attendance record updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance — Save or batch update class attendance
router.post('/', authMiddleware, checkAttendanceMarkGuard, async (req, res) => {
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

    // ── Policy Checks (Non-Admin Enforced) ────────────────
    const settings = await getCachedSettings();
    const attSettings = settings.attendance || {};

    if (req.user.role !== 'admin') {
      // 1. Check maxAttendanceBackdateDays
      const maxBackdate = attSettings.maxAttendanceBackdateDays !== undefined ? Number(attSettings.maxAttendanceBackdateDays) : 3;
      const targetDate = new Date(dateInput + 'T00:00:00.000Z');
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - targetDate) / (1000 * 60 * 60 * 24));
      if (diffDays > maxBackdate) {
        return res.status(403).json({
          error: `Attendance marking for dates older than ${maxBackdate} day(s) is locked by administrator.`,
          backdateLocked: true
        });
      }

      // 2. Check requirePeriodRemark
      const requireRemark = !!attSettings.requirePeriodRemark;
      const topicInput = req.body.topic || req.body.remarks || (rawRecords[0] && (rawRecords[0].topic || rawRecords[0].remarks));
      if (requireRemark && (!topicInput || !String(topicInput).trim())) {
        return res.status(400).json({
          error: 'Topic / Period Remark is required by institutional attendance policy.',
          remarkRequired: true
        });
      }
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
        // 3. Check allowAttendanceEdit
        if (req.user.role !== 'admin' && attSettings.allowAttendanceEdit === false) {
          return res.status(403).json({
            error: 'Modifying previously saved attendance is locked by administrator.',
            editLocked: true
          });
        }

        // 4. Check autoLockAttendanceHours
        const autoLockHours = Number(attSettings.autoLockAttendanceHours) || 0;
        if (req.user.role !== 'admin' && autoLockHours > 0) {
          const existingPeriod = classAttDoc.periods[existingPeriodIdx];
          const markedAtTime = existingPeriod.markedAt ? new Date(existingPeriod.markedAt).getTime() : new Date(classAttDoc.createdAt).getTime();
          const ageHours = (Date.now() - markedAtTime) / (1000 * 60 * 60);
          if (ageHours > autoLockHours) {
            return res.status(403).json({
              error: `This attendance record was finalized and auto-locked after ${autoLockHours} hours.`,
              autoLocked: true
            });
          }
        }

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

    // Sync student counters asynchronously and upsert daily student attendance logs
    for (const stTrackId of affectedTrackIds) {
      await syncStudentAttendanceCounters(stTrackId, targetClassId);

      // Upsert student daily attendance log
      try {
        const studentRec = formattedRecords.find(r => r.studentTrackId === stTrackId);
        const stuStatus = studentRec ? studentRec.status : 'P';
        const dateStr = dateInput;

        const periodSummaryObj = {
          periodNumber: periodNumInput,
          subjectTrackId: targetSubjectTrackId,
          subjectName: targetSubjectTrackId,
          status: stuStatus,
          markedBy: req.user.name || 'Teacher',
          markedAt: new Date()
        };

        const existingDailyLog = await M.Log.findOne({
          module: 'student',
          subType: 'attendance',
          'attendanceSummary.studentTrackId': stTrackId,
          'attendanceSummary.date': dateStr
        });

        if (existingDailyLog && existingDailyLog.attendanceSummary) {
          // Update existing period or push new period
          const existingPeriods = existingDailyLog.attendanceSummary.periods || [];
          const pIdx = existingPeriods.findIndex(p => p.periodNumber === periodNumInput);
          if (pIdx >= 0) {
            existingPeriods[pIdx] = periodSummaryObj;
          } else {
            existingPeriods.push(periodSummaryObj);
            existingPeriods.sort((a, b) => a.periodNumber - b.periodNumber);
          }
          existingDailyLog.attendanceSummary.periods = existingPeriods;
          existingDailyLog.time = new Date();
          await existingDailyLog.save();
        } else {
          // Find student name
          const stuDoc = await M.Student.findOne({ trackId: stTrackId }).select('fullName').lean();
          const studentName = stuDoc?.fullName || stTrackId;
          await logAction(
            stTrackId,
            studentName,
            'student',
            'Student Attendance Daily',
            `Attendance record for ${dateStr}`,
            'attendance',
            'info',
            req.ip,
            '',
            {
              module: 'student',
              subType: 'attendance',
              trackId: stTrackId,
              attendanceSummary: {
                studentTrackId: stTrackId,
                studentName,
                date: dateStr,
                classId: targetClassId,
                periods: [periodSummaryObj]
              }
            }
          );
        }
      } catch (logErr) {
        console.error('[Student Daily Log Error]:', logErr.message);
      }
    }

    await logAction(
      req.user.trackId || req.user._id,
      req.user.name,
      req.user.role,
      'Attendance Marked',
      `Class ${targetClassId} on ${dateInput} Period ${periodNumInput}`,
      'attendance',
      'info',
      req.ip,
      req.user.sessionId,
      {
        module: 'teacher',
        subType: 'attendance',
        trackId: req.user.trackId,
        actingWithAdminRights: req.user.actingWithAdminRights
      }
    );

    res.status(201).json({ ok: true, classAttendanceId: classAttDoc._id, savedCount: formattedRecords.length });
  } catch (err) {
    console.error('Error saving attendance:', err);
    res.status(400).json({ error: err.message });
  }
});

// Bulk delete all attendance (admin only)
router.delete('/all', attendanceClearLimiter, authMiddleware, adminOnly, async (req, res) => {
  try {
    const res1 = await M.ClassAttendance.deleteMany({});
    const res2 = await M.StudentAttendance.deleteMany({});
    await logAction(
      req.user.trackId || req.user._id,
      req.user.name,
      req.user.role,
      'Attendance Cleared',
      `Deleted ${res1.deletedCount} class sessions`,
      'attendance',
      'warning',
      req.ip,
      req.user.sessionId,
      { module: 'teacher', subType: 'attendance' }
    );
    res.json({ deleted: res1.deletedCount + res2.deletedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete attendance records within a date range (inclusive)
router.delete('/clear', attendanceClearLimiter, authMiddleware, adminOnly, async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    const filter = { date: { $gte: start, $lte: end } };
    const res1 = await M.ClassAttendance.deleteMany(filter);
    const res2 = await M.StudentAttendance.deleteMany(filter);
    await logAction(
      req.user.trackId || req.user._id,
      req.user.name,
      req.user.role,
      'Attendance Cleared (Range)',
      `Deleted ${res1.deletedCount} class sessions from ${from} to ${to}`,
      'attendance',
      'warning',
      req.ip,
      req.user.sessionId,
      { module: 'teacher', subType: 'attendance' }
    );
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