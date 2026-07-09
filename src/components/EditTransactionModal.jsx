import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const TYPES = [
  { value: 'income', label: '수입 (입금)' },
  { value: 'expense', label: '지출 (출금)' }
];
const CATEGORIES = ['회비', '공연 수익', '식대/회식', '대관료', '기타'];
const PARTS = ['VOIX', 'DANCE', 'SESSION', '공통'];

export default function EditTransactionModal({ tx, onClose }) {
  const { state, dispatch } = useApp();
  const { members } = state;

  const [formData, setFormData] = useState({
    type: 'income',
    category: '회비',
    part: '공통',
    amount: '',
    datetime: '',
    description: '',
    memberId: '',
    note: ''
  });

  useEffect(() => {
    if (tx) {
      setFormData({
        type: tx.type || 'income',
        category: tx.category || '기타',
        part: tx.part || '공통',
        amount: tx.amount || 0,
        datetime: tx.datetime ? tx.datetime.slice(0, 16) : '',
        description: tx.description || '',
        memberId: tx.memberId || '',
        note: tx.note || ''
      });
    }
  }, [tx]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.datetime || !formData.amount || !formData.description) {
      return alert('필수 항목(날짜, 금액, 적요)을 입력해주세요.');
    }
    dispatch({
      type: 'UPDATE_TRANSACTION',
      tx: {
        ...tx,
        ...formData,
        amount: Number(formData.amount)
      }
    });
    alert('수정되었습니다.');
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm('정말 이 내역을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)')) {
      dispatch({ type: 'DELETE_TRANSACTION', id: tx.id });
      alert('삭제되었습니다.');
      onClose();
    }
  };

  if (!tx) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-handle" />
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>거래 내역 수정</h3>
        
        <form onSubmit={handleSubmit} className="add-form" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', paddingBottom: 20 }}>
          
          <div className="type-toggle">
            {TYPES.map(t => (
              <button type="button" key={t.value} 
                className={`type-btn ${formData.type === t.value ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, type: t.value })}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>분류</label>
              <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>파트</label>
              <select value={formData.part} onChange={e => setFormData({ ...formData, part: e.target.value })}>
                {PARTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label>일시</label>
            <input type="datetime-local" value={formData.datetime} onChange={e => setFormData({ ...formData, datetime: e.target.value })} required />
          </div>

          <div>
            <label>금액 (원)</label>
            <input type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} required />
          </div>

          <div>
            <label>적요 (내용)</label>
            <input type="text" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} required />
          </div>

          <div>
            <label>연결된 회원 (선택)</label>
            <select value={formData.memberId} onChange={e => setFormData({ ...formData, memberId: e.target.value })}>
              <option value="">-- 미지정 (비회원) --</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.part})</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 4 }}>
              * 회비 등 특정 회원의 실적으로 잡혀야 할 경우에만 선택하세요.
            </p>
          </div>

          <div>
            <label>비고 (메모)</label>
            <input type="text" value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} placeholder="환불, 상계처리 등 메모 입력" />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1, color: 'var(--red-500)', borderColor: 'var(--red-200)' }} onClick={handleDelete}>
              삭제
            </button>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>저장</button>
          </div>
        </form>
      </div>
    </div>
  );
}
