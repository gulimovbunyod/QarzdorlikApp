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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@qarzdorlik_people_v1';

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

  function deleteEntry(personId, entryId) {
    const next = people.map((p) =>
      p.id === personId
        ? { ...p, entries: p.entries.filter((e) => e.id !== entryId) }
        : p
    );
    persist(next);
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

          <Text style={styles.sectionTitle}>Tarix</Text>
          <FlatList
            data={person.entries}
            keyExtractor={(e) => e.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Hali yozuv yo'q</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.entryRow}
                onLongPress={() =>
                  Alert.alert('Yozuvni o\'chirish?', '', [
                    { text: 'Bekor qilish', style: 'cancel' },
                    {
                      text: 'O\'chirish',
                      style: 'destructive',
                      onPress: () => deleteEntry(person.id, item.id),
                    },
                  ])
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryType}>
                    {item.type === 'berdim' ? 'Berdim' : 'Qaytardi'}
                    {item.note ? ` \u2014 ${item.note}` : ''}
                  </Text>
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
            )}
          />
        </KeyboardAvoidingView>
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
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#555', marginBottom: 8 },
  entryRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryType: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  entryDate: { fontSize: 12, color: '#999', marginTop: 2 },
  entryAmount: { fontSize: 15, fontWeight: '700' },
});
