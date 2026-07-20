import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../../database';

type Payment = {
  id: number;
  patientId: number;
  amount: number;
  date: string;
  status: string;
  patientName?: string;
};

type Patient = {
  id: number;
  name: string;
};

export default function BillingScreen() {
  const db = getDb();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [currency, setCurrency] = useState('₹');
  const [modalVisible, setModalVisible] = useState(false);
  
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('Pending');

  const loadData = () => {
    try {
      const cRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'currency'");
      if (cRow) setCurrency(cRow.value);

      const rows = db.getAllSync<Payment>(
        `SELECT P.*, Pt.name as patientName 
         FROM Payments P 
         JOIN Patients Pt ON P.patientId = Pt.id 
         ORDER BY P.date DESC`
      );
      setPayments(rows);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      try {
        const pts = db.getAllSync<Patient>('SELECT id, name FROM Patients ORDER BY name ASC');
        setPatients(pts);
      } catch (e) {
        console.error(e);
      }
    }, [])
  );

  const handleSavePayment = () => {
    if (!selectedPatientId || !amount) {
      alert('Please select a patient and enter an amount.');
      return;
    }
    
    try {
      db.runSync(
        'INSERT INTO Payments (patientId, amount, date, status) VALUES (?, ?, ?, ?)',
        selectedPatientId,
        parseFloat(amount),
        new Date().toISOString(),
        status
      );
      setModalVisible(false);
      loadData();
      setSelectedPatientId(null);
      setAmount('');
      setStatus('Pending');
    } catch (e) {
      console.error(e);
      alert('Error saving payment');
    }
  };

  const toggleStatus = (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'Pending' ? 'Paid' : 'Pending';
    try {
      db.runSync('UPDATE Payments SET status = ? WHERE id = ?', nextStatus, id);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const renderItem = ({ item }: { item: Payment }) => {
    const dateStr = new Date(item.date).toLocaleDateString();
    const isPaid = item.status === 'Paid';
    
    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          <Text style={styles.patientName}>{item.patientName}</Text>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>
        <View style={styles.amountContainer}>
          <Text style={styles.amountText}>{currency}{item.amount.toFixed(2)}</Text>
          <TouchableOpacity 
            style={[styles.statusBadge, { backgroundColor: isPaid ? '#10B981' : '#EF4444' }]}
            onPress={() => toggleStatus(item.id, item.status)}
          >
            <Text style={styles.statusText}>{item.status}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const totalPending = payments.filter(p => p.status === 'Pending').reduce((acc, p) => acc + p.amount, 0);
  const totalPaid = payments.filter(p => p.status === 'Paid').reduce((acc, p) => acc + p.amount, 0);

  return (
    <View style={styles.container}>
      <View style={styles.summaryContainer}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Pending</Text>
          <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{currency}{totalPending.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Paid</Text>
          <Text style={[styles.summaryValue, { color: '#10B981' }]}>{currency}{totalPaid.toFixed(2)}</Text>
        </View>
      </View>

      <FlatList
        data={payments}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No payment records.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Payment Record</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.form}>
            <Text style={styles.label}>Select Patient</Text>
            <FlatList 
              data={patients}
              keyExtractor={item => item.id.toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 60, marginBottom: 20 }}
              renderItem={({item}) => (
                <TouchableOpacity 
                  style={[styles.patientPill, selectedPatientId === item.id && styles.patientPillSelected]}
                  onPress={() => setSelectedPatientId(item.id)}
                >
                  <Text style={[styles.patientPillText, selectedPatientId === item.id && styles.patientPillTextSelected]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />

            <TextInput 
              style={styles.input} 
              placeholder="Amount ($) *" 
              keyboardType="decimal-pad" 
              value={amount} 
              onChangeText={setAmount} 
            />

            <Text style={styles.label}>Initial Status</Text>
            <View style={styles.statusToggleContainer}>
              <TouchableOpacity 
                style={[styles.statusToggle, status === 'Pending' && styles.statusToggleSelectedPending]}
                onPress={() => setStatus('Pending')}
              >
                <Text style={[styles.statusToggleText, status === 'Pending' && styles.statusToggleTextSelected]}>Pending</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.statusToggle, status === 'Paid' && styles.statusToggleSelectedReceived]}
                onPress={() => setStatus('Paid')}
              >
                <Text style={[styles.statusToggleText, status === 'Paid' && styles.statusToggleTextSelected]}>Paid</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.saveButton} onPress={handleSavePayment}>
              <Text style={styles.saveButtonText}>Save Payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  summaryContainer: { flexDirection: 'row', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  summaryValue: { fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  listContent: { padding: 16, paddingBottom: 100 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  cardInfo: { flex: 1 },
  patientName: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  dateText: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  amountContainer: { alignItems: 'flex-end' },
  amountText: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 16, color: '#6B7280' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
  modalContainer: { flex: 1, backgroundColor: '#F9FAFB', paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  form: { padding: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 12 },
  patientPill: { backgroundColor: '#E5E7EB', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 10, alignSelf: 'flex-start' },
  patientPillSelected: { backgroundColor: '#3B82F6' },
  patientPillText: { color: '#374151', fontWeight: '500' },
  patientPillTextSelected: { color: 'white', fontWeight: 'bold' },
  input: { backgroundColor: 'white', padding: 16, borderRadius: 12, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  statusToggleContainer: { flexDirection: 'row', marginBottom: 30, gap: 10 },
  statusToggle: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: 'white' },
  statusToggleSelectedPending: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  statusToggleSelectedReceived: { backgroundColor: '#10B981', borderColor: '#10B981' },
  statusToggleText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  statusToggleTextSelected: { color: 'white' },
  saveButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});
