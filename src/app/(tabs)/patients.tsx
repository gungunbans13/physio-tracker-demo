import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../../database';

type Patient = {
  id: number;
  name: string;
  age: number;
  ailment: string;
  address: string;
  referredBy: string;
  defaultFee: number;
  created_at: string;
  phone: string;
};

export default function PatientsScreen() {
  const db = getDb();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [ailment, setAilment] = useState('');
  const [address, setAddress] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [defaultFee, setDefaultFee] = useState('500');
  const [phone, setPhone] = useState('');
  const [selectedPatientCreatedAt, setSelectedPatientCreatedAt] = useState<string | null>(null);
  const [completedSessionsCount, setCompletedSessionsCount] = useState(0);

  const loadPatients = () => {
    try {
      const q = search ? `%${search}%` : '%';
      const rows = db.getAllSync<Patient>(
        'SELECT * FROM Patients WHERE name LIKE ? ORDER BY name ASC', 
        [q]
      );
      setPatients(rows);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPatients();
    }, [search])
  );

  const handleOpenNew = () => {
    setEditingId(null);
    setName('');
    setAge('');
    setAilment('');
    setAddress('');
    setReferredBy('');
    setDefaultFee('500');
    setPhone('');
    setSelectedPatientCreatedAt(null);
    setCompletedSessionsCount(0);
    setModalVisible(true);
  };

  const handleEdit = (item: Patient) => {
    setEditingId(item.id);
    setName(item.name);
    setAge(item.age ? item.age.toString() : '');
    setAilment(item.ailment);
    setAddress(item.address);
    setReferredBy(item.referredBy);
    setDefaultFee(item.defaultFee ? item.defaultFee.toString() : '500');
    setPhone(item.phone || '');
    setSelectedPatientCreatedAt(item.created_at || null);
    
    try {
      const result = db.getAllSync<{cnt: number}>('SELECT COUNT(*) as cnt FROM Appointments WHERE patientId = ? AND status = ?', [item.id, 'Completed']);
      if (result && result.length > 0) {
        setCompletedSessionsCount(result[0].cnt);
      } else {
        setCompletedSessionsCount(0);
      }
    } catch(e) {
      console.error(e);
      setCompletedSessionsCount(0);
    }
    
    setModalVisible(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete Patient', 
      'Are you sure you want to delete this patient? This will also remove all their associated appointments and payments.', 
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          try {
            db.runSync('DELETE FROM Payments WHERE patientId = ?', id);
            db.runSync('DELETE FROM Appointments WHERE patientId = ?', id);
            db.runSync('DELETE FROM Patients WHERE id = ?', id);
            loadPatients();
          } catch (e) {
            console.error(e);
          }
        }}
      ]
    );
  };

  const handleSave = () => {
    if (!name || name.trim().length < 2) {
      alert("Name is required and must be at least 2 characters.");
      return;
    }
    
    let parsedAge = null;
    if (age) {
      parsedAge = parseInt(age);
      if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120) {
        alert("Please enter a valid age between 0 and 120.");
        return;
      }
    }

    const parsedFee = parseFloat(defaultFee);
    if (isNaN(parsedFee) || parsedFee < 0) {
      alert("Please enter a valid default fee (0 or positive amount).");
      return;
    }

    const cleanedPhone = phone.trim().replace(/[^\d+]/g, '');

    try {
      if (editingId) {
        db.runSync(
          'UPDATE Patients SET name = ?, age = ?, ailment = ?, address = ?, referredBy = ?, defaultFee = ?, phone = ? WHERE id = ?',
          name.trim(),
          parsedAge,
          ailment.trim(),
          address.trim(),
          referredBy.trim(),
          parsedFee,
          cleanedPhone,
          editingId
        );
      } else {
        db.runSync(
          'INSERT INTO Patients (name, age, ailment, address, referredBy, defaultFee, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
          name.trim(),
          parsedAge,
          ailment.trim(),
          address.trim(),
          referredBy.trim(),
          parsedFee,
          cleanedPhone
        );
      }
      setModalVisible(false);
      loadPatients();
    } catch (e) {
      console.error(e);
      alert('Error saving patient');
    }
  };

  const renderItem = ({ item }: { item: Patient }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.patientName}>{item.name} {item.age ? `(${item.age})` : ''}</Text>
          <Text style={styles.ailmentText}>{item.ailment || 'No ailment listed'}</Text>
        </View>
        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.actionIcon} onPress={() => handleEdit(item)}>
            <Ionicons name="pencil" size={20} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionIcon} onPress={() => handleDelete(item.id)}>
            <Ionicons name="trash" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
      {item.address ? (
        <View style={styles.detailsRow}>
          <Ionicons name="location-outline" size={16} color="#6B7280" />
          <Text style={styles.detailsText}>{item.address}</Text>
        </View>
      ) : null}
      {item.referredBy ? (
        <View style={styles.detailsRow}>
          <Ionicons name="person-outline" size={16} color="#6B7280" />
          <Text style={styles.detailsText}>Ref: {item.referredBy}</Text>
        </View>
      ) : null}
      <View style={styles.detailsRow}>
        <Ionicons name="cash-outline" size={16} color="#6B7280" />
        <Text style={styles.detailsText}>Std Fee: ₹{(item.defaultFee ?? 500.0).toFixed(2)}</Text>
      </View>
      {item.phone ? (
        <View style={styles.detailsRow}>
          <Ionicons name="call-outline" size={16} color="#6B7280" />
          <Text style={styles.detailsText}>{item.phone}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search patients..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={patients}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No patients found.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleOpenNew}>
        <Ionicons name="person-add" size={28} color="white" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Patient' : 'Add New Patient'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 40 }}>
            {editingId && (
              <View style={styles.statsContainerInline}>
                <View style={styles.statBoxInline}>
                  <Text style={styles.statBoxLabel}>Onboarded On</Text>
                  <Text style={styles.statBoxValue}>
                    {selectedPatientCreatedAt ? new Date(selectedPatientCreatedAt).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
                <View style={styles.statBoxInline}>
                  <Text style={styles.statBoxLabel}>Sessions Completed</Text>
                  <Text style={styles.statBoxValue}>{completedSessionsCount}</Text>
                </View>
              </View>
            )}

            <Text style={styles.label}>Full Name *</Text>
            <TextInput style={styles.input} placeholder="John Doe" value={name} onChangeText={setName} />
            
            <Text style={styles.label}>Age</Text>
            <TextInput style={styles.input} placeholder="45" keyboardType="numeric" value={age} onChangeText={setAge} />
            
            <Text style={styles.label}>Ailment / Reason for Visit</Text>
            <TextInput style={styles.input} placeholder="Lower back pain" value={ailment} onChangeText={setAilment} />
            
            <Text style={styles.label}>Home Address</Text>
            <TextInput style={styles.input} placeholder="123 Main St, Apt 4" value={address} onChangeText={setAddress} />
            
            <Text style={styles.label}>Referred By</Text>
            <TextInput style={styles.input} placeholder="Dr. Smith" value={referredBy} onChangeText={setReferredBy} />
            
            <Text style={styles.label}>Phone Number</Text>
            <TextInput style={styles.input} placeholder="+919876543210" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

            <Text style={styles.label}>Default Appointment Fee (₹) *</Text>
            <TextInput style={styles.input} placeholder="500" keyboardType="decimal-pad" value={defaultFee} onChangeText={setDefaultFee} />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Patient</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 16, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 48, fontSize: 16, color: '#111827' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 20, fontWeight: 'bold', color: '#3B82F6' },
  cardInfo: { flex: 1 },
  patientName: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  ailmentText: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  actionContainer: { flexDirection: 'row', gap: 8 },
  actionIcon: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 20 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 60 },
  detailsText: { marginLeft: 8, fontSize: 14, color: '#4B5563' },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 16, color: '#6B7280' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB', paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  form: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: 'white', padding: 14, borderRadius: 12, fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  saveButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  statsContainerInline: { flexDirection: 'row', gap: 12, marginBottom: 20, backgroundColor: '#EFF6FF', padding: 16, borderRadius: 12 },
  statBoxInline: { flex: 1, alignItems: 'center' },
  statBoxLabel: { fontSize: 12, color: '#1E40AF', fontWeight: '600', textTransform: 'uppercase' },
  statBoxValue: { fontSize: 18, fontWeight: 'bold', color: '#1D4ED8', marginTop: 4 }
});
