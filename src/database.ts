import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

// Web localStorage SQL queries simulator to support Web Demo builds
class WebSQLiteMock {
  private getTable(name: string): any[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(`sqldb_${name}`);
    return data ? JSON.parse(data) : [];
  }

  private saveTable(name: string, data: any[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`sqldb_${name}`, JSON.stringify(data));
  }

  execSync(query: string) {
    if (query.includes('CREATE TABLE IF NOT EXISTS Patients')) {
      if (!localStorage.getItem('sqldb_Patients')) this.saveTable('Patients', []);
    } else if (query.includes('CREATE TABLE IF NOT EXISTS Appointments')) {
      if (!localStorage.getItem('sqldb_Appointments')) this.saveTable('Appointments', []);
    } else if (query.includes('CREATE TABLE IF NOT EXISTS Payments')) {
      if (!localStorage.getItem('sqldb_Payments')) this.saveTable('Payments', []);
    } else if (query.includes('CREATE TABLE IF NOT EXISTS Settings')) {
      if (!localStorage.getItem('sqldb_Settings')) this.saveTable('Settings', []);
    }
  }

  runSync(query: string, ...params: any[]) {
    const flatParams = params.flat();
    
    // 1. INSERT INTO Patients
    if (query.includes('INSERT INTO Patients')) {
      const list = this.getTable('Patients');
      const id = list.length > 0 ? Math.max(...list.map(x => x.id)) + 1 : 1;
      const [name, age, ailment, address, referredBy, defaultFee, phone, notes] = flatParams;
      list.push({ 
        id, 
        name, 
        age: age ? Number(age) : null, 
        ailment, 
        address, 
        referredBy, 
        defaultFee: defaultFee ? Number(defaultFee) : 500, 
        phone, 
        notes, 
        created_at: new Date().toISOString() 
      });
      this.saveTable('Patients', list);
    }
    // 2. UPDATE Patients
    else if (query.includes('UPDATE Patients')) {
      const list = this.getTable('Patients');
      const [name, age, ailment, address, referredBy, defaultFee, phone, notes, id] = flatParams;
      const index = list.findIndex(x => x.id === Number(id));
      if (index !== -1) {
        list[index] = { 
          ...list[index], 
          name, 
          age: age ? Number(age) : null, 
          ailment, 
          address, 
          referredBy, 
          defaultFee: defaultFee ? Number(defaultFee) : 500, 
          phone, 
          notes 
        };
        this.saveTable('Patients', list);
      }
    }
    // 3. DELETE FROM Patients
    else if (query.includes('DELETE FROM Patients')) {
      const [id] = flatParams;
      const list = this.getTable('Patients').filter(x => x.id !== Number(id));
      this.saveTable('Patients', list);
    }
    // 4. INSERT INTO Appointments
    else if (query.includes('INSERT INTO Appointments')) {
      const list = this.getTable('Appointments');
      const id = list.length > 0 ? Math.max(...list.map(x => x.id)) + 1 : 1;
      const [patientId, date, status, seriesId, notificationId] = flatParams;
      list.push({ 
        id, 
        patientId: Number(patientId), 
        date, 
        status: status || 'Scheduled', 
        seriesId: seriesId || null, 
        notificationId: notificationId || null 
      });
      this.saveTable('Appointments', list);
    }
    // 5. UPDATE Appointments SET date = ?, status = ?
    else if (query.includes('UPDATE Appointments SET date = ?, status = ?') || query.includes('UPDATE Appointments SET date = ?, status = ?, seriesId = ?')) {
      const list = this.getTable('Appointments');
      const [date, status, seriesId, notificationId, id] = flatParams;
      const targetId = id || seriesId || status;
      const index = list.findIndex(x => x.id === Number(targetId));
      if (index !== -1) {
        list[index].date = date;
        list[index].status = status;
        if (seriesId) list[index].seriesId = seriesId;
        if (notificationId) list[index].notificationId = notificationId;
        this.saveTable('Appointments', list);
      }
    }
    // 6. UPDATE Appointments SET status = ? WHERE id = ?
    else if (query.includes('UPDATE Appointments SET status = ? WHERE id = ?')) {
      const list = this.getTable('Appointments');
      const [status, id] = flatParams;
      const index = list.findIndex(x => x.id === Number(id));
      if (index !== -1) {
        list[index].status = status;
        this.saveTable('Appointments', list);
      }
    }
    // 7. DELETE FROM Appointments
    else if (query.includes('DELETE FROM Appointments')) {
      const [id] = flatParams;
      const list = this.getTable('Appointments').filter(x => x.id !== Number(id));
      this.saveTable('Appointments', list);
    }
    // 8. INSERT INTO Payments
    else if (query.includes('INSERT INTO Payments')) {
      const list = this.getTable('Payments');
      const id = list.length > 0 ? Math.max(...list.map(x => x.id)) + 1 : 1;
      const [patientId, appointmentId, amount, date, status] = flatParams;
      list.push({ 
        id, 
        patientId: Number(patientId), 
        appointmentId: appointmentId ? Number(appointmentId) : null, 
        amount: Number(amount), 
        date, 
        status: status || 'Pending' 
      });
      this.saveTable('Payments', list);
    }
    // 9. UPDATE Payments
    else if (query.includes('UPDATE Payments')) {
      const list = this.getTable('Payments');
      const [status, amount, id] = flatParams;
      const targetId = id || amount;
      const index = list.findIndex(x => x.id === Number(targetId));
      if (index !== -1) {
        list[index].status = status;
        if (amount && id) list[index].amount = Number(amount);
        this.saveTable('Payments', list);
      }
    }
    // 10. DELETE FROM Payments WHERE appointmentId = ?
    else if (query.includes('DELETE FROM Payments WHERE appointmentId = ?')) {
      const [appId] = flatParams;
      const list = this.getTable('Payments').filter(x => x.appointmentId !== Number(appId));
      this.saveTable('Payments', list);
    }
    // 11. INSERT INTO Settings
    else if (query.includes('INSERT INTO Settings')) {
      const list = this.getTable('Settings');
      const [key, value] = flatParams;
      const index = list.findIndex(x => x.key === key);
      if (index !== -1) {
        list[index].value = value;
      } else {
        list.push({ key, value });
      }
      this.saveTable('Settings', list);
    }
    // 12. UPDATE Settings SET value = ?
    else if (query.includes('UPDATE Settings SET value = ?')) {
      const list = this.getTable('Settings');
      const [value, key] = flatParams;
      const index = list.findIndex(x => x.key === key);
      if (index !== -1) {
        list[index].value = value;
        this.saveTable('Settings', list);
      }
    }
  }

  getFirstSync(query: string, ...params: any[]): any {
    const list = this.getAllSync(query, params);
    return list.length > 0 ? list[0] : null;
  }

  getAllSync(query: string, ...params: any[]): any[] {
    const flatParams = params.flat();
    
    // 1. SELECT * FROM Settings
    if (query.includes('SELECT * FROM Settings') || query.includes('SELECT key, value FROM Settings')) {
      return this.getTable('Settings');
    }
    // 2. SELECT value FROM Settings WHERE key = ?
    if (query.includes('SELECT value FROM Settings WHERE key = ?')) {
      const [key] = flatParams;
      const row = this.getTable('Settings').find(x => x.key === key);
      return row ? [row] : [];
    }
    // 3. SELECT * FROM Patients
    if (query.includes('SELECT * FROM Patients')) {
      let list = this.getTable('Patients');
      const searchParam = flatParams[0];
      if (searchParam && searchParam !== '%%') {
        const keyword = searchParam.replace(/%/g, '').toLowerCase();
        list = list.filter(x => x.name.toLowerCase().includes(keyword) || (x.ailment && x.ailment.toLowerCase().includes(keyword)));
      }
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }
    // 4. SELECT COUNT(*) as cnt FROM Patients
    if (query.includes('SELECT COUNT(*) as cnt FROM Patients')) {
      return [{ cnt: this.getTable('Patients').length }];
    }
    // 5. SELECT A.*, P.name as patientName
    if (query.includes('SELECT A.*, P.name as patientName')) {
      const appointments = this.getTable('Appointments');
      const patients = this.getTable('Patients');
      const payments = this.getTable('Payments');
      
      const dateParam = flatParams[0];
      let filtered = appointments;
      if (dateParam) {
        const dateKey = dateParam.replace(/%/g, '');
        filtered = appointments.filter(x => x.date.startsWith(dateKey));
      }
      
      const list = filtered.map(a => {
        const p = patients.find(x => x.id === a.patientId);
        const pay = payments.find(x => x.appointmentId === a.id);
        return {
          ...a,
          patientName: p ? p.name : 'Unknown',
          paymentId: pay ? pay.id : null,
          paymentStatus: pay ? pay.status : 'Pending'
        };
      });
      return list.sort((a, b) => a.date.localeCompare(b.date));
    }
    // 6. SELECT COUNT(*) as cnt FROM Appointments WHERE date LIKE ?
    if (query.includes('SELECT COUNT(*) as cnt FROM Appointments WHERE date LIKE ?')) {
      const [dateLike] = flatParams;
      const dateKey = dateLike.replace(/%/g, '');
      const count = this.getTable('Appointments').filter(x => x.date.startsWith(dateKey) && x.status === 'Scheduled').length;
      return [{ cnt: count }];
    }
    // 7. SELECT COUNT(*) as cnt FROM Appointments WHERE patientId = ?
    if (query.includes('SELECT COUNT(*) as cnt FROM Appointments WHERE patientId = ? AND date = ? AND id != ?')) {
      const [patientId, date, id] = flatParams;
      const count = this.getTable('Appointments').filter(x => x.patientId === Number(patientId) && x.date === date && x.id !== Number(id)).length;
      return [{ cnt: count }];
    }
    // 8. SELECT * FROM Payments
    if (query.includes('SELECT Pay.*, Pat.name as patientName')) {
      const payments = this.getTable('Payments');
      const patients = this.getTable('Patients');
      
      const list = payments.map(pay => {
        const pat = patients.find(x => x.id === pay.patientId);
        return {
          ...pay,
          patientName: pat ? pat.name : 'Unknown'
        };
      });
      return list;
    }
    // 9. SELECT SUM(amount) as total FROM Payments
    if (query.includes("SELECT SUM(amount) as total FROM Payments WHERE status = 'Pending'")) {
      const sum = this.getTable('Payments')
        .filter(x => x.status === 'Pending')
        .reduce((acc, x) => acc + x.amount, 0);
      return [{ total: sum }];
    }
    // 10. SELECT * FROM Payments WHERE patientId = ?
    if (query.includes('SELECT * FROM Payments WHERE patientId = ?')) {
      const [patientId] = flatParams;
      return this.getTable('Payments').filter(x => x.patientId === Number(patientId));
    }
    // 11. SELECT COUNT(*) as cnt FROM Appointments WHERE patientId = ? AND status = 'Completed'
    if (query.includes("SELECT COUNT(*) as cnt FROM Appointments WHERE patientId = ? AND status = 'Completed'")) {
      const [patientId] = flatParams;
      const count = this.getTable('Appointments').filter(x => x.patientId === Number(patientId) && x.status === 'Completed').length;
      return [{ cnt: count }];
    }
    
    return [];
  }

  closeSync() {
    // No-op
  }
}

let db: any = null;

export const getDb = () => {
  if (!db) {
    if (Platform.OS === 'web') {
      db = new WebSQLiteMock();
    } else {
      db = SQLite.openDatabaseSync('physio_tracker.db');
    }
  }
  return db;
};

export const closeDb = () => {
  if (db && Platform.OS !== 'web') {
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
      FOREIGN KEY (patientId) REFERENCES Patients (id)
    );
  `);

  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN seriesId TEXT;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN notificationId TEXT;');
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
};
