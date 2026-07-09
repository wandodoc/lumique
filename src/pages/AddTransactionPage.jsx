import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../data/constants';
import './Pages.css';

const PARTS = ['VOIX', 'DANCE', 'SESSION', '공통'];

export default function AddTransactionPage({ onClose }) {
  const { state, dispatch } = useApp();
  const { members } = state;
  const [form, setForm] = useState({
    datetime: new Date().toISOString().slice(0, 16),
    description: '', type: 'income', category: '회비',
    amount: '', part: 'VOIX', memberId: '', note: '',
  });
  const [saved, setSaved] = useState(false);

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const activeMembers = members.filter(m => m.status === 'active');

  const set = (k, v) => setForm(p => {
    const n = { ...p, [k]: v };
    if (k === 'type') n.category = v === 'income' ? '회비' : '연습실 대여';
    if (k === 'memberId' && v) {
      const m = members.find(m => m.id === v);
      if (m) n.part = m.part;
    }
    return n;
  });

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    dispatch({ type: 'ADD_TRANSACTION', tx: { ...form, id: 'tx_' + Date.now(), amount: Number(form.amount), balance: 0 } });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose?.(); }, 1200);
  };

  return (
    <div className="page fade-in">
      <div className="card card-pad">
        <div className="flex-between" style={{ marginBottom: 20 }}>
          <h3 className="card-title" style={{ margin: 0 }}>거래 추가</h3>
          {onClose && <button onClick={onClose} style={{ color: 'var(--gray-500)', fontSize: 20 }}>✕</button>}
        </div>

        {saved && <div className="success-toast">✅ 저장되었습니다</div>}

        {/* 수입/지출 토글 */}
        <div className="type-toggle">
          <button type="button" className={`type-btn ${form.type === 'income' ? 'income' : ''}`}
            onClick={() => set('type', 'income')}>수입</button>
          <button type="button" className={`type-btn ${form.type === 'expense' ? 'expense' : ''}`}
            onClick={() => set('type', 'expense')}>지출</button>
        </div>

        <form className="add-form" onSubmit={handleSubmit}>
          <label>일시
            <input type="datetime-local" value={form.datetime}
              onChange={e => set('datetime', e.target.value)} required />
          </label>
          <label>계정과목
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              <optgroup label="수입 분류">
                {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="지출 분류">
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            </select>
          </label>
          <label>적요 / 설명
            <input type="text" value={form.description} placeholder="예: 강맥, 연습실 대여 등"
              onChange={e => set('description', e.target.value)} required />
          </label>
          {form.type === 'income' && (
            <label>회원 연결 (선택)
              <select value={form.memberId} onChange={e => set('memberId', e.target.value)}>
                <option value="">— 선택 안 함 —</option>
                {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.part})</option>)}
              </select>
            </label>
          )}
          <label>파트
            <select value={form.part} onChange={e => set('part', e.target.value)}>
              {PARTS.map(p => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>금액 (원)
            <input type="number" value={form.amount} placeholder="10000" min="1"
              onChange={e => set('amount', e.target.value)} required />
          </label>
          <label>비고 (선택)
            <input type="text" value={form.note} placeholder="메모"
              onChange={e => set('note', e.target.value)} />
          </label>
          <button type="submit" className="primary-btn" style={{ marginTop: 8 }}>추가하기</button>
        </form>
      </div>
    </div>
  );
}
