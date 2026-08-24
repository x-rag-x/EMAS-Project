// ═══════════════════════════════════════════════════════════════
//  EAMS — Authoritative System Settings Defaults
//  Single source of truth for all domain configuration cards
// ═══════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS_MAP = {
  // ── card: Institution Details ────────────────────────────────────────────
  institution: {
    card: 'Institution Details',
    value: {
      institutionName:    'Sri Shakthi Institute of Engineering and Technology',
      institutionShort:   'SIET',
      institutionTagline: 'Autonomous Institution · Approved by AICTE',
      institutionLogoUrl: 'assets/logo.png',
      institutionAddress: 'Sri Shakthi Nagar, L&T Bypass, Chinniyampalayam Post, Coimbatore - 641062',
      institutionEmail:   'info@siet.ac.in',
      institutionPhone:   '+91 422 2369900',
      institutionWebsite: 'https://www.siet.ac.in',
    }
  },

  // ── card: Pages & Portals (Tri-State) ───────────────────────────────────
  pages: {
    card: 'Pages & Portals',
    value: {
      pageStudents:  'enabled',
      pageTeachers:  'enabled',
      pageManage:    'enabled',
      pageBulk:      'enabled',
      pageTimeTable: 'enabled',
      pageSelector:  'enabled',
    }
  },

  // ── card: Attendance Policy ──────────────────────────────────────────────
  attendance: {
    card: 'Attendance Policy',
    value: {
      markAttendance:            true,
      liveSessions:              true,
      forwardToRep:              true,
      allowAttendanceEdit:       true,
      maxAttendanceBackdateDays: 3,
      requirePeriodRemark:       false,
      autoLockAttendanceHours:   24,
      defaultAttendanceStatus:   'Present',
    }
  },

  // ── card: Models & Features ──────────────────────────────────────────────
  models: {
    card: 'Models & Features',
    value: {
      modelAssignments:      true,
      modelLeave:            true,
      modelGrievances:       true,
      modelExams:            true,
      modelNotifications:    true,
      modelBackup:           true,
      modelUndo:             true,
      modelAddStudent:       true,
      modelExportSheet:      true,
      moduleDelUseAdminPass: true,
    }
  },

  // ── card: Academic Settings ──────────────────────────────────────────────
  academic: {
    card: 'Academic Settings',
    value: {
      academicYear:           '2026-27',
      currentSemesterType:    'Odd',
      minAttendance:          75,
      lowAttendanceThreshold: 65,
      workingDays:            6,
      periodsPerDay:          7,
    }
  },

  // ── card: Password Policy ────────────────────────────────────────────────
  security: {
    card: 'Password Policy',
    value: {
      forcePasswordChange:       true,
      requireStrongPassword:     true,
      sessionTimeout:            true,
      sessionTimeoutMins:        60,
      maxLoginAttempts:          3,
      lockoutDurationMins:       15,
    }
  },

  // ── card: System Broadcasts ──────────────────────────────────────────────
  broadcast: {
    card: 'System Broadcasts',
    value: {
      defaultPopupDurationSec:  10,
      autoExpireHours:          24,
      allowTeacherBroadcasts:   false,
    }
  },

  // ── card: System Utilities ───────────────────────────────────────────────
  advanced: {
    card: 'System Utilities',
    value: {
      debugMode:         false,
      multiAdminSession: true,
      autoSeedDemoData:  false,
      errorsCount:       20,
    }
  },

  // ── card: Operational maintenance ────────────────────────────────────────
  maintenance: {
    card: 'System Utilities',
    value: {
      active:        false,
      message:       'System under maintenance. Please try again later.',
      affectedRoles: [],
      endTime:       null,
      startedAt:     null,
    }
  }
};

const DEFAULT_SETTINGS_LIST = Object.entries(DEFAULT_SETTINGS_MAP).map(([key, item]) => ({
  key,
  card: item.card,
  value: item.value,
}));

module.exports = {
  DEFAULT_SETTINGS_MAP,
  DEFAULT_SETTINGS_LIST,
};
