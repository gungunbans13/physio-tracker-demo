import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Share, Switch } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getDb } from '../../database';

type MenuItem = {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  isDaySpecial: number; // 0 or 1
  quantity?: string;
};

const DEFAULT_CATEGORIES = ['Cakes', 'Cookies', 'Cupcakes', 'Other'];

export default function MenuScreen() {
  const db = getDb();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [activeTab, setActiveTab] = useState('All');
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Cakes');
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState(false);
  const [isDaySpecial, setIsDaySpecial] = useState(false);
  const [quantity, setQuantity] = useState('');

  // Dynamically compute available categories from database items + defaults
  const availableCategories = useMemo(() => {
    const dbCats = menuItems.map(item => item.category).filter(Boolean);
    const combined = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCats]));
    return combined;
  }, [menuItems]);

  // Dynamically compute filter tabs
  const filterTabs = useMemo(() => {
    return ['All', "Day's Specials", ...availableCategories];
  }, [availableCategories]);

  const loadMenu = () => {
    try {
      const rows = db.getAllSync<MenuItem>('SELECT * FROM Menu ORDER BY name ASC');
      setMenuItems(rows);
      applyFilter(rows, activeTab);
    } catch (e) {
      console.error("Failed to load menu catalog:", e);
    }
  };

  const applyFilter = (items: MenuItem[], tab: string) => {
    if (tab === 'All') {
      setFilteredItems(items);
    } else if (tab === "Day's Specials") {
      setFilteredItems(items.filter(item => item.isDaySpecial === 1));
    } else {
      setFilteredItems(items.filter(item => item.category === tab));
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadMenu();
    }, [activeTab])
  );

  const handleTabPress = (tab: string) => {
    setActiveTab(tab);
    applyFilter(menuItems, tab);
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPrice('');
    setCategory('Cakes');
    setCustomCategory('');
    setIsCustomCategoryMode(false);
    setIsDaySpecial(false);
    setQuantity('');
    setModalVisible(true);
  };

  const handleEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description || '');
    setPrice(item.price.toString());
    
    const existingCat = item.category || 'Cakes';
    setCategory(existingCat);
    setCustomCategory('');
    setIsCustomCategoryMode(false);

    setIsDaySpecial(item.isDaySpecial === 1);
    setQuantity(item.quantity || '');
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

    const finalCategory = isCustomCategoryMode && customCategory.trim() 
      ? customCategory.trim() 
      : category;

    if (!finalCategory) {
      alert("Please select or enter a category.");
      return;
    }

    try {
      const daySpecialVal = isDaySpecial ? 1 : 0;
      if (editingId) {
        db.runSync(
          'UPDATE Menu SET name = ?, description = ?, price = ?, category = ?, isDaySpecial = ?, quantity = ? WHERE id = ?',
          name.trim(),
          description.trim() || null,
          parsedPrice,
          finalCategory,
          daySpecialVal,
          quantity.trim() || null,
          editingId
        );
      } else {
        db.runSync(
          'INSERT INTO Menu (name, description, price, category, isDaySpecial, quantity) VALUES (?, ?, ?, ?, ?, ?)',
          name.trim(),
          description.trim() || null,
          parsedPrice,
          finalCategory,
          daySpecialVal,
          quantity.trim() || null
        );
      }
      setModalVisible(false);
      loadMenu();
    } catch (e) {
      console.error(e);
      alert("Failed to save menu product.");
    }
  };

  const handleClearAllSpecials = () => {
    Alert.alert(
      'Reset Day Specials',
      "Are you sure you want to clear all items from today's specials list?",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: () => {
          try {
            db.runSync('UPDATE Menu SET isDaySpecial = 0');
            loadMenu();
          } catch (e) {
            console.error(e);
          }
        }}
      ]
    );
  };

  const handleShareMenu = async () => {
    if (filteredItems.length === 0) {
      alert("There are no items in the active list to share.");
      return;
    }
    try {
      const bakeryNameRow = db.getFirstSync<{value: string}>("SELECT value FROM Settings WHERE key = 'clinicName'");
      const bakeryName = bakeryNameRow ? bakeryNameRow.value : 'Sweet Delights';

      let messageText = `🎂 *${bakeryName} - ${activeTab} Menu* 🎂\n\n`;
      if (activeTab === 'All') {
        messageText = `🎂 *${bakeryName} Menu* 🎂\n\n`;
      }

      filteredItems.forEach((item) => {
        const qtySuffix = item.quantity ? ` (${item.quantity})` : '';
        messageText += `🍰 *${item.name}${qtySuffix}*\n`;
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.itemName}>{item.name}</Text>
          {item.isDaySpecial === 1 ? (
            <View style={styles.specialPill}>
              <Text style={styles.specialPillText}>Today's Special</Text>
            </View>
          ) : null}
        </View>
        {item.quantity ? (
          <Text style={styles.quantityText}>Quantity/Size: {item.quantity}</Text>
        ) : null}
        {item.description ? (
          <Text style={styles.itemDesc}>{item.description}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{item.category || 'Cakes'}</Text>
          </View>
        </View>
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
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareMenu}>
            <Ionicons name="logo-whatsapp" size={20} color="white" />
            <Text style={styles.shareBtnText}>
              Share {activeTab === "Day's Specials" ? "Specials" : activeTab === 'All' ? 'Menu' : activeTab}
            </Text>
          </TouchableOpacity>
          
          {activeTab === "Day's Specials" && filteredItems.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClearAllSpecials}>
              <Ionicons name="refresh-outline" size={18} color="#795548" />
              <Text style={styles.clearBtnText}>Reset Specials</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {filterTabs.map((tab) => {
            const isSelected = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.filterPill, isSelected && styles.filterPillActive]}
                onPress={() => handleTabPress(tab)}
              >
                <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>{tab}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={48} color="#A8A29E" />
            <Text style={styles.emptyText}>
              {activeTab === "Day's Specials"
                ? "No specials marked for today. Go to edit profile of any product and turn on Day's Special."
                : `No products in "${activeTab}" category yet.`}
            </Text>
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
              placeholder="e.g. Chocolate Truffle Cake" 
              value={name} 
              onChangeText={setName} 
            />

            <Text style={styles.label}>Standard Quantity / Size</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. 1 kg, 0.5 kg, 6 pcs, 500 ml" 
              value={quantity} 
              onChangeText={setQuantity} 
            />

            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput 
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
              placeholder="e.g. Rich dark chocolate cream layers, eggless" 
              multiline 
              value={description} 
              onChangeText={setDescription} 
            />

            <Text style={styles.label}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
              {availableCategories.map((cat) => {
                const isSelected = !isCustomCategoryMode && category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: isSelected ? '#EC4899' : '#E5E7EB',
                      backgroundColor: isSelected ? '#FFF5F5' : 'white'
                    }}
                    onPress={() => {
                      setCategory(cat);
                      setIsCustomCategoryMode(false);
                    }}
                  >
                    <Text style={{ color: isSelected ? '#EC4899' : '#5D4037', fontWeight: isSelected ? 'bold' : '600' }}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: isCustomCategoryMode ? '#EC4899' : '#E5E7EB',
                  backgroundColor: isCustomCategoryMode ? '#FFF5F5' : '#F9FAFB'
                }}
                onPress={() => setIsCustomCategoryMode(true)}
              >
                <Text style={{ color: isCustomCategoryMode ? '#EC4899' : '#5D4037', fontWeight: 'bold' }}>+ Custom Category</Text>
              </TouchableOpacity>
            </View>

            {isCustomCategoryMode && (
              <View style={{ marginBottom: 20 }}>
                <Text style={[styles.label, { fontSize: 13, color: '#EC4899' }]}>Type New Category Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Pies, Pastries, Hampers"
                  value={customCategory}
                  onChangeText={setCustomCategory}
                  autoFocus
                />
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30, backgroundColor: '#FFFDFB', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#3E2723' }}>Today's Special</Text>
                <Text style={{ fontSize: 13, color: '#795548', marginTop: 2 }}>Toggling this ON makes this product show in your Day's Specials list.</Text>
              </View>
              <Switch 
                value={isDaySpecial} 
                onValueChange={setIsDaySpecial} 
                trackColor={{ false: '#767577', true: '#FECDD3' }}
                thumbColor={isDaySpecial ? '#EC4899' : '#f4f3f4'}
              />
            </View>

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
  clearBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, gap: 6 },
  clearBtnText: { color: '#795548', fontWeight: 'bold', fontSize: 14 },
  
  filterWrapper: { backgroundColor: '#FFFDFB', paddingHorizontal: 16, marginVertical: 10 },
  filterScroll: { gap: 8, paddingVertical: 4 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#E5E7EB' },
  filterPillActive: { backgroundColor: '#EC4899' },
  filterPillText: { fontSize: 13, color: '#5D4037', fontWeight: '600' },
  filterPillTextActive: { color: 'white', fontWeight: 'bold' },

  listContent: { padding: 16, paddingBottom: 100 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardInfo: { flex: 1, gap: 4 },
  itemName: { fontSize: 17, fontWeight: 'bold', color: '#3E2723' },
  quantityText: { fontSize: 13, color: '#795548', fontWeight: '600' },
  itemDesc: { fontSize: 13, color: '#795548', fontStyle: 'italic' },
  itemPrice: { fontSize: 15, fontWeight: 'bold', color: '#EC4899' },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#FFF5F5', borderRadius: 8, borderWidth: 1, borderColor: '#FECDD3' },
  categoryBadgeText: { fontSize: 11, color: '#EC4899', fontWeight: '700' },
  specialPill: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#FEF3C7', borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A' },
  specialPillText: { fontSize: 10, color: '#B45309', fontWeight: '800', textTransform: 'uppercase' },
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
