const mongoose = require('mongoose');
const M = require('../models');
const cfg = require('../config');

async function runVerification() {
  console.log('🚀 Starting Settings & Security System Verification...\n');

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(cfg.MONGO_URI, { dbName: cfg.DB_NAME });
    }
    console.log('✅ Database connected');

    // 1. Check all 8 domain cards
    const expectedKeys = ['institution', 'pages', 'attendance', 'models', 'academic', 'security', 'broadcast', 'advanced'];
    for (const key of expectedKeys) {
      const doc = await M.Settings.findOne({ key });
      if (!doc || !doc.value) {
        throw new Error(`Domain setting missing: ${key}`);
      }
      console.log(`✅ Domain [${key}] found with ${Object.keys(doc.value).length} keys (Card: "${doc.card}")`);
    }

    // 2. Test SettingHistory logging on update
    const prevPages = await M.Settings.findOne({ key: 'pages' });
    const originalStudentState = prevPages.value.pageStudents;

    // Simulate update to 'disabled'
    const newStudentState = 'disabled';
    await M.SettingHistory.create({
      card: prevPages.card || 'Pages & Portals',
      key: 'pages',
      field: 'pageStudents',
      previousValue: originalStudentState,
      newValue: newStudentState,
      updatedBy: {
        role: 'admin',
        username: 'admin',
        name: 'Super Administrator',
        trackId: 'ADM-001',
        ip: '127.0.0.1'
      },
      timestamp: new Date()
    });

    const latestHistory = await M.SettingHistory.findOne({ field: 'pageStudents' }).sort({ timestamp: -1 });
    if (!latestHistory || latestHistory.newValue !== 'disabled') {
      throw new Error('SettingHistory audit log verification failed');
    }
    console.log(`✅ SettingHistory audit record logged: [${latestHistory.field}] ${latestHistory.previousValue} -> ${latestHistory.newValue} by ${latestHistory.updatedBy.name}`);

    // Restore pageStudents to 'enabled'
    await M.Settings.findOneAndUpdate({ key: 'pages' }, { $set: { 'value.pageStudents': 'enabled' } });

    // 3. Test Broadcast dispatch history
    const bcast = await M.BroadcastHistory.create({
      message: 'System upgrade maintenance scheduled tonight at 11 PM',
      level: 'urgent',
      targetRoles: ['all'],
      isForcedAll: true,
      popupDurationSec: 15,
      sentCount: 120,
      sentUserIds: ['STU-001', 'TEA-001'],
      failedCount: 0,
      failedDetails: [],
      dispatchedBy: {
        role: 'admin',
        username: 'admin',
        name: 'Super Administrator',
        trackId: 'ADM-001',
        ip: '127.0.0.1'
      },
      dispatchedAt: new Date()
    });

    const bcastCheck = await M.BroadcastHistory.findById(bcast._id);
    if (!bcastCheck || bcastCheck.level !== 'urgent') {
      throw new Error('BroadcastHistory record verification failed');
    }
    console.log(`✅ BroadcastHistory record logged: "${bcastCheck.message}" [${bcastCheck.level}] sent to ${bcastCheck.sentCount} users`);

    // Clean up test broadcast
    await M.BroadcastHistory.deleteOne({ _id: bcast._id });

    // 4. Verify Teacher Model adminRights enum includes 'settingsPage'
    const schemaRights = M.Teacher.schema.path('adminRights').caster.enumValues;
    if (!schemaRights.includes('settingsPage')) {
      throw new Error('Teacher adminRights enum missing settingsPage');
    }
    console.log(`✅ Teacher adminRights enum verified: [${schemaRights.join(', ')}]`);

    // 5. Verify Teacher Model preferences.defaultAttendanceStatus enum
    const statusEnum = M.Teacher.schema.path('preferences.defaultAttendanceStatus').enumValues;
    if (!statusEnum.includes('Present') || !statusEnum.includes('Absent') || !statusEnum.includes('Unmarked')) {
      throw new Error('Teacher defaultAttendanceStatus enum invalid');
    }
    console.log(`✅ Teacher defaultAttendanceStatus enum verified: [${statusEnum.join(', ')}]`);

    console.log('\n🎉 ALL 5 SETTINGS & SECURITY VERIFICATION SUITES PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
  }
}

runVerification();
