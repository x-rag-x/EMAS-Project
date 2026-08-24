const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { liveSessionMarkLimiter } = require('../utils/rateLimiters');
const { checkLiveSessionGuard } = require('../middleware/portalGuard');

router.post('/start', authMiddleware, checkLiveSessionGuard, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Only teachers can start live sessions' });
  const { classId, subjectId, date } = req.body;
  if (!classId || !subjectId || !date) return res.status(400).json({ error: 'classId, subjectId, date required' });

  // Close any existing active sessions for this teacher/class
  await M.LiveSession.updateMany({ teacherId: req.user._id, classId, active: true }, { active: false });

  const passcode = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

  const session = await M.LiveSession.create({
    teacherId: req.user._id, classId, subjectId, date, passcode, expiresAt, active: true, markedStudents: []
  });
  res.status(201).json(session);
});

router.get('/active', authMiddleware, checkLiveSessionGuard, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
  try {
    // Find student's classId
    let student = null;
    if (req.user.trackId) student = await M.Student.findOne({ trackId: req.user.trackId });
    if (!student && req.user.username) student = await M.Student.findOne({ username: req.user.username });
    if (!student && req.user._id) student = await M.Student.findById(req.user._id);
    if (!student || !student.classId) return res.json({ active: false });

    // Find active session for this class
    const session = await M.LiveSession.findOne({ classId: student.classId, active: true, expiresAt: { $gt: new Date() } }).populate('subjectId', 'name').lean();
    if (!session) return res.json({ active: false });

    // Check if already marked
    const alreadyMarked = session.markedStudents.some(s => String(s.studentId) === String(student._id));

    res.json({ active: true, sessionId: session._id, subjectName: session.subjectId?.name || 'Subject', alreadyMarked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/mark', liveSessionMarkLimiter, authMiddleware, checkLiveSessionGuard, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
  const { sessionId, passcode } = req.body;

  try {
    let student = null;
    if (req.user.trackId) student = await M.Student.findOne({ trackId: req.user.trackId });
    if (!student && req.user.username) student = await M.Student.findOne({ username: req.user.username });
    if (!student && req.user._id) student = await M.Student.findById(req.user._id);
    if (!student) return res.status(404).json({ error: 'Student profile not found' });

    const session = await M.LiveSession.findById(sessionId);
    if (!session || !session.active || session.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    // IP Check
    const settings = await M.Settings.findOne({ key: 'college_ips' });
    const allowed = settings ? settings.value : [];
    let isAllowed = allowed.length === 0; // if empty, allow all
    if (!isAllowed) {
      for (const ip of allowed) {
        if (req.ip.startsWith(ip) || (ip === '::1' && req.ip === '::1') || (ip === '127.0.0.1' && req.ip === '127.0.0.1') || req.ip.includes(ip)) {
          isAllowed = true; break;
        }
      }
    }
    if (!isAllowed) return res.status(403).json({ error: 'Must connect via College Wi-Fi' });

    // Passcode Check
    if (session.passcode !== passcode) {
      return res.status(400).json({ error: 'Incorrect Passcode' });
    }

    // Already marked?
    const alreadyMarked = session.markedStudents.some(s => String(s.studentId) === String(student._id));
    if (alreadyMarked) return res.json({ success: true, message: 'Already marked' });

    session.markedStudents.push({
      studentId: student._id,
      regNo: student.registerNo || student.regNo,
      time: new Date(),
      ip: req.ip
    });
    await session.save();

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/status/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teachers only' });
  const session = await M.LiveSession.findOne({ _id: req.params.id, teacherId: req.user._id });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ active: session.active, expiresAt: session.expiresAt, markedStudents: session.markedStudents });
});

router.post('/end/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teachers only' });
  await M.LiveSession.findOneAndUpdate({ _id: req.params.id, teacherId: req.user._id }, { active: false });
  res.json({ success: true });
});

module.exports = router;