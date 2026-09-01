import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Linking, Alert, Platform, ScrollView } from 'react-native';
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
  patientPhone?: string;
};

type Patient = {
  id: number;
  name: string;
  phone?: string;
};

type GroupedOutstanding = {
  patientId: number;
  patientName: string;
  patientPhone: string;
  totalOutstanding: number;
  pendingSessionsCount: number;
};

type TimeFilter = 'this_month' | 'last_3_months' | 'this_year' | 'all';

export default function BillingScreen() {
  const db = getDb();
  const [activeTab, setActiveTab] = useState<'outstanding' | 'all'>('outstanding');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('this_month');
  const [outstandingList, setOutstandingList] = useState<GroupedOutstanding[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [currency, setCurrency] = useState('₹');

  // Stats summaries
  const [totalPendingSum, setTotalPendingSum] = useState(0);
  const [totalPaidSum, setTotalPaidSum] = useState(0);

  // Manual payment entry modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('Pending');

  // Detailed History Modal state
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [historyPayments, setHistoryPayments] = useState<Payment[]>([]);

  const getFilterStartDate = useCallback(() => {
    const now = new Date();
    if (timeFilter === 'this_month') {
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } else if (timeFilter === 'last_3_months') {
      const date = new Date();
      date.setMonth(now.getMonth() - 3);
      return date.toISOString();
    } else if (timeFilter === 'this_year') {
      return new Date(now.getFullYear(), 0, 1).toISOString();
    }
    return null; // All time
  }, [timeFilter]);

  const loadData = useCallback(() => {
    try {
      const cRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'currency'");
      if (cRow) setCurrency(cRow.value);

      const startDate = getFilterStartDate();

      // 1. Load Grouped Outstanding Balances
      let groupedQuery = `SELECT Pt.id as patientId, Pt.name as patientName, Pt.phone as patientPhone,
                            SUM(P.amount) as totalOutstanding, COUNT(P.id) as pendingSessionsCount
                          FROM Payments P
                          JOIN Patients Pt ON P.patientId = Pt.id
                          WHERE P.status = 'Pending' `;
      let groupedParams: any[] = [];
      if (startDate) {
        groupedQuery += `AND P.date >= ? `;
        groupedParams.push(startDate);
      }
      groupedQuery += `GROUP BY Pt.id ORDER BY Pt.name ASC`;
      const grouped = db.getAllSync<GroupedOutstanding>(groupedQuery, groupedParams);
      setOutstandingList(grouped);

      // 2. Load All Transactions
      let txQuery = `SELECT P.*, Pt.name as patientName, Pt.phone as patientPhone 
                     FROM Payments P 
                     JOIN Patients Pt ON P.patientId = Pt.id `;
      let txParams: any[] = [];
      if (startDate) {
        txQuery += `WHERE P.date >= ? `;
        txParams.push(startDate);
      }
      txQuery += `ORDER BY P.date DESC`;
      const transactions = db.getAllSync<Payment>(txQuery, txParams);
      setAllPayments(transactions);

      // 3. Compute sums for the selected period
      let pendingSumQuery = "SELECT SUM(amount) as total FROM Payments WHERE status = 'Pending'";
      let paidSumQuery = "SELECT SUM(amount) as total FROM Payments WHERE status = 'Paid'";
      let sumParams: any[] = [];
      if (startDate) {
        pendingSumQuery += " AND date >= ?";
        paidSumQuery += " AND date >= ?";
        sumParams.push(startDate);
      }
      
      const pRes = db.getAllSync<{total: number}>(pendingSumQuery, sumParams);
      const paidRes = db.getAllSync<{total: number}>(paidSumQuery, sumParams);
      
      setTotalPendingSum(pRes[0]?.total || 0);
      setTotalPaidSum(paidRes[0]?.total || 0);

    } catch (e) {
      console.error(e);
    }
  }, [getFilterStartDate, db]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      try {
        const pts = db.getAllSync<Patient>('SELECT id, name, phone FROM Patients ORDER BY name ASC');
        setPatients(pts);
      } catch (e) {
        console.error(e);
      }
    }, [loadData])
  );

  // Reload data whenever timeFilter changes
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [timeFilter, loadData])
  );

  const handleSavePayment = () => {
    if (!selectedPatientId || !amount) {
      alert('Please select a customer and enter an amount.');
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

  const handleTogglePaymentStatus = (payment: Payment) => {
    const isPending = payment.status === 'Pending';
    
    if (isPending) {
      Alert.alert(
        'Collect Payment',
        `Mark payment of ${currency}${payment.amount.toFixed(2)} as Paid?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mark Paid', onPress: () => updatePaymentStatus(payment.id, 'Paid') }
        ]
      );
    } else {
      Alert.alert(
        'Revert Payment Status',
        `WARNING: Are you sure you want to revert this collected payment of ${currency}${payment.amount.toFixed(2)} back to Pending? This should only be done to correct entry mistakes.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Revert to Pending', style: 'destructive', onPress: () => updatePaymentStatus(payment.id, 'Pending') }
        ]
      );
    }
  };

  const updatePaymentStatus = (id: number, nextStatus: string) => {
    try {
      db.runSync('UPDATE Payments SET status = ? WHERE id = ?', nextStatus, id);
      loadData();
      if (historyPatient) {
        loadHistoryPayments(historyPatient.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadHistoryPayments = (patientId: number) => {
    try {
      const rows = db.getAllSync<Payment>(
        'SELECT * FROM Payments WHERE patientId = ? ORDER BY date DESC',
        [patientId]
      );
      setHistoryPayments(rows);
    } catch (e) {
      console.error(e);
    }
  };

  const openHistoryModal = (patient: Patient) => {
    setHistoryPatient(patient);
    loadHistoryPayments(patient.id);
    setHistoryModalVisible(true);
  };

  const handleSendGroupedReminder = (item: GroupedOutstanding) => {
    if (!item.patientPhone) return;

    const whatsappMsg = `Hello *${item.patientName}*, this is a gentle reminder that a total outstanding balance of *${currency}${item.totalOutstanding.toFixed(2)}* for your last *${item.pendingSessionsCount}* bakery order(s) is currently pending. Please let us know if you need any assistance. Thanks!`;
    const smsMsg = `Hello ${item.patientName}, this is a gentle reminder that a total outstanding balance of ${currency}${item.totalOutstanding.toFixed(2)} for your last ${item.pendingSessionsCount} bakery order(s) is pending. Thanks!`;

    Alert.alert(
      'Send Outstanding Payment Reminder',
      `Send total reminder of ${currency}${item.totalOutstanding.toFixed(2)} to ${item.patientName} (${item.patientPhone})`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send via WhatsApp', onPress: () => {
          const url = `whatsapp://send?phone=${item.patientPhone}&text=${encodeURIComponent(whatsappMsg)}`;
          Linking.openURL(url).catch(() => alert('WhatsApp is not installed on this device.'));
        }},
        { text: 'Send via SMS', onPress: () => {
          const separator = Platform.OS === 'ios' ? '&' : '?';
          const url = `sms:${item.patientPhone}${separator}body=${encodeURIComponent(smsMsg)}`;
          Linking.openURL(url).catch(() => alert('Could not open SMS application.'));
        }}
      ]
    );
  };

  const handleSendSingleReminder = (payment: Payment) => {
    if (!payment.patientPhone) return;

    const dateStr = new Date(payment.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const whatsappMsg = `Hello *${payment.patientName}*, this is a gentle reminder that a payment of *${currency}${payment.amount.toFixed(2)}* for your bakery order on *${dateStr}* is currently pending. Please let us know if you need any assistance. Thanks!`;
    const smsMsg = `Hello ${payment.patientName}, this is a gentle reminder that a payment of ${currency}${payment.amount.toFixed(2)} for your bakery order on ${dateStr} is pending. Thanks!`;

    Alert.alert(
      'Send Order Payment Reminder',
      `Send reminder to ${payment.patientName} (${payment.patientPhone})`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send via WhatsApp', onPress: () => {
          const url = `whatsapp://send?phone=${payment.patientPhone}&text=${encodeURIComponent(whatsappMsg)}`;
          Linking.openURL(url).catch(() => alert('WhatsApp is not installed on this device.'));
        }},
        { text: 'Send via SMS', onPress: () => {
          const separator = Platform.OS === 'ios' ? '&' : '?';
          const url = `sms:${payment.patientPhone}${separator}body=${encodeURIComponent(smsMsg)}`;
          Linking.openURL(url).catch(() => alert('Could not open SMS application.'));
        }}
      ]
    );
  };

  const renderGroupedItem = ({ item }: { item: GroupedOutstanding }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.patientName}>{item.patientName}</Text>
        <Text style={styles.sessionCount}>{item.pendingSessionsCount} order{item.pendingSessionsCount > 1 ? 's' : ''} pending</Text>
      </View>
      <View style={styles.amountContainer}>
        <Text style={[styles.amountText, { color: '#EF4444' }]}>{currency}{item.totalOutstanding.toFixed(2)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {item.patientPhone ? (
            <TouchableOpacity style={styles.reminderBtn} onPress={() => handleSendGroupedReminder(item)}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity 
            style={styles.historyBtn}
            onPress={() => openHistoryModal({ id: item.patientId, name: item.patientName, phone: item.patientPhone })}
          >
            <Text style={styles.historyBtnText}>History</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

const formatPaymentDateDetails = (dateStr: string) => {
  if (!dateStr) return { formattedDate: '', formattedTime: '' };
  
  let cleanStr = dateStr.trim();
  const hasTime = cleanStr.includes(':');
  
  if (!hasTime) {
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const localDate = new Date(year, month, day);
      if (!isNaN(localDate.getTime())) {
        const formattedDate = localDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        return { formattedDate, formattedTime: '' };
      }
    }
  }
  
  const isoStr = cleanStr.replace(' ', 'T');
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) {
    return { formattedDate: cleanStr, formattedTime: '' };
  }
  
  const formattedDate = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { formattedDate, formattedTime };
};

  const renderFlatTransactionItem = ({ item }: { item: Payment }) => {
    const { formattedDate } = formatPaymentDateDetails(item.date);
    const isPaid = item.status === 'Paid';
    
    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          <Text style={styles.patientName}>{item.patientName}</Text>
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>
        <View style={styles.amountContainer}>
          <Text style={styles.amountText}>{currency}{item.amount.toFixed(2)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!isPaid && item.patientPhone ? (
              <TouchableOpacity style={styles.reminderBtn} onPress={() => handleSendSingleReminder(item)}>
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity 
              style={[styles.statusBadge, { backgroundColor: isPaid ? '#10B981' : '#EF4444' }]}
              onPress={() => handleTogglePaymentStatus(item)}
            >
              <Text style={styles.statusText}>{item.status}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const getFilterLabel = () => {
    if (timeFilter === 'this_month') return 'This Month';
    if (timeFilter === 'last_3_months') return 'Last 3 Months';
    if (timeFilter === 'this_year') return 'This Year';
    return 'All Time';
  };

  return (
    <View style={styles.container}>
      {/* Tab Selectors */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'outstanding' && styles.tabActive]}
          onPress={() => setActiveTab('outstanding')}
        >
          <Text style={[styles.tabText, activeTab === 'outstanding' && styles.tabTextActive]}>Outstanding Bills</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>All Transactions</Text>
        </TouchableOpacity>
      </View>

      {/* Date Filter Pills */}
      <View style={styles.filterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity 
            style={[styles.filterPill, timeFilter === 'this_month' && styles.filterPillActive]}
            onPress={() => setTimeFilter('this_month')}
          >
            <Text style={[styles.filterPillText, timeFilter === 'this_month' && styles.filterPillTextActive]}>This Month</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterPill, timeFilter === 'last_3_months' && styles.filterPillActive]}
            onPress={() => setTimeFilter('last_3_months')}
          >
            <Text style={[styles.filterPillText, timeFilter === 'last_3_months' && styles.filterPillTextActive]}>Last 3 Months</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterPill, timeFilter === 'this_year' && styles.filterPillActive]}
            onPress={() => setTimeFilter('this_year')}
          >
            <Text style={[styles.filterPillText, timeFilter === 'this_year' && styles.filterPillTextActive]}>This Year</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterPill, timeFilter === 'all' && styles.filterPillActive]}
            onPress={() => setTimeFilter('all')}
          >
            <Text style={[styles.filterPillText, timeFilter === 'all' && styles.filterPillTextActive]}>All Time</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Selected Period Indicator & Summary boxes */}
      <View style={styles.summaryWrapper}>
        <View style={styles.periodBanner}>
          <Ionicons name="funnel-outline" size={14} color="#6B7280" />
          <Text style={styles.periodText}>Showing: {getFilterLabel()}</Text>
        </View>
        <View style={styles.summaryContainer}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Outstanding</Text>
            <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{currency}{totalPendingSum.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Collected</Text>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>{currency}{totalPaidSum.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      {/* List content based on tabs */}
      {activeTab === 'outstanding' ? (
        <FlatList
          data={outstandingList}
          keyExtractor={(item) => item.patientId.toString()}
          renderItem={renderGroupedItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="sparkles" size={48} color="#D1D5DB" style={{ marginBottom: 10 }} />
              <Text style={styles.emptyText}>All payments cleared for this period!</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={allPayments}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderFlatTransactionItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No transactions in this period.</Text>
            </View>
          }
        />
      )}

      {/* Manual log FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      {/* Add Manual Payment Modal */}
      {/* Add Manual Payment Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Payment Record</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.form}>
            <Text style={styles.label}>Select Customer</Text>
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
              placeholder="Amount (₹) *" 
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

      {/* Customer Detailed History Modal */}
      <Modal visible={historyModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHistoryModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{historyPatient?.name}</Text>
              <Text style={styles.modalSubtitle}>Payment History & Logs</Text>
            </View>
            <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={historyPayments}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{ padding: 20 }}
            renderItem={({ item }) => {
              const isPaid = item.status === 'Paid';
              const { formattedDate, formattedTime } = formatPaymentDateDetails(item.date);
              return (
                <View style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyDate}>{formattedDate}</Text>
                    {formattedTime ? <Text style={styles.historyTime}>{formattedTime}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.historyAmount}>{currency}{item.amount.toFixed(2)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {!isPaid && historyPatient?.phone ? (
                        <TouchableOpacity style={styles.reminderBtn} onPress={() => handleSendSingleReminder(item)}>
                          <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity 
                        style={[styles.statusBadge, { backgroundColor: isPaid ? '#10B981' : '#EF4444' }]}
                        onPress={() => handleTogglePaymentStatus(item)}
                      >
                        <Text style={styles.statusText}>{item.status}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No order delivery payments recorded.</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDFB' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', padding: 4, margin: 16, marginBottom: 8, borderRadius: 12 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  tabText: { color: '#5D4037', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#3E2723', fontWeight: 'bold' },
  
  // Filter bar styles
  filterWrapper: { backgroundColor: '#FFFDFB', paddingHorizontal: 16, marginBottom: 12 },
  filterScroll: { gap: 8, paddingVertical: 4 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E5E7EB' },
  filterPillActive: { backgroundColor: '#EC4899' },
  filterPillText: { fontSize: 12, color: '#5D4037', fontWeight: '600' },
  filterPillTextActive: { color: 'white', fontWeight: 'bold' },

  summaryWrapper: { marginHorizontal: 16, backgroundColor: 'white', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  periodBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  periodText: { fontSize: 12, color: '#795548', fontWeight: 'bold' },
  summaryContainer: { flexDirection: 'row', padding: 16, paddingTop: 6, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#795548', fontWeight: '600', textTransform: 'uppercase' },
  summaryValue: { fontSize: 20, fontWeight: 'bold', marginTop: 6 },
  listContent: { padding: 16, paddingBottom: 100 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardInfo: { flex: 1 },
  patientName: { fontSize: 17, fontWeight: 'bold', color: '#3E2723' },
  sessionCount: { fontSize: 14, color: '#DC2626', fontWeight: '600', marginTop: 4 },
  dateText: { fontSize: 14, color: '#795548', marginTop: 4 },
  amountContainer: { alignItems: 'flex-end', gap: 6 },
  amountText: { fontSize: 18, fontWeight: 'bold', color: '#3E2723' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
  reminderBtn: { padding: 6, backgroundColor: '#FFF5F5', borderRadius: 20 },
  historyBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#EC4899', borderRadius: 12 },
  historyBtnText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 15, color: '#795548', fontWeight: '500' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: '#EC4899', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
  modalContainer: { flex: 1, backgroundColor: '#FFFDFB', paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: 'white' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3E2723' },
  modalSubtitle: { fontSize: 14, color: '#795548', marginTop: 2 },
  form: { padding: 24 },
  label: { fontSize: 15, fontWeight: '700', color: '#5D4037', marginBottom: 12 },
  patientPill: { backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, marginRight: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E5E7EB' },
  patientPillSelected: { backgroundColor: '#EC4899', borderColor: '#EC4899' },
  patientPillText: { color: '#5D4037', fontWeight: '600' },
  patientPillTextSelected: { color: 'white', fontWeight: 'bold' },
  input: { backgroundColor: 'white', padding: 16, borderRadius: 12, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  statusToggleContainer: { flexDirection: 'row', marginBottom: 30, gap: 10 },
  statusToggle: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: 'white' },
  statusToggleSelectedPending: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  statusToggleSelectedReceived: { backgroundColor: '#10B981', borderColor: '#10B981' },
  statusToggleText: { fontSize: 16, fontWeight: '600', color: '#5D4037' },
  statusToggleTextSelected: { color: 'white' },
  saveButton: { backgroundColor: '#EC4899', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  historyDate: { fontSize: 15, fontWeight: '700', color: '#3E2723' },
  historyTime: { fontSize: 13, color: '#795548', marginTop: 2 },
  historyAmount: { fontSize: 16, fontWeight: 'bold', color: '#3E2723' }
});
