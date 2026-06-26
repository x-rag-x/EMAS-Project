require('dotenv').config();

const mongoose = require('mongoose');
const cfg = require('./index');
const bcrypt = require('bcryptjs');
const M = require('../models');


mongoose.connect(cfg.MONGO_URI, { dbName: cfg.DB_NAME })
  .then(async() => {
    console.log(`   3/5: MongoDB connected → ${cfg.DB_NAME}`);
    console.log(`> Checking Admin User...`);
    await seedAdmin();
    await seedSettings();
    await seedStudent();
    await seedTeacher();
  })
  .catch(err => { console.error('   3/5: MongoDB error:', err.message); process.exit(1); });

  async function seedSettings() {  

    // ── Settings defaults — 5 card-grouped keys + 3 internal keys ──────────────
    // card enum: 'Institution Details' | 'Settings' | 'Academic Settings' | 'Password Policy' 
    const defaults = [
      // ── card: Institution Details ────────────────────────────────────────────
      {
        card: 'Institution Details',
        key:  'institution',
        value: {
          institutionName:    '',
          institutionShort:   '',
          institutionAddress: '',
          institutionEmail:   '',
          institutionPhone:   '',
        }
      },
  
      // ── card: Settings ───────────────────────────────────────────────────────
      {
        card: 'Settings',
        key:  'settings',
        value: {
          // Pages
          pageStudents:     true,
          pageTeachers:     true,
          pageManage:       true,
          pageBulk:         true,
          // Models
          modelBackup:      true,
          modelUndo:        true,
          modelMaintenance: true,
          modelAdder:       true,
          modelAddStudent:  true,
          modelExportSheet: true,
          moduleDelUseAdminPass: true,
          modelProduction:    cfg.NODE_ENV === 'production' ? true : false,
          // Attendance
          markAttendance:   true,
          liveSessions:     true,
          forwardToRep:     true,
        }
      },
  
      // ── card: Academic Settings ──────────────────────────────────────────────
      {
        card: 'Academic Settings',
        key:  'academic',
        value: {
          academicYear:  '2026-27',
          minAttendance: 75,
          workingDays:   6,
          errorsCount:   20,
        }
      },
  
      // ── card: Password Policy ────────────────────────────────────────────────
      {
        card: 'Password Policy',
        key:  'security',
        value: {
          forcePasswordChange:   true,
          requireStrongPassword: true,
          sessionTimeout:        true,
          sessionTimeoutMins:    60,
          maxLoginAttempts:      3,
        }
      },
  
      // ── card: System Utilities ───────────────────────────────────────────────
      {
        card: 'System Utilities',
        key:  'advanced',
        value: {
          debugMode:         false,
          multiAdminSession: false,
          autoSeedData:      false,
        }
      },
  
      // ── Internal / operational keys ──────────────────────────────────────────
      {
        card: 'System Utilities',
        key:  'maintenance',
        value: {
          active:        false,
          message:       'System under maintenance. Please try again later.',
          affectedRoles: [],
          endTime:       null,
          startedAt:     null,
        }
      }
    ];
  
    console.log(`> Checking settings...`)
    let seeded = 0;
    for (const d of defaults) {
      const exists = await M.Settings.findOne({ key: d.key });
      if (!exists) {
        await M.Settings.create({ card: d.card, key: d.key, value: d.value, updatedBy: 'system' });
        seeded++;
      } else if (!exists.card) {
        // Back-fill missing card field on old records
        await M.Settings.findOneAndUpdate({ key: d.key }, { $set: { card: d.card } });
      }
    }
    if (seeded > 0) console.log(`   5/5: Default settings not found, ${seeded} setting(s) added successfully`);
    else console.log(`   5/5: Default Settings Found`);
  
    // ── One-time migration: flatten old per-field rows → grouped object ────────
    // Old server stored e.g. key:'institutionName', key:'pageStudents' individually.
    // Detect and merge them into the new grouped key, then delete the old rows.
    const migrationMap = [
      {
        groupKey: 'institution', card: 'Institution Details',
        oldKeys: ['institutionName','institutionShort','institutionAddress','institutionEmail','institutionPhone'],
      },
      {
        groupKey: 'settings', card: 'Settings',
        oldKeys: ['pageStudents','pageTeachers','pageManage','pageBulk','errorsCount',
                  'modelBackup','modelUndo','modelMaintenance','modelAdder','modelAddStudent','modelExportSheet',
                  'markAttendance','liveSessions','forwardToRep'],
      },
      {
        groupKey: 'academic', card: 'Academic Settings',
        oldKeys: ['academicYear','minAttendance','workingDays','errorsCount'],
      },
      {
        groupKey: 'security', card: 'Password Policy',
        oldKeys: ['forcePasswordChange','requireStrongPassword','sessionTimeout','sessionTimeoutMins','maxLoginAttempts'],
      },
      {
        groupKey: 'advanced', card: 'System Utilities',
        oldKeys: ['debugMode','multiAdminSession','autoSeedData'],
      },
    ];
    for (const { groupKey, card, oldKeys } of migrationMap) {
      const oldRows = await M.Settings.find({ key: { $in: oldKeys } });
      if (oldRows.length === 0) continue;
      // Merge old scalar rows into the grouped object
      const existing = await M.Settings.findOne({ key: groupKey });
      const merged = existing ? { ...existing.value } : {};
      for (const row of oldRows) merged[row.key] = row.value;
      await M.Settings.findOneAndUpdate(
        { key: groupKey },
        { $set: { card, value: merged, updatedBy: 'migration' } },
        { upsert: true }
      );
      await M.Settings.deleteMany({ key: { $in: oldKeys } });
      console.log(`🔄 Migrated ${oldRows.length} old key(s) → ${groupKey}`);
    }
  
    // Patch old maintenance record missing affectedRoles / endTime
    await M.Settings.findOneAndUpdate(
      { key: 'maintenance', 'value.affectedRoles': { $exists: false } },
      { $set: { 'value.affectedRoles': ['teacher', 'student'], 'value.endTime': null, 'value.startedAt': null } }
    );
  
    // Log server start
    await M.Log.create({
      userName: 'SYSTEM', role: 'system',
      action: 'Server Started',
      details: 'EAMS server started successfully.',
      category: 'system', severity: 'info', ip: 'localhost',
      time: new Date()
    });

    console.log(`EAMS ready for Access...`)
  }

  async function seedAdmin() {
    // Seed admin account (first-boot only) → both M.Admin and M.User
    const adminExists = await M.User.findOne({ username: 'admin', role: 'admin' });
    if (adminExists) {
      console.log(`   4/5: Admin User found...`);
    }
    else {
      const hash = await bcrypt.hash(cfg.ADMIN_PASSWORD, cfg.BCRYPT_ROUNDS);
      await M.Admin.create({ fullName: 'Administrator', firstName: 'Admin', lastName: '', username: 'admin', password: hash, trackId: 'TR-ADMIN001', isAdmin: true, adminRights: 'all', mustChangePassword: true });
      // Shadow entry in User for session tracking
      const userExists = await M.User.findOne({ username: 'admin' });
      if (!userExists) await M.User.create({ username: 'admin', role: 'admin', trackId: 'TR-ADMIN001', status: 'active' });
      console.log(`   4/5: Admin User not found, Created new user successfully`);
    }
  }

  async function seedStudent(){
    const autoSeedData = await M.Settings.findOne({ key: 'autoSeedData'});
    
    if(autoSeedData && autoSeedData.value && autoSeedData.value.autoSeedData) {
      const stdExists = await M.User.findOne({ role: 'student' });
      if (!stdExists) {
        const hash = await bcrypt.hash(cfg.STUDENT_PASSWORD, cfg.BCRYPT_ROUNDS);
        const dept = await M.Department.findOne();
        await M.Student.create({fullName: 'Test Student', password: hash, username: 'student', trackId: 'TRSTD001', regNo: '2022A7PS0203P', deptId: dept ? dept._id : undefined});
        await M.User.create({ username: 'student', role: 'student', trackId: 'TR-STD001', status: 'active' });
        await M.Log.create({
          userName: 'SYSTEM', role: 'system',
          action: 'Student Created',
          details: 'Test Student created successfully.',
          category: 'system', severity: 'info', ip: 'localhost',
          time: new Date()
        });
        console.log(`Test Student Created successfully`);
      }
    }
  }

  async function seedTeacher(){
    const autoSeedData = await M.Settings.findOne({ key: 'autoSeedData'});
    
    if(autoSeedData && autoSeedData.value && autoSeedData.value.autoSeedData) {
      const tecExists = await M.User.findOne({ role: 'teacher' });
      if (!tecExists) {
        const hash = await bcrypt.hash(cfg.TEACHER_PASSWORD, cfg.BCRYPT_ROUNDS);
        const dept = await M.Department.findOne();
        await M.Teacher.create({fullName: 'Test Teacher', password: hash, username: 'teacher', trackId: 'TRTEC001', empId: 'EMP001', deptId: dept ? dept._id : undefined});
        await M.User.create({ username: 'teacher', role: 'teacher', trackId: 'TR-TEC001', status: 'active' });
        await M.Log.create({
          userName: 'SYSTEM', role: 'system',
          action: 'Teacher Created',
          details: 'Test Teacher created successfully.',
          category: 'system', severity: 'info', ip: 'localhost',
          time: new Date()
        });
        console.log(`Test Teacher Created successfully`);
      }
    }
  }