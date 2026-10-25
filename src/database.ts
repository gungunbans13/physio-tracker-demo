import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

class WebSQLiteEngine {
  private lastInsertRowId: number = 0;

  private getTable(name: string): any[] {
    try {
      const data = typeof window !== 'undefined' ? window.localStorage.getItem(`bb_sqldb_${name}`) : null;
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveTable(name: string, data: any[]) {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`bb_sqldb_${name}`, JSON.stringify(data));
      }
    } catch (e) {
      console.error(`Failed to save table ${name} to localStorage:`, e);
    }
  }

  private nextId(list: any[]): number {
    return list.length > 0 ? Math.max(...list.map((x) => Number(x.id) || 0)) + 1 : 1;
  }

  withTransactionSync(fn: () => void) {
    fn();
  }

  execSync(query: string) {
    if (query.includes('CREATE TABLE IF NOT EXISTS Patients')) {
      if (!localStorage.getItem('bb_sqldb_Patients')) this.saveTable('Patients', []);
    } else if (query.includes('CREATE TABLE IF NOT EXISTS Appointments')) {
      if (!localStorage.getItem('bb_sqldb_Appointments')) this.saveTable('Appointments', []);
    } else if (query.includes('CREATE TABLE IF NOT EXISTS Payments')) {
      if (!localStorage.getItem('bb_sqldb_Payments')) this.saveTable('Payments', []);
    } else if (query.includes('CREATE TABLE IF NOT EXISTS Settings')) {
      if (!localStorage.getItem('bb_sqldb_Settings')) this.saveTable('Settings', []);
    } else if (query.includes('CREATE TABLE IF NOT EXISTS Menu')) {
      if (!localStorage.getItem('bb_sqldb_Menu')) this.saveTable('Menu', []);
    }
  }

  runSync(query: string, ...params: any[]) {
    const flatParams = params.flat();
    const q = query.replace(/\s+/g, ' ').trim();

    // --- SETTINGS ---
    if (q.startsWith('INSERT INTO Settings') || q.startsWith('INSERT OR REPLACE INTO Settings')) {
      const list = this.getTable('Settings');
      const [key, value] = flatParams;
      const idx = list.findIndex((x) => x.key === key);
      if (idx !== -1) {
        list[idx].value = String(value ?? '');
      } else {
        list.push({ key, value: String(value ?? '') });
      }
      this.saveTable('Settings', list);
      return;
    }
    if (q.startsWith('UPDATE Settings SET value = ? WHERE key = ?')) {
      const list = this.getTable('Settings');
      const [value, key] = flatParams;
      const idx = list.findIndex((x) => x.key === key);
      if (idx !== -1) {
        list[idx].value = String(value ?? '');
      } else {
        list.push({ key, value: String(value ?? '') });
      }
      this.saveTable('Settings', list);
      return;
    }
    if (q.startsWith('DELETE FROM Settings')) {
      if (q.includes("WHERE key = 'appointmentReminderHours'")) {
        const list = this.getTable('Settings').filter((x) => x.key !== 'appointmentReminderHours');
        this.saveTable('Settings', list);
      } else {
        this.saveTable('Settings', []);
      }
      return;
    }

    // --- PATIENTS ---
    if (q.startsWith('INSERT INTO Patients')) {
      const list = this.getTable('Patients');
      // Backup restore insert with explicit id
      if (q.includes('(id, name, age, ailment, phone, notes, address, referredBy, defaultFee, created_at)')) {
        const [id, name, age, ailment, phone, notes, address, referredBy, defaultFee, created_at] = flatParams;
        const numId = Number(id) || this.nextId(list);
        list.push({
          id: numId,
          name,
          age: age != null ? Number(age) : null,
          ailment: ailment ?? null,
          phone: phone ?? null,
          notes: notes ?? null,
          address: address ?? null,
          referredBy: referredBy ?? null,
          defaultFee: defaultFee != null ? Number(defaultFee) : 500,
          created_at: created_at || new Date().toISOString(),
        });
        this.lastInsertRowId = numId;
      } else if (q.includes('(name, phone, created_at)')) {
        // calendar.tsx quick customer creation
        const [name, phone, created_at] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          name,
          age: null,
          ailment: 'Bakery Order',
          address: '',
          referredBy: '',
          defaultFee: 500,
          phone: phone ?? null,
          notes: '',
          created_at: created_at || new Date().toISOString(),
        });
        this.lastInsertRowId = id;
      } else if (q.includes('(name, phone, ailment)')) {
        // index.tsx WhatsApp order customer creation
        const [name, phone, ailment] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          name,
          age: null,
          ailment: ailment || 'Bakery Order',
          address: '',
          referredBy: '',
          defaultFee: 500,
          phone: phone ?? null,
          notes: '',
          created_at: new Date().toISOString(),
        });
        this.lastInsertRowId = id;
      } else {
        // patients.tsx full customer creation: (name, age, ailment, address, referredBy, defaultFee, phone, notes)
        const [name, age, ailment, address, referredBy, defaultFee, phone, notes] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          name,
          age: age != null ? Number(age) : null,
          ailment: ailment ?? '',
          address: address ?? '',
          referredBy: referredBy ?? '',
          defaultFee: defaultFee != null ? Number(defaultFee) : 500,
          phone: phone ?? '',
          notes: notes ?? '',
          created_at: new Date().toISOString(),
        });
        this.lastInsertRowId = id;
      }
      this.saveTable('Patients', list);
      return;
    }

    if (q.startsWith('UPDATE Patients')) {
      const list = this.getTable('Patients');
      const [name, age, ailment, address, referredBy, defaultFee, phone, notes, id] = flatParams;
      const idx = list.findIndex((x) => x.id === Number(id));
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          name,
          age: age != null ? Number(age) : null,
          ailment: ailment ?? '',
          address: address ?? '',
          referredBy: referredBy ?? '',
          defaultFee: defaultFee != null ? Number(defaultFee) : 500,
          phone: phone ?? '',
          notes: notes ?? '',
        };
        this.saveTable('Patients', list);
      }
      return;
    }

    if (q.startsWith('DELETE FROM Patients')) {
      if (q.includes('WHERE id = ?')) {
        const [id] = flatParams;
        const list = this.getTable('Patients').filter((x) => x.id !== Number(id));
        this.saveTable('Patients', list);
      } else {
        this.saveTable('Patients', []);
      }
      return;
    }

    // --- MENU ---
    if (q.startsWith('INSERT INTO Menu')) {
      const list = this.getTable('Menu');
      if (q.includes('(id, name, description, price, category, isDaySpecial, quantity, imageUri, isEggless, hasEggless, hasEgg)')) {
        const [id, name, description, price, category, isDaySpecial, quantity, imageUri, isEggless, hasEggless, hasEgg] = flatParams;
        const numId = Number(id) || this.nextId(list);
        list.push({
          id: numId,
          name,
          description: description ?? null,
          price: Number(price) || 0,
          category: category || 'Cakes',
          isDaySpecial: Number(isDaySpecial) || 0,
          quantity: quantity ?? null,
          imageUri: imageUri ?? null,
          isEggless: isEggless != null ? Number(isEggless) : 1,
          hasEggless: hasEggless != null ? Number(hasEggless) : 1,
          hasEgg: hasEgg != null ? Number(hasEgg) : 0,
        });
        this.lastInsertRowId = numId;
      } else if (q.includes('(name, description, price, category, isDaySpecial, quantity, imageUri, isEggless, hasEggless, hasEgg)')) {
        const [name, description, price, category, isDaySpecial, quantity, imageUri, isEggless, hasEggless, hasEgg] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          name,
          description: description ?? null,
          price: Number(price) || 0,
          category: category || 'Cakes',
          isDaySpecial: Number(isDaySpecial) || 0,
          quantity: quantity ?? null,
          imageUri: imageUri ?? null,
          isEggless: isEggless != null ? Number(isEggless) : 1,
          hasEggless: hasEggless != null ? Number(hasEggless) : 1,
          hasEgg: hasEgg != null ? Number(hasEgg) : 0,
        });
        this.lastInsertRowId = id;
      } else {
        // Default seed: (name, description, price, category, isDaySpecial, quantity)
        const [name, description, price, category, isDaySpecial, quantity] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          name,
          description: description ?? null,
          price: Number(price) || 0,
          category: category || 'Cakes',
          isDaySpecial: Number(isDaySpecial) || 0,
          quantity: quantity ?? null,
          imageUri: null,
          isEggless: 1,
          hasEggless: 1,
          hasEgg: 1,
        });
        this.lastInsertRowId = id;
      }
      this.saveTable('Menu', list);
      return;
    }

    if (q.startsWith('UPDATE Menu')) {
      const list = this.getTable('Menu');
      if (q === 'UPDATE Menu SET isDaySpecial = 0') {
        list.forEach((item) => {
          item.isDaySpecial = 0;
        });
        this.saveTable('Menu', list);
        return;
      }
      if (q.includes('SET isDaySpecial = ? WHERE id = ?')) {
        const [isDaySpecial, id] = flatParams;
        const idx = list.findIndex((x) => x.id === Number(id));
        if (idx !== -1) {
          list[idx].isDaySpecial = Number(isDaySpecial) || 0;
          this.saveTable('Menu', list);
        }
        return;
      }
      // Full menu item update
      const [name, description, price, category, isDaySpecial, quantity, imageUri, isEggless, hasEggless, hasEgg, id] = flatParams;
      const idx = list.findIndex((x) => x.id === Number(id));
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          name,
          description: description ?? null,
          price: Number(price) || 0,
          category: category || 'Cakes',
          isDaySpecial: Number(isDaySpecial) || 0,
          quantity: quantity ?? null,
          imageUri: imageUri ?? null,
          isEggless: isEggless != null ? Number(isEggless) : 1,
          hasEggless: hasEggless != null ? Number(hasEggless) : 1,
          hasEgg: hasEgg != null ? Number(hasEgg) : 0,
        };
        this.saveTable('Menu', list);
      }
      return;
    }

    if (q.startsWith('DELETE FROM Menu')) {
      if (q.includes('WHERE id = ?')) {
        const [id] = flatParams;
        const list = this.getTable('Menu').filter((x) => x.id !== Number(id));
        this.saveTable('Menu', list);
      } else {
        this.saveTable('Menu', []);
      }
      return;
    }

    // --- APPOINTMENTS ---
    if (q.startsWith('INSERT INTO Appointments')) {
      const list = this.getTable('Appointments');
      if (q.includes('(id, patientId, date, status, notes, seriesId, notificationId, imageUri, deliveryAddress, isEggless, quantity, rate, cakeTopperText)')) {
        const [id, patientId, date, status, notes, seriesId, notificationId, imageUri, deliveryAddress, isEggless, quantity, rate, cakeTopperText] = flatParams;
        const numId = Number(id) || this.nextId(list);
        list.push({
          id: numId,
          patientId: Number(patientId),
          date,
          status: status || 'Scheduled',
          notes: notes ?? null,
          seriesId: seriesId ?? null,
          notificationId: notificationId ?? null,
          imageUri: imageUri ?? null,
          deliveryAddress: deliveryAddress ?? null,
          isEggless: isEggless != null ? Number(isEggless) : 0,
          quantity: quantity ?? null,
          rate: rate != null ? Number(rate) : null,
          cakeTopperText: cakeTopperText ?? null,
        });
        this.lastInsertRowId = numId;
      } else if (q.includes('seriesId')) {
        // Recurring appointment in calendar.tsx: (patientId, date, status, seriesId, imageUri, notes, deliveryAddress, isEggless, quantity, rate, cakeTopperText)
        const [patientId, date, status, seriesId, imageUri, notes, deliveryAddress, isEggless, quantity, rate, cakeTopperText] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          patientId: Number(patientId),
          date,
          status: status || 'Scheduled',
          seriesId: seriesId ?? null,
          notificationId: null,
          imageUri: imageUri ?? null,
          notes: notes ?? null,
          deliveryAddress: deliveryAddress ?? null,
          isEggless: isEggless != null ? Number(isEggless) : 0,
          quantity: quantity ?? null,
          rate: rate != null ? Number(rate) : null,
          cakeTopperText: cakeTopperText ?? null,
        });
        this.lastInsertRowId = id;
      } else if (q.includes('(patientId, date, status, notes, deliveryAddress, imageUri, isEggless, quantity, rate, cakeTopperText)')) {
        // index.tsx WhatsApp order save
        const [patientId, date, status, notes, deliveryAddress, imageUri, isEggless, quantity, rate, cakeTopperText] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          patientId: Number(patientId),
          date,
          status: status || 'Scheduled',
          seriesId: null,
          notificationId: null,
          notes: notes ?? null,
          deliveryAddress: deliveryAddress ?? null,
          imageUri: imageUri ?? null,
          isEggless: isEggless != null ? Number(isEggless) : 0,
          quantity: quantity ?? null,
          rate: rate != null ? Number(rate) : null,
          cakeTopperText: cakeTopperText ?? null,
        });
        this.lastInsertRowId = id;
      } else {
        // calendar.tsx single appointment save: (patientId, date, status, imageUri, notes, deliveryAddress, isEggless, quantity, rate, cakeTopperText)
        const [patientId, date, status, imageUri, notes, deliveryAddress, isEggless, quantity, rate, cakeTopperText] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          patientId: Number(patientId),
          date,
          status: status || 'Scheduled',
          seriesId: null,
          notificationId: null,
          imageUri: imageUri ?? null,
          notes: notes ?? null,
          deliveryAddress: deliveryAddress ?? null,
          isEggless: isEggless != null ? Number(isEggless) : 0,
          quantity: quantity ?? null,
          rate: rate != null ? Number(rate) : null,
          cakeTopperText: cakeTopperText ?? null,
        });
        this.lastInsertRowId = id;
      }
      this.saveTable('Appointments', list);
      return;
    }

    if (q.startsWith('UPDATE Appointments')) {
      const list = this.getTable('Appointments');
      if (q.includes('SET notificationId = NULL WHERE id = ?')) {
        const [id] = flatParams;
        const idx = list.findIndex((x) => x.id === Number(id));
        if (idx !== -1) {
          list[idx].notificationId = null;
          this.saveTable('Appointments', list);
        }
        return;
      }
      if (q.includes('SET notificationId = ? WHERE id = ?')) {
        const [notificationId, id] = flatParams;
        const idx = list.findIndex((x) => x.id === Number(id));
        if (idx !== -1) {
          list[idx].notificationId = notificationId;
          this.saveTable('Appointments', list);
        }
        return;
      }
      if (q.includes('SET status = ? WHERE id = ?')) {
        const [status, id] = flatParams;
        const idx = list.findIndex((x) => x.id === Number(id));
        if (idx !== -1) {
          list[idx].status = status;
          this.saveTable('Appointments', list);
        }
        return;
      }
      // Full appointment update in calendar.tsx
      const [patientId, date, status, imageUri, notes, deliveryAddress, isEggless, quantity, rate, cakeTopperText, id] = flatParams;
      const idx = list.findIndex((x) => x.id === Number(id));
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          patientId: Number(patientId),
          date,
          status: status || 'Scheduled',
          imageUri: imageUri ?? null,
          notes: notes ?? null,
          deliveryAddress: deliveryAddress ?? null,
          isEggless: isEggless != null ? Number(isEggless) : 0,
          quantity: quantity ?? null,
          rate: rate != null ? Number(rate) : null,
          cakeTopperText: cakeTopperText ?? null,
        };
        this.saveTable('Appointments', list);
      }
      return;
    }

    if (q.startsWith('DELETE FROM Appointments')) {
      if (q.includes('WHERE patientId = ?')) {
        const [patientId] = flatParams;
        const list = this.getTable('Appointments').filter((x) => x.patientId !== Number(patientId));
        this.saveTable('Appointments', list);
      } else if (q.includes('WHERE id IN')) {
        const idsToRemove = flatParams.map(Number);
        const list = this.getTable('Appointments').filter((x) => !idsToRemove.includes(Number(x.id)));
        this.saveTable('Appointments', list);
      } else if (q.includes('WHERE id = ?')) {
        const [id] = flatParams;
        const list = this.getTable('Appointments').filter((x) => x.id !== Number(id));
        this.saveTable('Appointments', list);
      } else {
        this.saveTable('Appointments', []);
      }
      return;
    }

    // --- PAYMENTS ---
    if (q.startsWith('INSERT INTO Payments')) {
      const list = this.getTable('Payments');
      if (q.includes('(id, patientId, appointmentId, amount, date, status)')) {
        const [id, patientId, appointmentId, amount, date, status] = flatParams;
        const numId = Number(id) || this.nextId(list);
        list.push({
          id: numId,
          patientId: Number(patientId),
          appointmentId: appointmentId != null ? Number(appointmentId) : null,
          amount: Number(amount) || 0,
          date,
          status: status || 'Pending',
        });
        this.lastInsertRowId = numId;
      } else if (q.includes('(patientId, appointmentId, amount, date, status)')) {
        const [patientId, appointmentId, amount, date, status] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          patientId: Number(patientId),
          appointmentId: appointmentId != null ? Number(appointmentId) : null,
          amount: Number(amount) || 0,
          date,
          status: status || 'Pending',
        });
        this.lastInsertRowId = id;
      } else {
        // billing.tsx manual payment: (patientId, amount, date, status)
        const [patientId, amount, date, status] = flatParams;
        const id = this.nextId(list);
        list.push({
          id,
          patientId: Number(patientId),
          appointmentId: null,
          amount: Number(amount) || 0,
          date,
          status: status || 'Pending',
        });
        this.lastInsertRowId = id;
      }
      this.saveTable('Payments', list);
      return;
    }

    if (q.startsWith('UPDATE Payments')) {
      const list = this.getTable('Payments');
      if (q.includes('SET patientId = ?, amount = ?, date = ? WHERE id = ?')) {
        const [patientId, amount, date, id] = flatParams;
        const idx = list.findIndex((x) => x.id === Number(id));
        if (idx !== -1) {
          list[idx] = {
            ...list[idx],
            patientId: Number(patientId),
            amount: Number(amount) || 0,
            date,
          };
          this.saveTable('Payments', list);
        }
        return;
      }
      if (q.includes('SET status = ? WHERE id = ?')) {
        const [status, id] = flatParams;
        const idx = list.findIndex((x) => x.id === Number(id));
        if (idx !== -1) {
          list[idx].status = status;
          this.saveTable('Payments', list);
        }
        return;
      }
    }

    if (q.startsWith('DELETE FROM Payments')) {
      if (q.includes('WHERE patientId = ?')) {
        const [patientId] = flatParams;
        const list = this.getTable('Payments').filter((x) => x.patientId !== Number(patientId));
        this.saveTable('Payments', list);
      } else if (q.includes('WHERE appointmentId IN')) {
        const idsToRemove = flatParams.map(Number);
        const list = this.getTable('Payments').filter((x) => !idsToRemove.includes(Number(x.appointmentId)));
        this.saveTable('Payments', list);
      } else if (q.includes('WHERE appointmentId = ?')) {
        const [apptId] = flatParams;
        const list = this.getTable('Payments').filter((x) => x.appointmentId !== Number(apptId));
        this.saveTable('Payments', list);
      } else if (q.includes('WHERE id = ?')) {
        const [id] = flatParams;
        const list = this.getTable('Payments').filter((x) => x.id !== Number(id));
        this.saveTable('Payments', list);
      } else {
        this.saveTable('Payments', []);
      }
      return;
    }
  }

  getFirstSync<T = any>(query: string, ...params: any[]): T | null {
    const list = this.getAllSync<T>(query, ...params);
    return list.length > 0 ? list[0] : null;
  }

  getAllSync<T = any>(query: string, ...params: any[]): T[] {
    const flatParams = params.flat();
    const q = query.replace(/\s+/g, ' ').trim();

    // last_insert_rowid()
    if (q.includes('last_insert_rowid()')) {
      return [{ id: this.lastInsertRowId } as any];
    }

    // --- SETTINGS ---
    if (q === 'SELECT * FROM Settings' || q === 'SELECT key, value FROM Settings' || q === 'SELECT key FROM Settings') {
      return this.getTable('Settings') as T[];
    }
    if (q.startsWith('SELECT value FROM Settings WHERE key =')) {
      let targetKey = flatParams[0];
      if (!targetKey) {
        const m = q.match(/key\s*=\s*'([^']+)'/);
        if (m) targetKey = m[1];
      }
      const row = this.getTable('Settings').find((x) => x.key === targetKey);
      return (row ? [{ value: row.value }] : []) as T[];
    }

    // --- MENU ---
    if (q.includes('SELECT COUNT(*) as cnt FROM Menu')) {
      return [{ cnt: this.getTable('Menu').length } as any];
    }
    if (q.startsWith('SELECT * FROM Menu')) {
      const items = this.getTable('Menu');
      if (q.includes('ORDER BY name ASC')) {
        return items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))) as T[];
      }
      return items.sort((a, b) => {
        if ((b.isDaySpecial || 0) !== (a.isDaySpecial || 0)) {
          return (b.isDaySpecial || 0) - (a.isDaySpecial || 0);
        }
        return String(a.name || '').localeCompare(String(b.name || ''));
      }) as T[];
    }

    // --- PATIENTS ---
    if (q.includes('SELECT COUNT(*) as cnt FROM Patients')) {
      return [{ cnt: this.getTable('Patients').length } as any];
    }
    if (q.startsWith('SELECT id FROM Patients WHERE name = ? OR (phone IS NOT NULL')) {
      const [name, phone] = flatParams;
      const cleanName = String(name || '').toLowerCase();
      const cleanPhone = String(phone || '');
      const found = this.getTable('Patients').find(
        (p) =>
          String(p.name || '').toLowerCase() === cleanName ||
          (cleanPhone && p.phone && String(p.phone) === cleanPhone)
      );
      return (found ? [{ id: found.id }] : []) as T[];
    }
    if (q.startsWith('SELECT id FROM Patients WHERE phone = ? OR name = ?')) {
      const [phone, name] = flatParams;
      const cleanName = String(name || '').toLowerCase();
      const cleanPhone = String(phone || '');
      const found = this.getTable('Patients').find(
        (p) =>
          (cleanPhone && p.phone && String(p.phone) === cleanPhone) ||
          String(p.name || '').toLowerCase() === cleanName
      );
      return (found ? [{ id: found.id }] : []) as T[];
    }
    if (q.startsWith('SELECT id FROM Patients WHERE name = ?')) {
      const [name] = flatParams;
      const cleanName = String(name || '').toLowerCase();
      const found = this.getTable('Patients').find((p) => String(p.name || '').toLowerCase() === cleanName);
      return (found ? [{ id: found.id }] : []) as T[];
    }
    if (q.startsWith('SELECT name FROM Patients WHERE id = ?')) {
      const [id] = flatParams;
      const found = this.getTable('Patients').find((p) => p.id === Number(id));
      return (found ? [{ name: found.name }] : []) as T[];
    }
    if (q.startsWith('SELECT defaultFee FROM Patients WHERE id = ?')) {
      const [id] = flatParams;
      const found = this.getTable('Patients').find((p) => p.id === Number(id));
      return (found ? [{ defaultFee: found.defaultFee ?? 500 }] : []) as T[];
    }
    if (q.includes('FROM Patients')) {
      let list = this.getTable('Patients');
      const searchParam = flatParams[0];
      if (searchParam && typeof searchParam === 'string' && searchParam !== '%' && searchParam !== '%%') {
        const kw = searchParam.replace(/%/g, '').toLowerCase();
        list = list.filter(
          (x) =>
            String(x.name || '').toLowerCase().includes(kw) ||
            String(x.ailment || '').toLowerCase().includes(kw) ||
            String(x.phone || '').toLowerCase().includes(kw)
        );
      }
      return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))) as T[];
    }

    // --- APPOINTMENTS ---
    if (q.includes('SELECT COUNT(*) as cnt FROM Appointments WHERE date LIKE ?')) {
      const [dateLike] = flatParams;
      const prefix = String(dateLike || '').replace(/%/g, '');
      const cnt = this.getTable('Appointments').filter((a) => String(a.date || '').startsWith(prefix)).length;
      return [{ cnt } as any];
    }
    if (q.includes("SELECT COUNT(*) as cnt FROM Appointments WHERE patientId = ? AND status = 'Completed'")) {
      const [patientId] = flatParams;
      const cnt = this.getTable('Appointments').filter(
        (a) => a.patientId === Number(patientId) && a.status === 'Completed'
      ).length;
      return [{ cnt } as any];
    }
    if (q.includes('SELECT A.id, A.date, P.name as patientName FROM Appointments A JOIN Patients P')) {
      const [dateLike] = flatParams;
      const prefix = String(dateLike || '').replace(/%/g, '');
      const patients = this.getTable('Patients');
      const matches = this.getTable('Appointments')
        .filter((a) => String(a.date || '').startsWith(prefix) && a.status !== 'Cancelled')
        .map((a) => {
          const p = patients.find((pt) => pt.id === a.patientId);
          return {
            id: a.id,
            date: a.date,
            patientName: p ? p.name : 'Customer',
          };
        });
      return matches as T[];
    }
    if (q.includes('SELECT A.*, P.name as patientName, P.phone as patientPhone')) {
      const [dateLike] = flatParams;
      const prefix = String(dateLike || '').replace(/%/g, '');
      const patients = this.getTable('Patients');
      const payments = this.getTable('Payments');
      const rows = this.getTable('Appointments')
        .filter((a) => String(a.date || '').startsWith(prefix))
        .map((a) => {
          const p = patients.find((pt) => pt.id === a.patientId);
          const pay = payments.find((py) => py.appointmentId === a.id);
          return {
            ...a,
            patientName: p ? p.name : 'Customer',
            patientPhone: p ? p.phone : '',
            paymentId: pay ? pay.id : null,
            paymentStatus: pay ? pay.status : null,
          };
        })
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      return rows as T[];
    }
    if (q.includes('SELECT date FROM Appointments WHERE date LIKE ?')) {
      const [dateLike] = flatParams;
      const prefix = String(dateLike || '').replace(/%/g, '');
      return this.getTable('Appointments')
        .filter((a) => String(a.date || '').startsWith(prefix) && a.status !== 'Cancelled')
        .map((a) => ({ date: a.date })) as T[];
    }
    if (q.includes('FROM Appointments WHERE seriesId = ? AND date >= ?')) {
      const [seriesId, minDate] = flatParams;
      return this.getTable('Appointments').filter(
        (a) => a.seriesId === seriesId && String(a.date) >= String(minDate)
      ) as T[];
    }
    if (q.includes('FROM Appointments WHERE seriesId = ?')) {
      const [seriesId] = flatParams;
      return this.getTable('Appointments').filter((a) => a.seriesId === seriesId) as T[];
    }
    if (q.includes('FROM Appointments WHERE id = ?')) {
      const [id] = flatParams;
      const found = this.getTable('Appointments').find((a) => a.id === Number(id));
      return (found ? [found] : []) as T[];
    }
    if (q === 'SELECT * FROM Appointments') {
      return this.getTable('Appointments') as T[];
    }

    // --- PAYMENTS ---
    if (q.startsWith('SELECT amount FROM Payments WHERE appointmentId = ?')) {
      const [apptId] = flatParams;
      const found = this.getTable('Payments').find((p) => p.appointmentId === Number(apptId));
      return (found ? [{ amount: Number(found.amount) || 0 }] : []) as T[];
    }
    if (q.startsWith('SELECT status, amount FROM Payments WHERE appointmentId = ?')) {
      const [apptId] = flatParams;
      const found = this.getTable('Payments').find((p) => p.appointmentId === Number(apptId));
      return (found ? [{ status: found.status, amount: Number(found.amount) || 0 }] : []) as T[];
    }
    if (q.startsWith('SELECT id FROM Payments WHERE appointmentId = ?')) {
      const [apptId] = flatParams;
      const found = this.getTable('Payments').find((p) => p.appointmentId === Number(apptId));
      return (found ? [{ id: found.id }] : []) as T[];
    }
    if (q.includes('SELECT Pt.id as patientId, Pt.name as patientName, Pt.phone as patientPhone, SUM(P.amount) as totalOutstanding')) {
      const startDate = flatParams[0];
      const patients = this.getTable('Patients');
      const payments = this.getTable('Payments').filter(
        (p) => p.status === 'Pending' && (!startDate || String(p.date) >= String(startDate))
      );
      const groupedMap = new Map<number, any>();
      for (const pay of payments) {
        const pt = patients.find((x) => x.id === pay.patientId);
        if (!pt) continue;
        const existing = groupedMap.get(pt.id);
        if (existing) {
          existing.totalOutstanding += Number(pay.amount) || 0;
          existing.pendingSessionsCount += 1;
        } else {
          groupedMap.set(pt.id, {
            patientId: pt.id,
            patientName: pt.name,
            patientPhone: pt.phone || '',
            totalOutstanding: Number(pay.amount) || 0,
            pendingSessionsCount: 1,
          });
        }
      }
      return Array.from(groupedMap.values()).sort((a, b) =>
        String(a.patientName || '').localeCompare(String(b.patientName || ''))
      ) as T[];
    }
    if (q.includes('SELECT P.*, Pt.name as patientName, Pt.phone as patientPhone FROM Payments P JOIN Patients Pt')) {
      const startDate = flatParams[0];
      const patients = this.getTable('Patients');
      const payments = this.getTable('Payments')
        .filter((p) => !startDate || String(p.date) >= String(startDate))
        .map((p) => {
          const pt = patients.find((x) => x.id === p.patientId);
          return {
            ...p,
            patientName: pt ? pt.name : 'Customer',
            patientPhone: pt ? pt.phone : '',
          };
        })
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return payments as T[];
    }
    if (q.includes("SELECT SUM(amount) as total FROM Payments WHERE status = 'Pending'")) {
      const startDate = flatParams[0];
      const total = this.getTable('Payments')
        .filter((p) => p.status === 'Pending' && (!startDate || String(p.date) >= String(startDate)))
        .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      return [{ total } as any];
    }
    if (q.includes("SELECT SUM(amount) as total FROM Payments WHERE status = 'Paid'")) {
      const startDate = flatParams[0];
      const total = this.getTable('Payments')
        .filter((p) => p.status === 'Paid' && (!startDate || String(p.date) >= String(startDate)))
        .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      return [{ total } as any];
    }
    if (q.startsWith('SELECT * FROM Payments WHERE patientId = ?')) {
      const [patientId] = flatParams;
      return this.getTable('Payments')
        .filter((p) => p.patientId === Number(patientId))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) as T[];
    }
    if (q === 'SELECT * FROM Payments') {
      return this.getTable('Payments') as T[];
    }

    return [];
  }

  closeSync() {}
}

let db: any = null;

export const getDb = () => {
  if (!db) {
    if (Platform.OS === 'web') {
      db = new WebSQLiteEngine();
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
  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN imageUri TEXT;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN isEggless INTEGER DEFAULT 0;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN quantity TEXT;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN rate REAL;');
  } catch(e) {}
  try {
    database.execSync('ALTER TABLE Appointments ADD COLUMN cakeTopperText TEXT;');
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
    const keys = existing.map((r: any) => r.key);

    // Migration from Hours to Minutes
    if (keys.includes('appointmentReminderHours') && !keys.includes('appointmentReminderMinutes')) {
      const hrRow = existing.find((r: any) => r.key === 'appointmentReminderHours');
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
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'doctorName', 'Baker');
    }
    if (!updatedKeys.includes('clinicName')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'clinicName', 'Sweet Delights');
    }
    if (!updatedKeys.includes('specialization')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'specialization', 'Home Bakery & Custom Cakes');
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
    if (!updatedKeys.includes('weightStep')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'weightStep', '500g');
    }
    if (!updatedKeys.includes('bakeryPickupAddress')) {
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'bakeryPickupAddress', '');
    }
    if (!updatedKeys.includes('riderMessageTemplate')) {
      const defaultRiderTemplate = `⚠️ FRAGILE CAKE DISPATCH / सावधान! केक डिलीवरी 🎂
----------------------------------------
📍 PICKUP / पिकअप पता:
{pickup_address}

📍 DELIVERY DROP LOCATION / डिलीवरी पता:
{customer_address}

👤 CUSTOMER CONTACT / ग्राहक:
{customer_name} ({customer_phone})

📦 ORDER SUMMARY / ऑर्डर विवरण:
{order_details} [{dietary_flag}]

----------------------------------------
⚠️ RIDER HANDLING INSTRUCTIONS / राइडर निर्देश:
- Keep the cake box completely flat / केक बॉक्स को बिल्कुल सीधा रखें।
- Do NOT tilt or place items on top / डिब्बे को झुकाएं नहीं, ऊपर सामान न रखें।
- Drive slowly over speed breakers & potholes / स्पीड ब्रेकर पर गाड़ी धीरे चलाएं।
- Call customer upon reaching gate / गेट पर पहुंचकर ग्राहक को कॉल करें।`;
      database.runSync('INSERT INTO Settings (key, value) VALUES (?, ?)', 'riderMessageTemplate', defaultRiderTemplate);
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
      price REAL NOT NULL,
      category TEXT DEFAULT 'Cakes',
      isDaySpecial INTEGER DEFAULT 0,
      quantity TEXT
    );
  `);

  try {
    database.execSync("ALTER TABLE Menu ADD COLUMN category TEXT DEFAULT 'Cakes';");
  } catch(e) {}
  try {
    database.execSync("ALTER TABLE Menu ADD COLUMN isDaySpecial INTEGER DEFAULT 0;");
  } catch(e) {}
  try {
    database.execSync("ALTER TABLE Menu ADD COLUMN quantity TEXT;");
  } catch(e) {}
  try {
    database.execSync("ALTER TABLE Menu ADD COLUMN imageUri TEXT;");
  } catch(e) {}
  try {
    database.execSync("ALTER TABLE Menu ADD COLUMN isEggless INTEGER DEFAULT 0;");
  } catch(e) {}
  try {
    database.execSync("ALTER TABLE Menu ADD COLUMN hasEggless INTEGER DEFAULT 1;");
  } catch(e) {}
  try {
    database.execSync("ALTER TABLE Menu ADD COLUMN hasEgg INTEGER DEFAULT 1;");
  } catch(e) {}

  try {
    const menuCount = database.getFirstSync<{cnt: number}>('SELECT COUNT(*) as cnt FROM Menu');
    if (menuCount && menuCount.cnt === 0) {
      database.runSync('INSERT INTO Menu (name, description, price, category, isDaySpecial, quantity) VALUES (?, ?, ?, ?, ?, ?)', 'Chocolate Truffle Cake', 'Classic rich dark chocolate cake, eggless.', 1500, 'Cakes', 1, '1 kg');
      database.runSync('INSERT INTO Menu (name, description, price, category, isDaySpecial, quantity) VALUES (?, ?, ?, ?, ?, ?)', 'Red Velvet Cupcakes', 'Soft velvet cupcakes with cream cheese frosting.', 450, 'Cupcakes', 1, '6 pcs');
      database.runSync('INSERT INTO Menu (name, description, price, category, isDaySpecial, quantity) VALUES (?, ?, ?, ?, ?, ?)', 'Vanilla Buttercream Cake', 'Light vanilla sponge with buttercream decoration.', 800, 'Cakes', 0, '0.5 kg');
    }
  } catch (e) {
    console.error("Failed to seed menu catalog:", e);
  }
};
