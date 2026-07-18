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
      referredBy TEXT
    );
  `);

  // Create Appointments Table
  db.execSync(`
    CREATE TABLE IF NOT EXISTS Appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patientId INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'Scheduled',
      FOREIGN KEY (patientId) REFERENCES Patients (id)
    );
  `);

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
    if (existing.length === 0) {
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'currency', '₹');
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'timezone', 'IST');
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'appointmentReminderHours', '1');
      db.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'paymentReminderDays', '7');
    }
  } catch (e) {
    console.error("Failed to seed settings:", e);
  }
};

export const getDb = () => db;

