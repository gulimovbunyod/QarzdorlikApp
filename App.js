import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  BackHandler,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@qarzdorlik_people_v1';
const NOTE_PREVIEW_LEN = 36;

// ---------- Yordamchi funksiyalar ----------

function formatSum(n) {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  return sign + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Bitta odamning balansi: musbat = u sizga qarzdor, manfiy = siz unga qarzdorsiz
function personBalance(person) {
  return person.entries.reduce((sum, e) => {
    return sum + (e.type === 'berdim' ? e.amount : -e.amount);
  }, 0);
}

function totalBalance(people) {
  return people.reduce((sum, p) => sum + personBalance(p), 0);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Asosiy komponent ----------

export default function App() {
  const [people, setPeople] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState({ name: 'home' }); // {name:'home'} | {name:'person', id}
  const [newPersonName, setNewPersonName] = useState('');

  // Yozuv qo'shish formasi holati
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  // Tahrirlash oynasi holati: {personId, entryId, amount, note} | null
  const [editingEntry, setEditingEntry] = useState(null);
  // To'liq izohni ko'rish oynasi: matn string | null
  const [viewingNote, setViewingNote] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setPeople(JSON.parse(raw));
      } catch (e) {
        console.warn('Yuklashda xato', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setPeople(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('Saqlashda xato', e);
    }
  }, []);

  // Telefon "orqaga" tugmasi: avval oynalarni yopadi, keyin odam sahifasidan
  // bosh sahifaga qaytadi, faqat bosh sahifada ilovadan chiqishga ruxsat beradi
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (viewingNote !== null) {
        setViewingNote(null);
        return true;
      }
      if (editingEntry !== null) {
        setEditingEntry(null);
        return true;
      }
      if (screen.name === 'person') {
        setScreen({ name: 'home' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen, editingEntry, viewingNote]);

  if (!loaded) return null;

  // ---------- Amallar ----------

  function addPerson() {
    const name = newPersonName.trim();
    if (!name) return;
    const next = [...people, { id: uid(), name, entries: [] }];
    persist(next);
    setNewPersonName('');
  }

  function deletePerson(id) {
    Alert.alert('O\'chirish', 'Bu odamni va barcha yozuvlarini o\'chirmoqchimisiz?', [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: 'O\'chirish',
        style: 'destructive',
        onPress: () => {
          persist(people.filter((p) => p.id !== id));
          setScreen({ name: 'home' });
        },
      },
    ]);
  }

  function addEntry(personId, type) {
    const amount = parseFloat((amountInput || '').replace(/\s/g, '').replace(',', '.'));
    if (!amount || amount <= 0) {
      Alert.alert('Xato', 'Summani to\'g\'ri kiriting');
      return;
    }
    const entry = {
      id: uid(),
      type, // 'berdim' | 'qaytardi'
      amount,
      note: noteInput.trim(),
      date: new Date().toISOString(),
    };
    const next = people.map((p) =>
      p.id === personId ? { ...p, entries: [entry, ...p.entries] } : p
    );
    persist(next);
    setAmountInput('');
    setNoteInput('');
  }

  function openEditEntry(personId, entry) {
    setEditingEntry({
      personId,
      entryId: entry.id,
      type: entry.type,
      amount: String(entry.amount),
      note: entry.note || '',
    });
  }

  function saveEditEntry() {
    if (!editingEntry) return;
    const amount = parseFloat(
      (editingEntry.amount || '').toString().replace(/\s/g, '').replace(',', '.')
    );
    if (!amount || amount <= 0) {
      Alert.alert('Xato', 'Summani to\'g\'ri kiriting');
      return;
    }
    const next = people.map((p) =>
      p.id === editingEntry.personId
        ? {
            ...p,
            entries: p.entries.map((e) =>
              e.id === editingEntry.entryId
                ? { ...e, amount, note: (editingEntry.note || '').trim() }
                : e
            ),
          }
        : p
    );
    persist(next);
    setEditingEntry(null);
  }

  function deleteEditingEntry() {
    if (!editingEntry) return;
    const { personId, entryId } = editingEntry;
    Alert.alert('Qaydni o\'chirish', 'Bu qaydni o\'chirmoqchimisiz?', [
      { text: 'Bekor qilish', style: 'cancel' },
      {
        text: 'O\'chirish',
        style: 'destructive',
        onPress: () => {
          const next = people.map((p) =>
            p.id === personId
              ? { ...p, entries: p.entries.filter((e) => e.id !== entryId) }
              : p
          );
          persist(next);
          setEditingEntry(null);
        },
      },
    ]);
  }

  // ---------- Ekranlar ----------

  if (screen.name === 'person') {
    const person = people.find((p) => p.id === screen.id);
    if (!person) {
      setScreen({ name: 'home' });
      return null;
    }
    const balance = personBalance(person);

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => setScreen({ name: 'home' })}>
              <Text style={styles.backBtn}>{'\u2190'} Orqaga</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deletePerson(person.id)}>
              <Text style={styles.deleteBtnTop}>O'chirish</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.personName}>{person.name}</Text>
          <Text
            style={[
              styles.personBalance,
              { color: balance > 0 ? '#1a7f37' : balance < 0 ? '#c62828' : '#555' },
            ]}
          >
            {balance > 0
              ? `Sizga ${formatSum(balance)} so'm qarzdor`
              : balance < 0
              ? `Siz unga ${formatSum(-balance)} so'm qarzdorsiz`
              : 'Hisob-kitob teng'}
          </Text>

          <View style={styles.formBox}>
            <TextInput
              style={styles.input}
              placeholder="Summa"
              keyboardType="numeric"
              value={amountInput}
              onChangeText={setAmountInput}
              placeholderTextColor="#999"
            />
            <TextInput
              style={styles.input}
              placeholder="Izoh (ixtiyoriy)"
              value={noteInput}
              onChangeText={setNoteInput}
              placeholderTextColor="#999"
            />
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.giveBtn]}
                onPress={() => addEntry(person.id, 'berdim')}
              >
                <Text style={styles.actionBtnText}>+ Berdim</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.getBtn]}
                onPress={() => addEntry(person.id, 'qaytardi')}
              >
                <Text style={styles.actionBtnText}>+ Qaytardi</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Tarix (bosib tahrirlang)</Text>
          <FlatList
            data={person.entries}
            keyExtractor={(e) => e.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Hali yozuv yo'q</Text>
            }
            renderItem={({ item }) => {
              const noteTooLong = item.note && item.note.length > NOTE_PREVIEW_LEN;
              const notePreview = noteTooLong
                ? item.note.slice(0, NOTE_PREVIEW_LEN) + '\u2026'
                : item.note;
              return (
                <TouchableOpacity
                  style={styles.entryRow}
                  onPress={() => openEditEntry(person.id, item)}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.entryType}>
                      {item.type === 'berdim' ? 'Berdim' : 'Qaytardi'}
                    </Text>
                    {!!item.note && (
                      <Text style={styles.entryNote}>{notePreview}</Text>
                    )}
                    {noteTooLong && (
                      <TouchableOpacity
                        onPress={() => setViewingNote(item.note)}
                        hitSlop={{ top: 6, bottom: 6, left: 0, right: 20 }}
                      >
                        <Text style={styles.moreLink}>Batafsil</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={styles.entryDate}>
                      {new Date(item.date).toLocaleDateString('uz-UZ')}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.entryAmount,
                      { color: item.type === 'berdim' ? '#1a7f37' : '#c62828' },
                    ]}
                  >
                    {item.type === 'berdim' ? '+' : '-'}
                    {formatSum(item.amount)}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </KeyboardAvoidingView>

        {/* Qaydni tahrirlash oynasi */}
        <Modal
          visible={editingEntry !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingEntry(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Qaydni tahrirlash</Text>
              <TextInput
                style={styles.input}
                placeholder="Summa"
                keyboardType="numeric"
                value={editingEntry ? editingEntry.amount : ''}
                onChangeText={(v) =>
                  setEditingEntry((prev) => (prev ? { ...prev, amount: v } : prev))
                }
                placeholderTextColor="#999"
              />
              <TextInput
                style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                placeholder="Izoh"
                multiline
                value={editingEntry ? editingEntry.note : ''}
                onChangeText={(v) =>
                  setEditingEntry((prev) => (prev ? { ...prev, note: v } : prev))
                }
                placeholderTextColor="#999"
              />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.cancelBtn]}
                  onPress={() => setEditingEntry(null)}
                >
                  <Text style={styles.modalBtnTextDark}>Bekor</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.deleteEntryBtn]}
                  onPress={deleteEditingEntry}
                >
                  <Text style={styles.modalBtnText}>O'chirish</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.saveBtn]}
                  onPress={saveEditEntry}
                >
                  <Text style={styles.modalBtnText}>Saqlash</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* To'liq izohni ko'rish oynasi */}
        <Modal
          visible={viewingNote !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setViewingNote(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Izoh</Text>
              <Text style={styles.fullNoteText}>{viewingNote}</Text>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn, { marginTop: 14 }]}
                onPress={() => setViewingNote(null)}
              >
                <Text style={styles.modalBtnText}>Yopish</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ---- Bosh ekran ----
  const total = totalBalance(people);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>Qarzdorlik</Text>

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>Umumiy holat</Text>
        <Text
          style={[
            styles.totalAmount,
            { color: total > 0 ? '#1a7f37' : total < 0 ? '#c62828' : '#555' },
          ]}
        >
          {total > 0
            ? `Sizga jami: ${formatSum(total)} so'm`
            : total < 0
            ? `Siz jami: ${formatSum(-total)} so'm qarzdorsiz`
            : 'Hisob-kitob teng'}
        </Text>
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Yangi odam ismi"
          value={newPersonName}
          onChangeText={setNewPersonName}
          placeholderTextColor="#999"
          onSubmitEditing={addPerson}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addPerson}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Hali hech kim qo'shilmagan</Text>
        }
        renderItem={({ item }) => {
          const balance = personBalance(item);
          return (
            <TouchableOpacity
              style={styles.personRow}
              onPress={() => setScreen({ name: 'person', id: item.id })}
            >
              <Text style={styles.personRowName}>{item.name}</Text>
              <Text
                style={[
                  styles.personRowBalance,
                  { color: balance > 0 ? '#1a7f37' : balance < 0 ? '#c62828' : '#888' },
                ]}
              >
                {balance > 0
                  ? `+${formatSum(balance)}`
                  : balance < 0
                  ? `-${formatSum(-balance)}`
                  : '0'}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

// ---------- Uslublar ----------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fafafa', paddingHorizontal: 16 },
  title: { fontSize: 26, fontWeight: '700', marginTop: 12, marginBottom: 8, color: '#1a1a1a' },
  totalBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  totalLabel: { fontSize: 13, color: '#888', marginBottom: 4 },
  totalAmount: { fontSize: 20, fontWeight: '700' },
  addRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
    marginBottom: 8,
    color: '#111',
  },
  addBtn: {
    backgroundColor: '#2f6fed',
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginBottom: 8,
  },
  addBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 24 },
  personRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  personRowName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  personRowBalance: { fontSize: 15, fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  backBtn: { fontSize: 15, color: '#2f6fed', fontWeight: '600' },
  deleteBtnTop: { fontSize: 14, color: '#c62828', fontWeight: '600' },
  personName: { fontSize: 24, fontWeight: '700', marginTop: 10, color: '#1a1a1a' },
  personBalance: { fontSize: 17, fontWeight: '700', marginBottom: 14, marginTop: 2 },
  formBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 14,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  giveBtn: { backgroundColor: '#1a7f37' },
  getBtn: { backgroundColor: '#c62828' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', marginBottom: 8 },
  entryRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryType: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  entryNote: { fontSize: 12, color: '#777', marginTop: 2 },
  moreLink: { fontSize: 12, color: '#2f6fed', fontWeight: '600', marginTop: 2 },
  entryDate: { fontSize: 11, color: '#aaa', marginTop: 4 },
  entryAmount: { fontSize: 15, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    width: '100%',
    maxWidth: 380,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  modalBtnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modalBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 9,
    alignItems: 'center',
  },
  cancelBtn: { backgroundColor: '#eee' },
  saveBtn: { backgroundColor: '#2f6fed' },
  deleteEntryBtn: { backgroundColor: '#c62828' },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  modalBtnTextDark: { color: '#333', fontWeight: '700', fontSize: 13 },
  fullNoteText: { fontSize: 14, color: '#333', lineHeight: 20 },
});
