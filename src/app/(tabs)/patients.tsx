import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Linking } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Contacts from 'expo-contacts/legacy';
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
  notes?: string;
};

export default function PatientsScreen() {
  const db = getDb();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [contactsModalVisible, setContactsModalVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<any[]>([]);
  const [contactsSearch, setContactsSearch] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [ailment, setAilment] = useState('');
  const [address, setAddress] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [defaultFee, setDefaultFee] = useState('500');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [contactsPermission, setContactsPermission] = useState<boolean | null>(null);
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
    try {
      const isUnlockedRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'appUnlocked'");
      const appUnlocked = isUnlockedRow ? isUnlockedRow.value === 'true' : false;

      if (!appUnlocked) {
        const countRow = db.getFirstSync<{cnt: number}>('SELECT COUNT(*) as cnt FROM Patients');
        const count = countRow ? countRow.cnt : 0;
        if (count >= 2) {
          Alert.alert(
            'Trial Limit Reached',
            'You have reached the limit of 2 customers allowed in the Trial Version. To add more customers, please enter a valid Unlock License Code in the settings screen.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
    } catch(e) {
      console.error(e);
    }

    setEditingId(null);
    setName('');
    setAge('');
    setAilment('');
    setAddress('');
    setReferredBy('');
    setDefaultFee('500');
    setPhone('');
    setNotes('');
    setSelectedPatientCreatedAt(null);
    setCompletedSessionsCount(0);
    checkContactsPermission();
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
    setNotes(item.notes || '');
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
    
    checkContactsPermission();
    setModalVisible(true);
  };

  const handleView = (item: Patient) => {
    setEditingId(item.id);
    setName(item.name);
    setAge(item.age ? item.age.toString() : '');
    setAilment(item.ailment);
    setAddress(item.address);
    setReferredBy(item.referredBy);
    setDefaultFee(item.defaultFee ? item.defaultFee.toString() : '500');
    setPhone(item.phone || '');
    setNotes(item.notes || '');
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
    
    setViewModalVisible(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete Customer', 
      'Are you sure you want to delete this customer? This will also remove all their associated appointments and payments.', 
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

    if (!editingId) {
      try {
        const isUnlockedRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'appUnlocked'");
        const appUnlocked = isUnlockedRow ? isUnlockedRow.value === 'true' : false;

        if (!appUnlocked) {
          const countRow = db.getFirstSync<{cnt: number}>('SELECT COUNT(*) as cnt FROM Patients');
          const count = countRow ? countRow.cnt : 0;
          if (count >= 2) {
            Alert.alert(
              'Trial Limit Reached',
              'You have reached the limit of 2 customers allowed in the Trial Version. To add more customers, please enter a valid Unlock License Code in the settings screen.',
              [{ text: 'OK' }]
            );
            return;
          }
        }
      } catch(e) {
        console.error(e);
      }
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

    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length !== 10) {
      alert("Phone number must contain exactly 10 digits (e.g. 9876543210).");
      return;
    }
    const formattedPhone = '+91' + digitsOnly;

    if (notes.length > 150) {
      alert("Case notes cannot exceed 150 characters.");
      return;
    }

    try {
      if (editingId) {
        db.runSync(
          'UPDATE Patients SET name = ?, age = ?, ailment = ?, address = ?, referredBy = ?, defaultFee = ?, phone = ?, notes = ? WHERE id = ?',
          name.trim(),
          parsedAge,
          ailment.trim(),
          address.trim(),
          referredBy.trim(),
          parsedFee,
          formattedPhone,
          notes.trim(),
          editingId
        );
      } else {
        db.runSync(
          'INSERT INTO Patients (name, age, ailment, address, referredBy, defaultFee, phone, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          name.trim(),
          parsedAge,
          ailment.trim(),
          address.trim(),
          referredBy.trim(),
          parsedFee,
          formattedPhone,
          notes.trim()
        );
      }
      setModalVisible(false);
      loadPatients();
    } catch (e) {
      console.error(e);
      alert('Error saving customer');
    }
  };

  const checkContactsPermission = async () => {
    try {
      const { status } = await Contacts.getPermissionsAsync();
      setContactsPermission(status === 'granted');
    } catch(e) {
      console.error(e);
    }
  };

  const handleImportContact = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      setContactsPermission(status === 'granted');

      if (status !== 'granted') {
        Alert.alert(
          'Enable Contacts Access',
          'To import customer details, please allow Contacts access in your phone Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }

      setContactsSearch('');
      setContactsModalVisible(true);
      setIsLoadingContacts(true);

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        pageSize: 20,
      });

      const valid = data.filter(c => c.name && c.phoneNumbers && c.phoneNumbers.length > 0);
      setDeviceContacts(valid);
      setFilteredContacts(valid);
      setIsLoadingContacts(false);
    } catch (e) {
      console.error(e);
      setIsLoadingContacts(false);
      alert('Failed to read device contacts: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const searchContactsOnDemand = async (text: string) => {
    // Sanitize input: allow only letters, numbers, and spaces to block malicious code injection
    const sanitized = text.replace(/[^a-zA-Z0-9 ]/g, '');
    setContactsSearch(sanitized);
    if (!sanitized.trim()) {
      setFilteredContacts(deviceContacts);
      return;
    }
    setIsLoadingContacts(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        name: sanitized,
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        pageSize: 50,
      });
      const valid = data.filter(c => c.name && c.phoneNumbers && c.phoneNumbers.length > 0);
      setFilteredContacts(valid);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const selectContact = (contact: any) => {
    if (contact.name) {
      setName(contact.name);
    }
    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      const num = contact.phoneNumbers[0].number || '';
      const digits = num.replace(/\D/g, '');
      if (digits.length === 12 && digits.startsWith('91')) {
        setPhone(digits.substring(2));
      } else {
        setPhone(digits);
      }
    }
    setContactsModalVisible(false);
  };

  const renderItem = ({ item }: { item: Patient }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleView(item)} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.patientName}>{item.name} {item.age ? `(${item.age})` : ''}</Text>
          <Text style={styles.ailmentText}>{item.ailment || 'No order details'}</Text>
        </View>
        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.actionIcon} onPress={() => handleEdit(item)}>
            <Ionicons name="pencil" size={20} color="#EC4899" />
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
        <Text style={styles.detailsText}>Price: ₹{(item.defaultFee ?? 500.0).toFixed(2)}</Text>
      </View>
      {item.phone ? (
        <View style={styles.detailsRow}>
          <Ionicons name="call-outline" size={16} color="#6B7280" />
          <Text style={styles.detailsText}>{item.phone}</Text>
        </View>
      ) : null}
      {item.notes ? (
        <View style={[styles.detailsRow, { alignItems: 'flex-start' }]}>
          <Ionicons name="document-text-outline" size={16} color="#6B7280" style={{ marginTop: 2 }} />
          <Text style={[styles.detailsText, { flex: 1 }]} numberOfLines={2} ellipsizeMode="tail">
            {item.notes}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search customers..."
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
            <Text style={styles.emptyText}>No customers found.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleOpenNew}>
        <Ionicons name="person-add" size={28} color="white" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Customer' : 'Add New Customer'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 120 }}>
            {editingId && (
              <View style={styles.statsContainerInline}>
                <View style={styles.statBoxInline}>
                  <Text style={styles.statBoxLabel}>Onboarded On</Text>
                  <Text style={styles.statBoxValue}>
                    {selectedPatientCreatedAt ? new Date(selectedPatientCreatedAt).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
                <View style={styles.statBoxInline}>
                  <Text style={styles.statBoxLabel}>Cakes Delivered</Text>
                  <Text style={styles.statBoxValue}>{completedSessionsCount}</Text>
                </View>
              </View>
            )}

            {!editingId && (
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FECDD3', paddingVertical: 12, borderRadius: 12, gap: 8, marginBottom: 20 }} 
                onPress={handleImportContact}
              >
                <Ionicons name="people-outline" size={20} color="#EC4899" />
                <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#EC4899' }}>
                  Quick Import from Phone Contacts
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Full Name *</Text>
            <TextInput style={styles.input} placeholder="John Doe" value={name} onChangeText={setName} />
            
            <Text style={styles.label}>Age</Text>
            <TextInput style={styles.input} placeholder="45" keyboardType="numeric" value={age} onChangeText={setAge} />
            
            <Text style={styles.label}>Default Cake Flavour</Text>
            <TextInput style={styles.input} placeholder="e.g. Chocolate Truffle, Vanilla" value={ailment} onChangeText={setAilment} />
            
            <Text style={styles.label}>Delivery Address</Text>
            <TextInput style={styles.input} placeholder="e.g. 123 Baker Street" value={address} onChangeText={setAddress} />
            
            <Text style={styles.label}>Referred By / Channel</Text>
            <TextInput style={styles.input} placeholder="e.g. Instagram, Friend" value={referredBy} onChangeText={setReferredBy} />
            
            <Text style={styles.label}>Phone Number * (10 Digits)</Text>
            <TextInput style={styles.input} placeholder="9876543210" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

            <Text style={styles.label}>Default Cake Price (₹) *</Text>
            <TextInput style={styles.input} placeholder="500" keyboardType="decimal-pad" value={defaultFee} onChangeText={setDefaultFee} />

            <Text style={styles.label}>Customer Notes (Preferences/Allergies - Max 150 chars)</Text>
            <TextInput 
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
              placeholder="e.g. Prefers eggless. Sister's birthday is in December." 
              multiline 
              maxLength={150} 
              value={notes} 
              onChangeText={setNotes} 
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Customer</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Read-Only Customer Details View Modal */}
      <Modal visible={viewModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setViewModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Customer Details</Text>
            <TouchableOpacity onPress={() => setViewModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 120 }}>
            <View style={styles.statsContainerInline}>
              <View style={styles.statBoxInline}>
                <Text style={styles.statBoxLabel}>Onboarded On</Text>
                <Text style={styles.statBoxValue}>
                  {selectedPatientCreatedAt ? new Date(selectedPatientCreatedAt).toLocaleDateString() : 'N/A'}
                </Text>
              </View>
              <View style={styles.statBoxInline}>
                <Text style={styles.statBoxLabel}>Cakes Delivered</Text>
                <Text style={styles.statBoxValue}>{completedSessionsCount}</Text>
              </View>
            </View>

            <View style={styles.viewRow}>
              <Text style={styles.viewLabel}>Full Name</Text>
              <Text style={styles.viewValue}>{name || 'N/A'}</Text>
            </View>

            <View style={styles.viewRow}>
              <Text style={styles.viewLabel}>Age</Text>
              <Text style={styles.viewValue}>{age ? `${age} years` : 'N/A'}</Text>
            </View>

            <View style={styles.viewRow}>
              <Text style={styles.viewLabel}>Default Cake Flavour</Text>
              <Text style={styles.viewValue}>{ailment || 'N/A'}</Text>
            </View>

            <View style={styles.viewRow}>
              <Text style={styles.viewLabel}>Delivery Address</Text>
              <Text style={styles.viewValue}>{address || 'N/A'}</Text>
            </View>

            <View style={styles.viewRow}>
              <Text style={styles.viewLabel}>Referred By / Channel</Text>
              <Text style={styles.viewValue}>{referredBy || 'N/A'}</Text>
            </View>

            <View style={styles.viewRow}>
              <Text style={styles.viewLabel}>Phone Number</Text>
              <Text style={styles.viewValue}>{phone || 'N/A'}</Text>
            </View>

            <View style={styles.viewRow}>
              <Text style={styles.viewLabel}>Default Cake Price</Text>
              <Text style={styles.viewValue}>₹{parseFloat(defaultFee || '0').toFixed(2)}</Text>
            </View>

            <View style={[styles.viewRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.viewLabel}>Customer Notes (Preferences/Allergies)</Text>
              <Text style={[styles.viewValue, { color: '#5D4037', fontStyle: 'italic', backgroundColor: '#FFF5F5', padding: 16, borderRadius: 12, marginTop: 8 }]}>
                {notes || 'No customer notes recorded yet.'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 30 }}>
              <TouchableOpacity 
                style={[styles.saveButton, { flex: 1, backgroundColor: '#EC4899', marginTop: 0 }]} 
                onPress={() => {
                  setViewModalVisible(false);
                  setModalVisible(true);
                }}
              >
                <Text style={styles.saveButtonText}>Edit Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveButton, { flex: 1, backgroundColor: '#795548', marginTop: 0 }]} 
                onPress={() => setViewModalVisible(false)}
              >
                <Text style={styles.saveButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Contact Selector Modal */}
      <Modal visible={contactsModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setContactsModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Contact</Text>
            <TouchableOpacity onPress={() => setContactsModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search contacts..."
              value={contactsSearch}
              onChangeText={searchContactsOnDemand}
            />
          </View>
          
          {isLoadingContacts ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#6B7280' }}>Loading contacts...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              keyExtractor={(item, index) => index.toString()}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => selectContact(item)}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF1F2', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Text style={{ color: '#EC4899', fontWeight: 'bold', fontSize: 16 }}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827' }}>{item.name}</Text>
                    <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 2 }}>{item.phoneNumbers[0].number}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', marginTop: 40 }}>
                  <Text style={{ fontSize: 16, color: '#6B7280' }}>
                    {contactsSearch ? 'No matching contacts found.' : 'Search to display phone contacts.'}
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDFB' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 16, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 48, fontSize: 16, color: '#111827' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF1F2', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 20, fontWeight: 'bold', color: '#EC4899' },
  cardInfo: { flex: 1 },
  patientName: { fontSize: 18, fontWeight: 'bold', color: '#3E2723' },
  ailmentText: { fontSize: 14, color: '#795548', marginTop: 2 },
  actionContainer: { flexDirection: 'row', gap: 8 },
  actionIcon: { padding: 8, backgroundColor: '#FFFDFB', borderRadius: 20 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 60 },
  detailsText: { marginLeft: 8, fontSize: 14, color: '#5D4037' },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 16, color: '#795548' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: '#EC4899', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
  modalContainer: { flex: 1, backgroundColor: '#FFFDFB', paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3E2723' },
  form: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#5D4037', marginBottom: 8 },
  input: { backgroundColor: 'white', padding: 14, borderRadius: 12, fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  saveButton: { backgroundColor: '#EC4899', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  statsContainerInline: { flexDirection: 'row', gap: 12, marginBottom: 20, backgroundColor: '#FFF1F2', padding: 16, borderRadius: 12 },
  statBoxInline: { flex: 1, alignItems: 'center' },
  statBoxLabel: { fontSize: 12, color: '#9D174D', fontWeight: '600', textTransform: 'uppercase' },
  statBoxValue: { fontSize: 18, fontWeight: 'bold', color: '#EC4899', marginTop: 4 },
  viewRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  viewLabel: { fontSize: 12, fontWeight: '700', color: '#795548', textTransform: 'uppercase', marginBottom: 4 },
  viewValue: { fontSize: 16, color: '#3E2723', fontWeight: '500' }
});
