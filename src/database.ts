import * as SQLite from 'expo-sqlite';

// Open the database synchronously
const db = SQLite.openDatabaseSync('physio_tracker.db');

export const initDatabase = () => {
  // Create Patients Table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS Patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER,
      ailment TEXT,
      address TEXT,
      referredBy TEXT,
      defaultFee REAL DEFAULT 500.00,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      phone TEXT,
      notes TEXT
    );
  `);

  // Try migrating existing tables in case columns don't exist
  try {
    db.execSync('ALTER TABLE Patients ADD COLUMN defaultFee REAL DEFAULT 500.00;');
  } catch(e) {}
  try {
    db.execSync('ALTER TABLE Patients ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;');
  } catch(e) {}
  try {
    db.execSync('ALTER TABLE Patients ADD COLUMN phone TEXT;');
  } catch(e) {}
  try {
    db.execSync('ALTER TABLE Patients ADD COLUMN notes TEXT;');
  } catch(e) {}

  // Create Appointments Table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS Appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patientId INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'Scheduled',
      seriesId TEXT,
      notificationId TEXT,
      FOREIGN KEY (patientId) REFERENCES Patients (id)
    );
  `);

  try {
    db.execSync('ALTER TABLE Appointments ADD COLUMN seriesId TEXT;');
  } catch(e) {}
  try {
    db.execSync('ALTER TABLE Appointments ADD COLUMN notificationId TEXT;');
  } catch(e) {}

  // Create Payments Table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS Payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patientId INTEGER NOT NULL,
      appointmentId INTEGER,
      amount REAL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      FOREIGN KEY (patientId) REFERENCES Patients (id),
      FOREIGN KEY (appointmentId) REFERENCES Appointments (id)
    );
  `);

  // Create Settings Table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS Settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Insert default settings if they don't exist
  try {
    const existing = db.getAllSync<{key: string, value: string}>('SELECT key, value FROM Settings');
    const keys = existing.map(r => r.key);

    // Migration from Hours to Minutes
    if (keys.includes('appointmentReminderHours') && !keys.includes('appointmentReminderMinutes')) {
      const hrRow = existing.find(r => r.key === 'appointmentReminderHours');
      const hrs = hrRow ? parseFloat(hrRow.value) : 1;
      const mins = Math.round(hrs * 60);
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'appointmentReminderMinutes', mins.toString());
      db.runSync("DELETE FROM Settings WHERE key = 'appointmentReminderHours'");
    }

    const updatedExisting = db.getAllSync('SELECT key FROM Settings');
    const updatedKeys = updatedExisting.map((r: any) => r.key);

    if (!updatedKeys.includes('currency')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'currency', '₹');
    }
    if (!updatedKeys.includes('timezone')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'timezone', 'IST');
    }
    if (!updatedKeys.includes('appointmentReminderMinutes')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'appointmentReminderMinutes', '60');
    }
    if (!updatedKeys.includes('paymentReminderDays')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'paymentReminderDays', '7');
    }
    if (!updatedKeys.includes('timeConflictBufferMinutes')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'timeConflictBufferMinutes', '60');
    }
    if (!updatedKeys.includes('doctorName')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'doctorName', 'Dr. Smith');
    }
    if (!updatedKeys.includes('clinicName')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'clinicName', 'Physio Clinic');
    }
    if (!updatedKeys.includes('specialization')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'specialization', 'Physiotherapist');
    }
    if (!updatedKeys.includes('workingHourStart')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'workingHourStart', '10');
    }
    if (!updatedKeys.includes('workingHourEnd')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'workingHourEnd', '18');
    }
    if (!updatedKeys.includes('workingDays')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'workingDays', '1,2,3,4,5,6');
    }
    if (!updatedKeys.includes('appUnlocked')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'appUnlocked', 'false');
    }
  } catch (e) {
    console.error("Failed to seed settings:", e);
  }
};

export const getDb = () => db;

