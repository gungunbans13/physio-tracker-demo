import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export const getDb = () => {
  if (!db) {
    db = SQLite.openDatabaseSync('physio_tracker.db');
  }
  return db;
};

export const closeDb = () => {
  if (db) {
    db.closeSync();
    db = null;
  }
};

export const initDatabase = () => {
  const database = getDb();
  
  // Create Patients Table
  database.execSync(`
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
    database.execSync('ALTER TABLE Patients ADD COLUMN defaultFee REAL DEFAULT 500.00;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Patients ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Patients ADD COLUMN phone TEXT;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Patients ADD COLUMN notes TEXT;');
  } catch(e) {}

  // Create Appointments Table
  database.execSync(`
    CREATE TABLE IF NOT EXISTS Appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patientId INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'Scheduled',
      seriesId TEXT,
      notificationId TEXT,
      notes TEXT,
      deliveryAddress TEXT,
      FOREIGN KEY (patientId) REFERENCES Patients (id)
    );
  `);

  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN seriesId TEXT;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN notificationId TEXT;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN notes TEXT;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN deliveryAddress TEXT;');
  } catch(e) {}

  // Create Payments Table
  database.execSync(`
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
  database.execSync(`
    CREATE TABLE IF NOT EXISTS Settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Insert default settings if they don't exist
  try {
    const existing = database.getAllSync<{key: string, value: string}>('SELECT key, value FROM Settings');
    const keys = existing.map(r => r.key);

    // Migration from Hours to Minutes
    if (keys.includes('appointmentReminderHours') && !keys.includes('appointmentReminderMinutes')) {
      const hrRow = existing.find(r => r.key === 'appointmentReminderHours');
      const hrs = hrRow ? parseFloat(hrRow.value) : 1;
      const mins = Math.round(hrs * 60);
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'appointmentReminderMinutes', mins.toString());
      database.runSync("DELETE FROM Settings WHERE key = 'appointmentReminderHours'");
    }

    const updatedExisting = database.getAllSync('SELECT key FROM Settings');
    const updatedKeys = updatedExisting.map((r: any) => r.key);

    if (!updatedKeys.includes('currency')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'currency', '₹');
    }
    if (!updatedKeys.includes('timezone')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'timezone', 'IST');
    }
    if (!updatedKeys.includes('appointmentReminderMinutes')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'appointmentReminderMinutes', '60');
    }
    if (!updatedKeys.includes('paymentReminderDays')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'paymentReminderDays', '7');
    }
    if (!updatedKeys.includes('timeConflictBufferMinutes')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'timeConflictBufferMinutes', '60');
    }
    if (!updatedKeys.includes('doctorName')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'doctorName', 'Dr. Smith');
    }
    if (!updatedKeys.includes('clinicName')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'clinicName', 'Physio Clinic');
    }
    if (!updatedKeys.includes('specialization')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'specialization', 'Physiotherapist');
    }
    if (!updatedKeys.includes('workingHourStart')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'workingHourStart', '10');
    }
    if (!updatedKeys.includes('workingHourEnd')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'workingHourEnd', '18');
    }
    if (!updatedKeys.includes('workingDays')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'workingDays', '1,2,3,4,5,6');
    }
    if (!updatedKeys.includes('appUnlocked')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'appUnlocked', 'false');
    }
  } catch (e) {
    console.error("Failed to seed settings:", e);
  }

  // Create Menu Table
  database.execSync(`
    CREATE TABLE IF NOT EXISTS Menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL
    );
  `);

  try {
    const menuCount = database.getFirstSync<{cnt: number}>('SELECT COUNT(*) as cnt FROM Menu');
    if (menuCount && menuCount.cnt === 0) {
      database.runSync('INSERT INTO Menu (name, description, price) VALUES (?, ?, ?)', 'Chocolate Truffle Cake (1kg)', 'Classic rich dark chocolate cake, eggless.', 1500);
      database.runSync('INSERT INTO Menu (name, description, price) VALUES (?, ?, ?)', 'Red Velvet Cupcakes (6 pcs)', 'Soft velvet cupcakes with cream cheese frosting.', 450);
      database.runSync('INSERT INTO Menu (name, description, price) VALUES (?, ?, ?)', 'Vanilla Buttercream Cake (0.5kg)', 'Light vanilla sponge with buttercream decoration.', 800);
    }
  } catch (e) {
    console.error("Failed to seed menu catalog:", e);
  }
};
