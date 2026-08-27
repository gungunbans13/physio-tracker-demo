import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Share } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../../database';

type MenuItem = {
  id: number;
  name: string;
  description: string;
  price: number;
};

export default function MenuScreen() {
  const db = getDb();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');

  const loadMenu = () => {
    try {
      const rows = db.getAllSync<MenuItem>('SELECT * FROM Menu ORDER BY name ASC');
      setMenuItems(rows);
    } catch (e) {
      console.error("Failed to load menu catalog:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadMenu();
    }, [])
  );

  const handleOpenNew = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPrice('');
    setModalVisible(true);
  };

  const handleEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description || '');
    setPrice(item.price.toString());
    setModalVisible(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete Product',
      'Are you sure you want to remove this item from your menu?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          try {
            db.runSync('DELETE FROM Menu WHERE id = ?', id);
            loadMenu();
          } catch (e) {
            console.error(e);
          }
        }}
      ]
    );
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert("Product name is required.");
      return;
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      alert("Please enter a valid price.");
      return;
    }

    try {
      if (editingId) {
        db.runSync(
          'UPDATE Menu SET name = ?, description = ?, price = ? WHERE id = ?',
          name.trim(),
          description.trim() || null,
          parsedPrice,
          editingId
        );
      } else {
        db.runSync(
          'INSERT INTO Menu (name, description, price) VALUES (?, ?, ?)',
          name.trim(),
          description.trim() || null,
          parsedPrice
        );
      }
      setModalVisible(false);
      loadMenu();
    } catch (e) {
      console.error(e);
      alert("Failed to save menu product.");
    }
  };

  const handleShareMenu = async () => {
    if (menuItems.length === 0) {
      alert("Your menu catalog is empty. Please add items first.");
      return;
    }
    try {
      const bakeryNameRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'clinicName'");
      const bakeryName = bakeryNameRow ? bakeryNameRow.value : 'Sweet Delights';

      let messageText = `🎂 *${bakeryName} Menu* 🎂\n\n`;
      menuItems.forEach((item) => {
        messageText += `🍰 *${item.name}*\n`;
        if (item.description) messageText += `   _${item.description}_\n`;
        messageText += `   Price: ₹${item.price.toFixed(2)}\n\n`;
      });
      messageText += `Message us to place your order! ✨`;

      await Share.share({
        message: messageText
      });
    } catch (e) {
      console.error(e);
    }
  };

  const renderItem = ({ item }: { item: MenuItem }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.itemDesc}>{item.description}</Text>
        ) : null}
        <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
      </View>
      <View style={styles.actionContainer}>
        <TouchableOpacity style={styles.actionIcon} onPress={() => handleEdit(item)}>
          <Ionicons name="pencil" size={18} color="#EC4899" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionIcon} onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.shareHeader}>
        <Text style={styles.headerSubtitle}>Share your catalog instantly with customers!</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShareMenu}>
          <Ionicons name="logo-whatsapp" size={20} color="white" />
          <Text style={styles.shareBtnText}>Share Menu via WhatsApp</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={menuItems}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={48} color="#A8A29E" />
            <Text style={styles.emptyText}>Menu is empty. Add products to display them here.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleOpenNew}>
        <Ionicons name="add" size={32} color="white" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Product' : 'Add New Product'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 60 }}>
            <Text style={styles.label}>Product Name *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Chocolate Truffle Cake (1kg)" 
              value={name} 
              onChangeText={setName} 
            />

            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput 
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
              placeholder="e.g. Rich dark chocolate cream layers, eggless" 
              multiline 
              value={description} 
              onChangeText={setDescription} 
            />

            <Text style={styles.label}>Price (₹) *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. 1200" 
              keyboardType="decimal-pad" 
              value={price} 
              onChangeText={setPrice} 
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Product</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDFB' },
  shareHeader: { padding: 16, backgroundColor: '#FFF5F5', borderBottomWidth: 1, borderBottomColor: '#FECDD3', alignItems: 'center', gap: 10 },
  headerSubtitle: { fontSize: 14, color: '#795548', fontWeight: '600', textAlign: 'center' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#25D366', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, gap: 8, shadowColor: '#25D366', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  shareBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  listContent: { padding: 16, paddingBottom: 100 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardInfo: { flex: 1, gap: 4 },
  itemName: { fontSize: 17, fontWeight: 'bold', color: '#3E2723' },
  itemDesc: { fontSize: 13, color: '#795548', fontStyle: 'italic' },
  itemPrice: { fontSize: 15, fontWeight: 'bold', color: '#EC4899', marginTop: 4 },
  actionContainer: { flexDirection: 'row', gap: 8 },
  actionIcon: { padding: 8, backgroundColor: '#FFFDFB', borderRadius: 20, borderWidth: 1, borderColor: '#FFF1F2' },
  emptyContainer: { alignItems: 'center', marginTop: 80, gap: 12, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, color: '#A8A29E', fontWeight: '500', textAlign: 'center', lineHeight: 22 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: '#EC4899', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
  modalContainer: { flex: 1, backgroundColor: '#FFFDFB', paddingTop: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: 'white' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3E2723' },
  form: { padding: 24 },
  label: { fontSize: 15, fontWeight: '600', color: '#5D4037', marginBottom: 8 },
  input: { backgroundColor: 'white', padding: 14, borderRadius: 12, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  saveButton: { backgroundColor: '#EC4899', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});
