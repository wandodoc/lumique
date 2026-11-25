import { useMemo, useRef, useState } from 'react';
import { firebaseStorage } from '../utils/firebaseStorage';

// 공연 정산표: 수입(티켓 판매·부원 관람분·공연 부원 회비·후원금)과 지출(항목별 묶음)을 한 표로 본다.
// 설정·지출·항목 목록은 공연 레코드의 settlement 필드, 후원금은 기존 extraDonationList에 저장한다.
// 입출금 장부는 건드리지 않는다.
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}원`;
const toAmount = (v) => {
  const n = Math.floor(Number(String(v ?? '').replace(/[^0-9.]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
// 금액 입력 칸: 숫자만 남기고 입력 중에도 1,000 단위 구분 기호를 보여 준다.
const formatAmountInput = (v) => {
  const digits = String(v ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString() : '';
};
const newId = () => `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Date().toISOString().slice(0, 10);

// 증빙(영수증) 사진 압축: Firestore 문서 1개(1MiB)에 넉넉히 들어가면서 글자가 읽히는 수준을 유지한다.
const RECEIPT_BUDGET = 220 * 1024; // base64 문자 수 기준
// 영수증은 지출 1건당 별도 문서에 보관한다. Firestore 문서 1MiB 제한을 피하기 위해
// 한 건에는 최대 4장을 허용하고, 압축된 이미지 총량도 보수적으로 제한한다.
const MAX_RECEIPT_IMAGES = 4;
const RECEIPT_TOTAL_BUDGET = 820 * 1024;
const RECEIPT_STAGES = [[1600, 0.72], [1400, 0.6], [1200, 0.55], [1000, 0.5], [800, 0.45]];
const compressReceiptImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const render = (maxDim, quality) => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', quality);
      };
      let result = render(RECEIPT_STAGES[0][0], RECEIPT_STAGES[0][1]);
      for (let i = 1; i < RECEIPT_STAGES.length && result.length > RECEIPT_BUDGET; i += 1) {
        result = render(RECEIPT_STAGES[i][0], RECEIPT_STAGES[i][1]);
      }
      resolve(result);
    };
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    img.src = e.target.result;
  };
  reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
  reader.readAsDataURL(file);
});

// 이전 버전의 { image, name } 문서도 새 배열 형식과 똑같이 표시한다.
const receiptImagesOf = (data) => {
  if (Array.isArray(data?.images)) {
    return data.images
      .filter(item => item && typeof item.image === 'string' && item.image)
      .map(item => ({ image: item.image, name: String(item.name || '') }));
  }
  return data?.image ? [{ image: data.image, name: String(data.name || '') }] : [];
};

// 지출 항목/메모: 새 데이터는 category·memo 필드를 쓰고, 항목 개념이 없던 기존 데이터는
// label의 '_' 앞부분을 항목으로("연습실 대여_합주(1)_260904" → "연습실 대여"), 나머지를 메모로 본다.
const categoryOf = (e) => (String(e?.category ?? '').trim() || String(e?.label || '').split('_')[0].trim() || '기타');
const memoOf = (e) => (e?.memo !== undefined ? String(e.memo) : String(e?.label || '').split('_').slice(1).join('_'));

const sectionTitle = { fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid #f1f5f9' };
const nameStyle = { fontSize: 14, fontWeight: 700, color: '#111827' };
const descStyle = { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.5 };
const amountStyle = { fontSize: 14, fontWeight: 800, color: '#111827', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const inputStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', minWidth: 0 };
const smallButton = { padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const miniButton = { padding: '3px 8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, fontWeight: 700, color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' };
const dangerMini = { ...miniButton, border: '1px solid #fca5a5', color: '#dc2626' };
const countBadge = { padding: '2px 8px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 800, marginLeft: 8, cursor: 'pointer', whiteSpace: 'nowrap' };
const warnBadge = { padding: '2px 8px', borderRadius: 10, border: '1px solid #fde68a', background: '#fffbeb', color: '#b45309', fontSize: 11, fontWeight: 800, marginLeft: 6, whiteSpace: 'nowrap' };
const subListStyle = { margin: '2px 0 8px', borderLeft: '2px solid #e2e8f0', paddingLeft: 12 };
const subRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px dashed #f1f5f9', fontSize: 13, flexWrap: 'wrap' };
const subDateStyle = { color: '#64748b', fontSize: 12, marginRight: 8, fontVariantNumeric: 'tabular-nums' };
const subMemoStyle = { color: '#94a3b8', fontSize: 12 };
const subRightStyle = { display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 };
const checkLabel = (done) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: done ? '#047857' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' });
const addLineStyle = { display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid #f1f5f9' };

// 줄 전체 클릭으로도 펼치되, 줄 안의 버튼/입력 클릭은 펼침으로 취급하지 않는다.
const isInteractive = (event) => Boolean(event.target.closest('button, input, select, a, label'));

export default function ShowSettlementCard({
  show, isAdmin, onPatchShow,
  ticketCash, duesCoveredSum, duesCoveredCount, donations = [],
  participantIds, members, bandMembers,
  collapsed = false, onToggleCollapse = null,
}) {
  const [showCatPanel, setShowCatPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [showAddExpense, setShowAddExpense] = useState(false); // 지출 추가 입력 줄은 버튼을 눌러야 열린다
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDate, setExpenseDate] = useState(today);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePaidBy, setExpensePaidBy] = useState('');
  const [editingExpense, setEditingExpense] = useState(null); // { id, category, date, memo, amount, paidBy }
  const [catDraft, setCatDraft] = useState('');
  const [donName, setDonName] = useState('');
  const [donAmount, setDonAmount] = useState('');
  const [donDate, setDonDate] = useState(today);
  const [editingDonation, setEditingDonation] = useState(null); // { id, donorName, amount, date }
  const receiptInputRef = useRef(null);
  const [receiptTargetId, setReceiptTargetId] = useState(null); // 증빙을 첨부할 지출 id
  const [receiptView, setReceiptView] = useState(null); // { id, label, loading, images, activeIndex }

  const settlement = useMemo(() => {
    const raw = show?.settlement && typeof show.settlement === 'object' ? show.settlement : {};
    return {
      // 회비 공식(×개월) 기능은 제거했지만, 과거 저장값은 보존을 위해 그대로 갖고 있는다.
      ...(raw.monthlyDues !== undefined ? { monthlyDues: raw.monthlyDues } : {}),
      ...(raw.prepMonths !== undefined ? { prepMonths: raw.prepMonths } : {}),
      ...(raw.memberMonths !== undefined ? { memberMonths: raw.memberMonths } : {}),
      expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
      expenseCategories: Array.isArray(raw.expenseCategories) ? raw.expenseCategories.map(n => String(n).trim()).filter(Boolean) : [],
      // '회비 부담'으로 표시한 지출 항목 — 공연 정산 합계에서 빼고 별도로 집계한다 (연습실 대여 등).
      duesCategories: Array.isArray(raw.duesCategories) ? raw.duesCategories.map(n => String(n).trim()).filter(Boolean) : [],
    };
  }, [show]);

  // 공연 참가자 중 동아리 회원 목록에 있는 사람만 "공연 부원"으로 본다. 나머지는 객원(외부 공연자).
  const { officials, guests } = useMemo(() => {
    const officialList = [];
    const guestList = [];
    (Array.isArray(participantIds) ? participantIds : []).forEach(id => {
      const member = (members || []).find(m => m.id === id);
      if (member) officialList.push(member);
      else guestList.push({ id, name: bandMembers?.[id]?.name || id });
    });
    return { officials: officialList, guests: guestList };
  }, [participantIds, members, bandMembers]);

  const donationSum = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const fundTotal = (Number(ticketCash) || 0) + (Number(duesCoveredSum) || 0) + donationSum;
  const fromDues = Number(duesCoveredSum) || 0;

  // 같은 항목의 지출을 한 묶음으로. 등록만 하고 아직 지출이 없는 항목(0건)도 항목 관리에 나온다.
  const expenseGroups = useMemo(() => {
    const map = new Map();
    settlement.expenseCategories.forEach(name => map.set(name, []));
    settlement.expenses.forEach(e => {
      const cat = categoryOf(e);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(e);
    });
    return [...map.entries()].map(([name, entries]) => ({
      name,
      isDues: settlement.duesCategories.includes(name),
      entries: [...entries].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
      total: entries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      unpaid: entries.filter(e => !e.reimbursed).reduce((s, e) => s + (Number(e.amount) || 0), 0),
      payers: [...new Set(entries.map(e => String(e.paidBy || '').trim()).filter(Boolean))],
    }));
  }, [settlement]);
  const categoryNames = expenseGroups.map(g => g.name);

  const showExpenseTotal = expenseGroups.filter(g => !g.isDues).reduce((sum, g) => sum + g.total, 0);
  const duesExpenseTotal = expenseGroups.filter(g => g.isDues).reduce((sum, g) => sum + g.total, 0);
  const owedFor = (groups) => groups.reduce((map, g) => {
    g.entries.forEach(e => {
      if (e.reimbursed) return;
      const key = String(e.paidBy || '').trim() || '선결제자 미기재';
      map[key] = (map[key] || 0) + (Number(e.amount) || 0);
    });
    return map;
  }, {});
  const showOwedByPerson = owedFor(expenseGroups.filter(g => !g.isDues));
  const duesOwedByPerson = owedFor(expenseGroups.filter(g => g.isDues));
  const showOwedTotal = Object.values(showOwedByPerson).reduce((sum, v) => sum + v, 0);
  const duesOwedTotal = Object.values(duesOwedByPerson).reduce((sum, v) => sum + v, 0);
  const balance = fundTotal - showExpenseTotal;

  const save = async (patch) => {
    if (!isAdmin || saving) return false;
    setSaving(true);
    try {
      return await onPatchShow({ settlement: { ...settlement, ...patch } });
    } finally {
      setSaving(false);
    }
  };

  // ── 후원금: 기존 extraDonationList 필드를 그대로 쓴다 (전체 보기 총 모금액 계산과 호환) ──
  const patchDonations = async (nextList) => {
    if (!isAdmin || saving) return false;
    setSaving(true);
    try {
      return await onPatchShow({ extraDonationList: nextList, extraDonation: nextList.reduce((s, d) => s + (Number(d.amount) || 0), 0) });
    } finally {
      setSaving(false);
    }
  };
  const addDonation = async () => {
    const amount = toAmount(donAmount);
    if (amount <= 0) { window.alert('후원 금액을 입력해 주세요.'); return; }
    const ok = await patchDonations([...donations, { id: `don_${Date.now()}`, donorName: donName.trim() || '익명', amount, date: donDate || today() }]);
    if (ok) { setDonName(''); setDonAmount(''); }
  };
  const saveEditedDonation = async () => {
    const amount = toAmount(editingDonation?.amount);
    if (amount <= 0) { window.alert('후원 금액을 입력해 주세요.'); return; }
    const ok = await patchDonations(donations.map(d => (d.id === editingDonation.id ? { ...d, donorName: String(editingDonation.donorName || '').trim() || '익명', amount, date: editingDonation.date || '' } : d)));
    if (ok) setEditingDonation(null);
  };
  const removeDonation = (d) => {
    if (!window.confirm(`'${d.donorName || '익명'}' ${won(d.amount)} 후원 기록을 삭제할까요?`)) return;
    patchDonations(donations.filter(x => x.id !== d.id));
  };

  // ── 지출 항목 관리 ──
  const addCategory = async () => {
    const name = catDraft.trim();
    if (!name) return;
    if (categoryNames.includes(name)) { window.alert('이미 있는 항목입니다.'); return; }
    const ok = await save({ expenseCategories: [...settlement.expenseCategories, name] });
    if (ok) setCatDraft('');
  };
  const renameCategory = async (oldName) => {
    const newName = String(window.prompt('새 항목 이름을 입력하세요', oldName) || '').trim();
    if (!newName || newName === oldName) return;
    if (categoryNames.includes(newName)) { window.alert('이미 있는 항목 이름입니다.'); return; }
    await save({
      expenseCategories: settlement.expenseCategories.includes(oldName)
        ? settlement.expenseCategories.map(n => (n === oldName ? newName : n))
        : [...settlement.expenseCategories, newName],
      expenses: settlement.expenses.map(e => (categoryOf(e) === oldName ? { ...e, category: newName, memo: memoOf(e) } : e)),
    });
    if (expenseCategory === oldName) setExpenseCategory(newName);
  };
  const deleteCategory = async (group) => {
    if (group.entries.length === 0) {
      if (!window.confirm(`'${group.name}' 항목을 삭제할까요?`)) return;
      await save({ expenseCategories: settlement.expenseCategories.filter(n => n !== group.name) });
      return;
    }
    const others = categoryNames.filter(n => n !== group.name);
    if (others.length === 0) { window.alert('지출이 남아 있어 삭제할 수 없습니다. 먼저 다른 항목을 만들어 지출을 옮겨 주세요.'); return; }
    const target = String(window.prompt(`'${group.name}'의 지출 ${group.entries.length}건을 옮길 항목 이름을 입력하세요.\n(${others.join(', ')})`) || '').trim();
    if (!target) return;
    if (!others.includes(target)) { window.alert('없는 항목 이름입니다. 위 목록에 있는 이름을 그대로 입력해 주세요.'); return; }
    await save({
      expenseCategories: settlement.expenseCategories.filter(n => n !== group.name),
      expenses: settlement.expenses.map(e => (categoryOf(e) === group.name ? { ...e, category: target, memo: memoOf(e) } : e)),
    });
    if (expenseCategory === group.name) setExpenseCategory(target);
  };
  const toggleDuesCategory = (name) => {
    const has = settlement.duesCategories.includes(name);
    save({ duesCategories: has ? settlement.duesCategories.filter(n => n !== name) : [...settlement.duesCategories, name] });
  };
  const pickCategory = async (value) => {
    if (value !== '__new') { setExpenseCategory(value); return; }
    const name = String(window.prompt('새 항목 이름을 입력하세요 (예: 물품 구매)') || '').trim();
    if (!name) return;
    if (!categoryNames.includes(name)) await save({ expenseCategories: [...settlement.expenseCategories, name] });
    setExpenseCategory(name);
  };

  // ── 지출 건 ──
  const addExpense = async () => {
    const category = expenseCategory.trim();
    const amount = toAmount(expenseAmount);
    if (!category) { window.alert("지출 항목을 먼저 선택해 주세요. 항목이 없으면 '항목 관리'에서 만들 수 있어요."); return; }
    if (amount <= 0) { window.alert('금액을 입력해 주세요.'); return; }
    const ok = await save({ expenses: [...settlement.expenses, { id: newId(), category, memo: '', date: expenseDate || '', amount, paidBy: expensePaidBy.trim(), reimbursed: false, createdAt: new Date().toISOString() }] });
    if (ok) { setExpenseAmount(''); setExpensePaidBy(''); }
  };
  const toggleReimbursed = (id) => save({ expenses: settlement.expenses.map(e => (e.id === id ? { ...e, reimbursed: !e.reimbursed } : e)) });
  const markGroupReimbursed = (group) => {
    const ids = new Set(group.entries.map(e => e.id));
    save({ expenses: settlement.expenses.map(e => (ids.has(e.id) ? { ...e, reimbursed: true } : e)) });
  };
  const saveEditedExpense = async () => {
    const amount = toAmount(editingExpense?.amount);
    if (!String(editingExpense?.category || '').trim() || amount <= 0) {
      window.alert('지출 항목과 금액을 확인해 주세요.');
      return;
    }
    const ok = await save({
      expenses: settlement.expenses.map(e => (e.id === editingExpense.id
        ? { ...e, category: editingExpense.category, date: editingExpense.date || '', memo: String(editingExpense.memo || '').trim(), amount, paidBy: String(editingExpense.paidBy || '').trim() }
        : e)),
    });
    if (ok) setEditingExpense(null);
  };
  const removeExpense = (e, groupName) => {
    if (!window.confirm(`'${groupName}'${e.date ? ` ${e.date}` : ''} ${won(e.amount)} 지출 기록을 삭제할까요?${e.receipt ? '\n첨부된 증빙도 함께 삭제됩니다.' : ''}`)) return;
    if (e.receipt) firebaseStorage.deleteReceipt(e.id).catch(() => {});
    save({ expenses: settlement.expenses.filter(x => x.id !== e.id) });
  };

  // ── 증빙(영수증) 첨부/보기/삭제 ──
  const attachReceipt = (e) => {
    setReceiptTargetId(e.id);
    receiptInputRef.current?.click();
  };
  const onReceiptFile = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    const targetId = receiptTargetId;
    setReceiptTargetId(null);
    if (files.length === 0 || !targetId) return;
    let nextReceiptCount = 0;
    setSaving(true);
    try {
      const existing = await firebaseStorage.loadReceipt(targetId);
      const currentImages = receiptImagesOf(existing);
      const available = MAX_RECEIPT_IMAGES - currentImages.length;
      if (available <= 0) {
        window.alert(`증빙 사진은 최대 ${MAX_RECEIPT_IMAGES}장까지 첨부할 수 있습니다.`);
        return;
      }
      const selectedFiles = files.slice(0, available);
      if (files.length > available) window.alert(`사진은 최대 ${MAX_RECEIPT_IMAGES}장까지 첨부되어, ${selectedFiles.length}장만 추가합니다.`);
      const addedImages = [];
      for (const file of selectedFiles) {
        const image = await compressReceiptImage(file);
        addedImages.push({ image, name: file.name || '' });
      }
      const images = [...currentImages, ...addedImages];
      if (images.reduce((total, item) => total + item.image.length, 0) > RECEIPT_TOTAL_BUDGET) {
        window.alert('선택한 사진의 용량이 너무 큽니다. 사진 수를 줄여 다시 올려 주세요.');
        return;
      }
      const ok = await firebaseStorage.saveReceipt(targetId, { images, showId: show?.id || null });
      if (!ok) { window.alert('증빙 저장에 실패했습니다. 네트워크를 확인하고 다시 시도해 주세요.'); return; }
      nextReceiptCount = images.length;
    } catch {
      window.alert('이미지를 읽을 수 없습니다. 사진 파일(JPG/PNG)인지 확인해 주세요.');
      return;
    } finally {
      setSaving(false);
    }
    await save({ expenses: settlement.expenses.map(x => (x.id === targetId ? { ...x, receipt: nextReceiptCount > 0, receiptCount: nextReceiptCount } : x)) });
  };
  const openReceipt = async (e, label) => {
    setReceiptView({ id: e.id, label, loading: true, images: [], activeIndex: 0 });
    const data = await firebaseStorage.loadReceipt(e.id);
    const images = receiptImagesOf(data);
    setReceiptView(prev => (prev && prev.id === e.id ? { ...prev, loading: false, images, activeIndex: 0 } : prev));
  };
  const removeReceiptImage = async (index) => {
    if (!receiptView?.id) return;
    if (!window.confirm('이 증빙 사진을 삭제할까요?')) return;
    const images = receiptView.images.filter((_, itemIndex) => itemIndex !== index);
    setSaving(true);
    try {
      const ok = images.length > 0
        ? await firebaseStorage.saveReceipt(receiptView.id, { images, showId: show?.id || null })
        : await firebaseStorage.deleteReceipt(receiptView.id);
      if (!ok) { window.alert('증빙 삭제에 실패했습니다. 네트워크를 확인하고 다시 시도해 주세요.'); return; }
      await save({ expenses: settlement.expenses.map(x => (x.id === receiptView.id ? { ...x, receipt: images.length > 0, receiptCount: images.length } : x)) });
      if (images.length === 0) setReceiptView(null);
      else setReceiptView(prev => (prev ? { ...prev, images, activeIndex: Math.min(prev.activeIndex, images.length - 1) } : prev));
    } finally { setSaving(false); }
  };
  const startEditExpense = (e) => setEditingExpense({ id: e.id, category: categoryOf(e), date: e.date || '', memo: memoOf(e), amount: formatAmountInput(e.amount), paidBy: e.paidBy || '' });

  const toggleGroup = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  const personNames = [...officials.map(m => m.name), ...guests.map(g => g.name)];

  const renderExpenseEditor = () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', borderRadius: 10, padding: '10px 12px', margin: '4px 0' }}>
      <select value={editingExpense.category} onChange={ev => setEditingExpense(prev => ({ ...prev, category: ev.target.value }))} aria-label="지출 항목 수정" style={{ ...inputStyle, flex: '1.2 1 110px' }}>
        {categoryNames.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <input type="date" value={editingExpense.date} onChange={ev => setEditingExpense(prev => ({ ...prev, date: ev.target.value }))} aria-label="지출 날짜 수정" style={{ ...inputStyle, flex: '1 1 120px' }} />
      <input type="text" inputMode="numeric" value={editingExpense.amount} onChange={ev => setEditingExpense(prev => ({ ...prev, amount: formatAmountInput(ev.target.value) }))} placeholder="금액" aria-label="지출 금액 수정" style={{ ...inputStyle, flex: '.9 1 80px' }} />
      <input type="text" value={editingExpense.paidBy} onChange={ev => setEditingExpense(prev => ({ ...prev, paidBy: ev.target.value }))} placeholder="선결제자" aria-label="선결제자 수정" list="settlement-person-names" style={{ ...inputStyle, flex: '.9 1 90px' }} />
      <input type="text" value={editingExpense.memo} onChange={ev => setEditingExpense(prev => ({ ...prev, memo: ev.target.value }))} placeholder="메모 (선택)" aria-label="지출 메모 수정" style={{ ...inputStyle, flex: '1 1 100px' }} />
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" disabled={saving} onClick={saveEditedExpense} style={{ ...miniButton, background: '#111827', color: '#fff', border: 'none', padding: '7px 12px' }}>{saving ? '저장 중…' : '저장'}</button>
        <button type="button" disabled={saving} onClick={() => setEditingExpense(null)} style={{ ...miniButton, padding: '7px 12px' }}>취소</button>
      </span>
    </div>
  );

  const renderEntryActions = (e, groupName) => (
    <div className="settlement-entry-actions">
      <label className="settlement-entry-status" style={checkLabel(Boolean(e.reimbursed))}>
        <input type="checkbox" checked={Boolean(e.reimbursed)} disabled={!isAdmin || saving} onChange={() => toggleReimbursed(e.id)} />
        정산 완료
      </label>
      <span className="settlement-entry-receipt">
        {e.receipt ? (
          <button type="button" aria-label="증빙 보기" disabled={saving} onClick={() => openReceipt(e, groupName)} style={{ ...miniButton, color: '#1d4ed8', border: '1px solid #bfdbfe' }}>증빙{Number(e.receiptCount) > 1 ? ` ${e.receiptCount}` : ''}</button>
        ) : (isAdmin && (
          <button type="button" aria-label="증빙 첨부" title="영수증 사진 첨부" disabled={saving} onClick={() => attachReceipt(e)} style={{ ...miniButton, color: '#1d4ed8', border: '1px solid #bfdbfe' }}>증빙 첨부</button>
        ))}
      </span>
      {isAdmin ? <button type="button" className="settlement-entry-edit" aria-label="지출 수정" disabled={saving} onClick={() => startEditExpense(e)} style={miniButton}>수정</button> : <span className="settlement-entry-edit" aria-hidden="true" />}
      {isAdmin ? <button type="button" className="settlement-entry-delete" aria-label="지출 삭제" disabled={saving} onClick={() => removeExpense(e, groupName)} style={dangerMini}>삭제</button> : <span className="settlement-entry-delete" aria-hidden="true" />}
      <span className="settlement-entry-amount" style={{ ...amountStyle, fontSize: 13 }}>{won(e.amount)}</span>
    </div>
  );

  const renderExpenseGroup = (g) => {
            if (g.entries.length === 1) {
              const e = g.entries[0];
              if (editingExpense?.id === e.id) return <div key={g.name}>{renderExpenseEditor()}</div>;
              const descParts = [e.date, memoOf(e), g.payers.length ? `선결제: ${g.payers.join(', ')}` : '선결제자 미기재'].filter(Boolean);
              return (
                <div key={g.name} style={{ ...rowStyle, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                    <div style={nameStyle}>{g.name}</div>
                    <div style={descStyle}>{descParts.join(' · ')}</div>
                  </div>
                  {renderEntryActions(e, g.name)}
                </div>
              );
            }
            const key = `cat:${g.name}`;
            const open = Boolean(openGroups[key]);
            return (
              <div key={g.name}>
                <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={ev => { if (!isInteractive(ev)) toggleGroup(key); }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...nameStyle, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                      {g.name}
                      <button type="button" style={countBadge} aria-expanded={open} onClick={() => toggleGroup(key)}>{g.entries.length}건 {open ? '▴' : '▾'}</button>
                      
                      {g.unpaid > 0 && <span style={warnBadge}>미정산 {won(g.unpaid)}</span>}
                    </div>
                    <div style={descStyle}>{g.payers.length ? `선결제: ${g.payers.join(', ')}` : '선결제자 미기재'} · 눌러서 날짜별 보기</div>
                  </div>
                  <div style={amountStyle}>{won(g.total)}</div>
                </div>
                {open && (
                  <div style={subListStyle}>
                    {g.entries.map(e => (
                      editingExpense?.id === e.id ? (
                        <div key={e.id}>{renderExpenseEditor()}</div>
                      ) : (
                        <div key={e.id} style={subRowStyle}>
                          <div style={{ minWidth: 0 }}>
                            <span style={subDateStyle}>{e.date || '-'}</span>
                            {memoOf(e) && <span style={subMemoStyle}>{memoOf(e)}</span>}
                          </div>
                          {renderEntryActions(e, g.name)}
                        </div>
                      )
                    ))}
                    {isAdmin && g.entries.some(e => !e.reimbursed) && (
                      <div style={{ padding: '6px 0 2px' }}>
                        <button type="button" disabled={saving} onClick={() => markGroupReimbursed(g)} style={{ ...miniButton, fontWeight: 800 }}>모두 정산 완료로 표시</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
  };

  return (
    <div className="card card-pad" style={{ borderRadius: 20, border: '1px solid #e2e8f0', background: '#fff', display: 'grid', gap: 18 }}>
      <style>{`
        .settlement-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 40px; align-items: start; }
        .settlement-entry-actions {
          display: grid;
          grid-template-columns: 72px 112px 44px 44px 84px;
          align-items: center;
          column-gap: 6px;
          flex: 0 0 auto;
        }
        .settlement-entry-status { min-width: 0; }
        .settlement-entry-receipt { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
        .settlement-entry-edit, .settlement-entry-delete { width: 44px; }
        .settlement-entry-amount { min-width: 84px; text-align: right; font-variant-numeric: tabular-nums; }
        @media (max-width: 860px) { .settlement-cols { grid-template-columns: 1fr; gap: 20px; } }
        @media (max-width: 560px) {
          .settlement-entry-actions {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 72px;
            grid-template-areas:
              "status receipt receipt"
              "edit delete amount";
            column-gap: 4px;
            row-gap: 4px;
            width: 100%;
            margin-top: 2px;
          }
          .settlement-entry-status { grid-area: status; }
          .settlement-entry-receipt { grid-area: receipt; }
          .settlement-entry-edit { grid-area: edit; }
          .settlement-entry-delete { grid-area: delete; }
          .settlement-entry-amount { grid-area: amount; }
          .settlement-entry-edit, .settlement-entry-delete { width: 42px; padding-left: 4px; padding-right: 4px; }
          .settlement-entry-amount { min-width: 72px; }
        }
      `}</style>
      <div role={onToggleCollapse ? 'button' : undefined} tabIndex={onToggleCollapse ? 0 : undefined}
        onClick={onToggleCollapse || undefined} title={onToggleCollapse ? (collapsed ? '펼치기' : '접기') : undefined}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: onToggleCollapse ? 'pointer' : 'default' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>공연 정산</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>수입과 지출을 비교합니다. 입출금 장부에는 영향을 주지 않습니다.</p>
        </div>
        {onToggleCollapse && <span aria-hidden="true" style={{ fontSize: 14, color: '#94a3b8', fontWeight: 800 }}>{collapsed ? '▸' : '▾'}</span>}
      </div>

      {!collapsed && (<>
      <div className="settlement-cols">
      {/* ── 수입 ── */}
      <section style={{ minWidth: 0 }}>
        <h3 style={sectionTitle}>공연 수입</h3>
        <div style={{ marginTop: 6 }}>
          <div style={rowStyle}>
            <div><div style={nameStyle}>티켓 판매</div><div style={descStyle}>관객이 계좌로 입금한 금액</div></div>
            <div style={amountStyle}>{won(ticketCash)}</div>
          </div>
          <div style={rowStyle}>
            <div>
              <div style={nameStyle}>부원 관람분</div>
              <div style={descStyle}>공연을 보러 온 부원은 티켓값을 받지 않고, 그만큼 동아리 회비에서 채웁니다{duesCoveredCount > 0 ? ` (${duesCoveredCount}건)` : ''}</div>
            </div>
            <div style={amountStyle}>{won(duesCoveredSum)}</div>
          </div>
          {/* 후원금: 묶음 줄 + 펼치면 건별 기록/추가 */}
          <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={e => { if (!isInteractive(e)) toggleGroup('don'); }}>
            <div>
              <div style={{ ...nameStyle, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                후원금
                <button type="button" style={countBadge} aria-expanded={Boolean(openGroups.don)} onClick={() => toggleGroup('don')}>{donations.length}건 {openGroups.don ? '▴' : '▾'}</button>
              </div>
              <div style={descStyle}>따로 받은 후원 · 눌러서 건별 보기</div>
            </div>
            <div style={amountStyle}>{won(donationSum)}</div>
          </div>
          {openGroups.don && (
            <div style={subListStyle}>
              {donations.length === 0 && <div style={{ ...subRowStyle, color: '#94a3b8' }}>아직 후원 기록이 없습니다.</div>}
              {donations.map(d => (
                editingDonation?.id === d.id ? (
                  <div key={d.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', borderRadius: 10, padding: '10px 12px', margin: '4px 0' }}>
                    <input type="text" value={editingDonation.donorName} onChange={ev => setEditingDonation(prev => ({ ...prev, donorName: ev.target.value }))} placeholder="후원자명" aria-label="후원자명 수정" style={{ ...inputStyle, flex: '1 1 90px' }} />
                    <input type="text" inputMode="numeric" value={editingDonation.amount} onChange={ev => setEditingDonation(prev => ({ ...prev, amount: formatAmountInput(ev.target.value) }))} placeholder="금액" aria-label="후원 금액 수정" style={{ ...inputStyle, flex: '.9 1 80px' }} />
                    <input type="date" value={editingDonation.date} onChange={ev => setEditingDonation(prev => ({ ...prev, date: ev.target.value }))} aria-label="후원 날짜 수정" style={{ ...inputStyle, flex: '1 1 120px' }} />
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" disabled={saving} onClick={saveEditedDonation} style={{ ...miniButton, background: '#111827', color: '#fff', border: 'none', padding: '7px 12px' }}>{saving ? '저장 중…' : '저장'}</button>
                      <button type="button" disabled={saving} onClick={() => setEditingDonation(null)} style={{ ...miniButton, padding: '7px 12px' }}>취소</button>
                    </span>
                  </div>
                ) : (
                  <div key={d.id} style={subRowStyle}>
                    <div style={{ minWidth: 0 }}><span style={subDateStyle}>{d.date || '-'}</span><b>{d.donorName || '익명'}</b></div>
                    <div style={subRightStyle}>
                      <span style={{ ...amountStyle, fontSize: 13 }}>{won(d.amount)}</span>
                      {isAdmin && <button type="button" aria-label="후원 수정" disabled={saving} onClick={() => setEditingDonation({ id: d.id, donorName: d.donorName || '', amount: formatAmountInput(d.amount), date: d.date || '' })} style={miniButton}>수정</button>}
                      {isAdmin && <button type="button" aria-label="후원 삭제" disabled={saving} onClick={() => removeDonation(d)} style={dangerMini}>삭제</button>}
                    </div>
                  </div>
                )
              ))}
              {isAdmin && (
                <div style={addLineStyle}>
                  <input type="text" value={donName} onChange={e => setDonName(e.target.value)} placeholder="후원자명" aria-label="후원자명" style={{ ...inputStyle, flex: '1 1 90px' }} />
                  <input type="text" inputMode="numeric" value={donAmount} onChange={e => setDonAmount(formatAmountInput(e.target.value))} placeholder="금액" aria-label="후원 금액" style={{ ...inputStyle, flex: '.9 1 80px' }} />
                  <input type="date" value={donDate} onChange={e => setDonDate(e.target.value)} aria-label="후원 날짜" style={{ ...inputStyle, flex: '1 1 120px' }} />
                  <button type="button" onClick={addDonation} disabled={saving} style={{ ...smallButton, background: '#111827', color: '#fff', border: 'none', padding: '9px 14px' }}>{saving ? '저장 중…' : '+ 추가'}</button>
                </div>
              )}
            </div>
          )}

          <div style={{ ...rowStyle, borderTop: '2px solid #0f172a', paddingTop: 12 }}>
            <div>
              <div style={{ ...nameStyle, fontSize: 15 }}>합계</div>
              {fromDues > 0 && <div style={descStyle}>회비 충당 {won(fromDues)}</div>}
            </div>
            <div style={{ ...amountStyle, fontSize: 17 }}>{won(fundTotal)}</div>
          </div>
        </div>
      </section>

      <div style={{ minWidth: 0, display: 'grid', gap: 18, alignContent: 'start' }}>
      {/* ── 지출 ── */}
      <section style={{ minWidth: 0 }}>
        <h3 style={sectionTitle}>
          공연 지출
          {isAdmin && <button type="button" style={smallButton} aria-expanded={showCatPanel} onClick={() => setShowCatPanel(v => !v)}>{showCatPanel ? '항목 관리 닫기' : '항목 관리'}</button>}
          {isAdmin && (
            <button type="button" aria-expanded={showAddExpense} onClick={() => setShowAddExpense(v => !v)}
              style={{ ...smallButton, marginLeft: 'auto', background: showAddExpense ? '#fff' : '#111827', color: showAddExpense ? '#334155' : '#fff', border: showAddExpense ? '1px solid #cbd5e1' : 'none' }}>
              {showAddExpense ? '입력 닫기' : '+ 지출 추가'}
            </button>
          )}
        </h3>

        {showCatPanel && (
          <div style={{ margin: '8px 0 2px', padding: 14, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>지출 항목 관리 — 항목을 만들고, 이름을 바꾸고, 삭제할 수 있어요</div>
            {expenseGroups.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', padding: '6px 0' }}>아직 항목이 없습니다. 아래에서 첫 항목을 만들어 주세요.</div>}
            {expenseGroups.map(g => (
              <div key={g.name} style={{ ...subRowStyle, borderTop: '1px dashed #e2e8f0' }}>
                <div><b>{g.name}</b><span style={{ ...subMemoStyle, marginLeft: 6 }}>{g.entries.length}건</span></div>
                <div style={subRightStyle}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: g.isDues ? '#1d4ed8' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={g.isDues} disabled={!isAdmin || saving} onChange={() => toggleDuesCategory(g.name)} />
                    회비 부담
                  </label>
                  <button type="button" disabled={saving} onClick={() => renameCategory(g.name)} style={miniButton}>이름 바꾸기</button>
                  <button type="button" disabled={saving} onClick={() => deleteCategory(g)} style={dangerMini}>삭제</button>
                </div>
              </div>
            ))}
            <div style={{ ...addLineStyle, borderTop: '1px dashed #e2e8f0' }}>
              <input type="text" value={catDraft} onChange={e => setCatDraft(e.target.value)} placeholder="새 항목 이름 (예: 물품 구매)" aria-label="새 지출 항목 이름" style={{ ...inputStyle, flex: '1 1 150px' }} />
              <button type="button" onClick={addCategory} disabled={saving} style={{ ...smallButton, background: '#111827', color: '#fff', border: 'none', padding: '9px 14px' }}>+ 항목 추가</button>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>· 이름을 바꾸면 그 항목의 지출 전체에 적용됩니다<br />· 지출이 남아 있는 항목을 삭제하면 어느 항목으로 옮길지 물어봅니다<br />· '회비 부담'으로 표시한 항목(연습실 대여 등)은 공연 정산 합계에서 빠지고 아래에 별도로 집계됩니다</div>
          </div>
        )}

        <div style={{ marginTop: 6 }}>
          {settlement.expenses.length === 0 && (
            <div style={{ ...rowStyle, color: '#94a3b8', fontSize: 13 }}>아직 기록된 지출이 없습니다. 대관료, 연습실, 팜플렛 등 공연에 쓴 돈을 적어 주세요.</div>
          )}
          {expenseGroups.filter(g => g.entries.length > 0 && !g.isDues).map(renderExpenseGroup)}

          {isAdmin && showAddExpense && (
            <div style={addLineStyle}>
              <select value={categoryNames.includes(expenseCategory) ? expenseCategory : ''} onChange={e => pickCategory(e.target.value)} aria-label="지출 항목 선택" style={{ ...inputStyle, flex: '1.3 1 120px' }}>
                <option value="" disabled>항목 선택</option>
                {categoryNames.map(n => <option key={n} value={n}>{n}</option>)}
                <option value="__new">➕ 새 항목 만들기…</option>
              </select>
              <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} aria-label="지출 날짜" style={{ ...inputStyle, flex: '1 1 120px' }} />
              <input type="text" inputMode="numeric" value={expenseAmount} onChange={e => setExpenseAmount(formatAmountInput(e.target.value))} placeholder="금액" aria-label="지출 금액" style={{ ...inputStyle, flex: '.9 1 80px' }} />
              <input type="text" value={expensePaidBy} onChange={e => setExpensePaidBy(e.target.value)} placeholder="선결제자" aria-label="선결제자" list="settlement-person-names" style={{ ...inputStyle, flex: '.9 1 90px' }} />
              <datalist id="settlement-person-names">{personNames.map(n => <option key={n} value={n} />)}</datalist>
              <button type="button" onClick={addExpense} disabled={saving} style={{ ...smallButton, background: '#111827', color: '#fff', border: 'none', padding: '9px 14px' }}>{saving ? '저장 중…' : '추가'}</button>
            </div>
          )}

          <div style={{ ...rowStyle, borderTop: '2px solid #0f172a', paddingTop: 12 }}>
            <div>
              <div style={{ ...nameStyle, fontSize: 15 }}>합계</div>
              {showOwedTotal > 0 && (
                <div style={descStyle}>
                  {Object.entries(showOwedByPerson).map(([person, amount]) => `미정산: ${person} ${won(amount)}`).join(' · ')}
                </div>
              )}
              {showExpenseTotal > 0 && showOwedTotal === 0 && <div style={{ ...descStyle, color: '#047857' }}>모두 정산 완료</div>}
            </div>
            <div style={{ ...amountStyle, fontSize: 17 }}>{won(showExpenseTotal)}</div>
          </div>
        </div>
      </section>

      {/* ── 회비 부담: 연습실 등 회비(통장)에서 내는 공연 준비 비용 — 공연 손익과 별도 (지출 열 아래) ── */}
      {duesExpenseTotal > 0 && (
        <section style={{ minWidth: 0, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
          <h3 style={sectionTitle}>회비 부담 <span style={{ fontWeight: 600, fontSize: 11, color: '#64748b' }}>회비(통장)에서 내는 비용 · '항목 관리'에서 지정</span></h3>
          <div style={{ marginTop: 6 }}>
            {expenseGroups.filter(g => g.entries.length > 0 && g.isDues).map(renderExpenseGroup)}
            <div style={{ ...rowStyle, borderTop: '2px solid #0f172a', paddingTop: 12 }}>
              <div>
                <div style={{ ...nameStyle, fontSize: 15 }}>합계</div>
                {duesOwedTotal > 0 && (
                  <div style={descStyle}>
                    {Object.entries(duesOwedByPerson).map(([person, amount]) => `미정산: ${person} ${won(amount)}`).join(' · ')}
                  </div>
                )}
                {duesOwedTotal === 0 && <div style={{ ...descStyle, color: '#047857' }}>모두 정산 완료</div>}
                {balance < 0 && <div style={descStyle}>공연 부족분 {won(-balance)}까지 더하면 회비(통장)에서 총 {won(duesExpenseTotal - balance)} 나갑니다</div>}
              </div>
              <div style={{ ...amountStyle, fontSize: 17 }}>{won(duesExpenseTotal)}</div>
            </div>
          </div>
        </section>
      )}
      </div>
      </div>

      {/* 증빙 첨부용 숨은 파일 선택 + 보기 모달 */}
      <input ref={receiptInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onReceiptFile} />
      {receiptView && (
        <div onClick={() => setReceiptView(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15, 23, 42, .55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={event => event.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 14, maxWidth: 'min(92vw, 560px)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <strong style={{ fontSize: 13 }}>증빙 · {receiptView.label}</strong>
              <button type="button" aria-label="닫기" onClick={() => setReceiptView(null)} style={{ border: 'none', background: 'none', fontWeight: 800, color: '#64748b', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            {receiptView.loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#64748b', fontSize: 13 }}>불러오는 중…</div>
            ) : receiptView.images.length > 0 ? (
              <>
                <img src={receiptView.images[receiptView.activeIndex]?.image} alt={`지출 증빙 ${receiptView.activeIndex + 1}`} style={{ maxWidth: '100%', maxHeight: '58vh', objectFit: 'contain', borderRadius: 8 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {receiptView.images.map((item, index) => (
                    <button key={`${item.name}-${index}`} type="button" aria-label={`증빙 사진 ${index + 1} 보기`} onClick={() => setReceiptView(prev => ({ ...prev, activeIndex: index }))}
                      style={{ width: 54, height: 54, padding: 0, borderRadius: 7, overflow: 'hidden', border: index === receiptView.activeIndex ? '2px solid #2563eb' : '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                      <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 11, color: '#94a3b8' }}>
                  <span>{receiptView.activeIndex + 1} / {receiptView.images.length} · {receiptView.images[receiptView.activeIndex]?.name || '이름 없는 사진'}</span>
                  {isAdmin && <button type="button" disabled={saving} onClick={() => removeReceiptImage(receiptView.activeIndex)} style={{ ...dangerMini, padding: '5px 9px' }}>이 사진 삭제</button>}
                </div>
              </>
            ) : (
              <div style={{ padding: 30, textAlign: 'center', color: '#b91c1c', fontSize: 13 }}>증빙을 불러오지 못했습니다. 네트워크를 확인하고 다시 열어 주세요.</div>
            )}
            {isAdmin && !receiptView.loading && receiptView.images.length > 0 && (
              <button type="button" disabled={saving} onClick={() => { setReceiptTargetId(receiptView.id); receiptInputRef.current?.click(); }} style={{ ...smallButton, alignSelf: 'flex-end' }}>+ 사진 추가</button>
            )}
          </div>
        </div>
      )}

      {/* ── 정산 결과 ── */}
      <section style={{ padding: '14px 16px', borderRadius: 14, background: balance >= 0 ? '#ecfdf5' : '#fef2f2', border: `1px solid ${balance >= 0 ? '#a7f3d0' : '#fecaca'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ ...sectionTitle, color: balance >= 0 ? '#047857' : '#b91c1c' }}>공연 정산 결과</h3>
          <div style={{ ...descStyle, color: balance >= 0 ? '#047857' : '#b91c1c' }}>공연 수입 {won(fundTotal)} − 공연 지출 {won(showExpenseTotal)}</div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: balance >= 0 ? '#047857' : '#b91c1c', whiteSpace: 'nowrap' }}>
          {balance >= 0 ? `잔액 ${won(balance)}` : `부족 ${won(-balance)}`}
        </div>
      </section>
      </>)}
    </div>
  );
}
