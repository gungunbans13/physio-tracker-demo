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
      phone TEXT
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

  // Create Appointments Table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS Appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patientId INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'Scheduled',
      seriesId TEXT,
      FOREIGN KEY (patientId) REFERENCES Patients (id)
    );
  `);

  try {
    db.execSync('ALTER TABLE Appointments ADD COLUMN seriesId TEXT;');
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
    const existing = db.getAllSync('SELECT key FROM Settings');
    const keys = existing.map((r: any) => r.key);
    if (!keys.includes('currency')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'currency', '₹');
    }
    if (!keys.includes('timezone')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'timezone', 'IST');
    }
    if (!keys.includes('appointmentReminderHours')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'appointmentReminderHours', '1');
    }
    if (!keys.includes('paymentReminderDays')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'paymentReminderDays', '7');
    }
    if (!keys.includes('timeConflictBufferMinutes')) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'timeConflictBufferMinutes', '60');
    }
  } catch (e) {
    console.error("Failed to seed settings:", e);
  }
};

export const getDb = () => db;

