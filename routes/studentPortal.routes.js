const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware } = require('../middleware/auth');
const { checkMaintenance } = require('../middleware/maintenance');

router.get('/me', authMiddleware, checkMaintenance, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });

    // ── User record
    const user = await M.User.findById(req.user._id).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ── Student profile — look up by username or trackId
    let student = await M.Student.findOne({ username: req.user.username }).select('-password').lean();
    if (!student && req.user.trackId) {
      student = await M.Student.findOne({ trackId: req.user.trackId }).select('-password').lean();
    }
    if (!student) {
      // No Student profile record at all — return user info with empty attendance so portal loads
      const academic2 = await M.Settings.findOne({ key: 'academic' });
      const minReq2 = academic2?.value?.minAttendance || 75;
      return res.json({
        user: { _id: user._id, name: user.name, username: user.username, email: user.email, lastLogin: user.lastLogin, loginCount: user.loginCount },
        student: { name: user.name, regNo: '—', deptName: '—', className: '—', year: '—', section: '—', academicYear: '—', courseType: '—', branch: '—', email: user.email || '—', bloodGroup: '—', parentContact: '—' },
        attendance: { subjects: [], totalPresent: 0, totalAbsent: 0, totalClasses: 0, overall: 0, minRequired: minReq2 },
      });
    }

    // Normalize student fields for frontend consumption
    const normalizedStudent = {
      ...student,
      name: student.fullName,
      regNo: student.registerNo,
      deptName: student.department,
      className: student.class || '—',
      academicYear: student.admissionYear || '—',
    };

    // ── Minimum attendance requirement
    const academic = await M.Settings.findOne({ key: 'academic' });
    const minRequired = academic?.value?.minAttendance || 75;

    // ── All attendance records for this student's class
    const studentTrackId = student.trackId || String(student._id);
    const targetClassId = student.classId || student.class;

    const classAttDocs = await M.ClassAttendance.find({
      $or: [{ classId: targetClassId }, { classId: String(student.classId) }]
    }).lean();

    const allSubjects = await M.Subject.find().lean();
    const subjectMapLookup = new Map();
    allSubjects.forEach(sub => {
      subjectMapLookup.set(String(sub._id), sub);
      if (sub.subjectTrackId) subjectMapLookup.set(sub.subjectTrackId, sub);
      if (sub.subjectCode) subjectMapLookup.set(sub.subjectCode, sub);
    });

    // ── Aggregate per subject
    const subjectMap = {}; // subjectTrackId → { subjectName, teacherName, present, absent, total, dates[] }

    for (const doc of classAttDocs) {
      const dateStr = doc.date ? new Date(doc.date).toISOString().split('T')[0] : '';
      for (const period of doc.periods || []) {
        const sid = period.subjectTrackId;
        const subObj = subjectMapLookup.get(sid);
        const subjectName = subObj ? subObj.name : sid;

        if (!subjectMap[sid]) {
          subjectMap[sid] = {
            subjectId: subObj ? String(subObj._id) : sid,
            subjectTrackId: sid,
            subjectName: subjectName,
            teacherName: period.markedBy || '—',
            present: 0,
            absent: 0,
            total: 0,
            dates: [],
          };
        }
        const entry = subjectMap[sid];
        const myRecord = (period.records || []).find(r => r.studentTrackId === studentTrackId);
        if (myRecord) {
          entry.total++;
          if (myRecord.status === 'P') entry.present++;
          else entry.absent++;
          entry.dates.push({ date: dateStr, status: myRecord.status === 'P' ? 'present' : 'absent' });
        }
      }
    }

    const subjects = Object.values(subjectMap).map(s => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
      dates: s.dates.sort((a, b) => a.date.localeCompare(b.date)),
    }));

    // ── Overall totals
    const totalPresent = subjects.reduce((n, s) => n + s.present, 0);
    const totalAbsent = subjects.reduce((n, s) => n + s.absent, 0);
    const totalClasses = subjects.reduce((n, s) => n + s.total, 0);
    const overall = totalClasses > 0 ? Math.round((totalPresent / totalClasses) * 100) : 0;

    res.json({
      user: { _id: user._id, name: user.name, username: user.username, email: user.email, lastLogin: user.lastLogin, loginCount: user.loginCount },
      student: normalizedStudent,
      attendance: {
        subjects,
        totalPresent,
        totalAbsent,
        totalClasses,
        overall,
        minRequired,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;