import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatKRW, normalizeCategory } from '../utils/calculations';

import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../data/constants';
const PARTS = ['VOIX', 'DANCE', 'SESSION', '공통'];

const newSplitItem = (type) => ({
  desc: '',
  amount: '',
  category: type === 'income' ? '회비수익' : '임차료',
  part: '공통',
  memberId: ''
});

export default function EditTransactionModal({ tx, onClose }) {
  const { state, dispatch } = useApp();
  const { runWithAdmin } = useAuth();
  const { members, transactions } = state;

  const [formData, setFormData] = useState({
    category: '',
    part: '공통',
    datetime: '',
    description: '',
    memberId: '',
    note: '',
    linkedTxId: ''
  });

  const [splitItems, setSplitItems] = useState([]); // 분할 항목
  const [showSplit, setShowSplit] = useState(false);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');

  useEffect(() => {
    if (tx) {
      setFormData({
        category: tx.category ? normalizeCategory(tx.category, tx.type) : (tx.type === 'income' ? '회비수익' : '임차료'),
        part: tx.part || '공통',
        datetime: tx.datetime ? tx.datetime.slice(0, 16) : '',
        description: tx.description || '',
        memberId: tx.memberId || '',
        note: tx.note || '',
        linkedTxId: tx.linkedTxId || ''
      });
      const sanitizedSplitItems = (tx.splitItems || []).map(item => ({
        ...item,
        category: item.category ? normalizeCategory(item.category, tx.type) : (tx.type === 'income' ? '회비수익' : '임차료')
      }));
      setSplitItems(sanitizedSplitItems);
      setShowSplit(!!(tx.splitItems && tx.splitItems.length > 0));
    }
  }, [tx]);

  // 분할 항목 합계
  const splitTotal = splitItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const splitRemaining = tx ? tx.amount - splitTotal : 0;

  // 거래가 완전히 다른 건에 상계되어 있는지 확인
  const isAlreadyLinked = (t, currentTxId) => {
    if (t.linkedTxId && t.linkedTxId !== currentTxId) return true;
    if (t.splitItems && t.splitItems.some(it => it.linkedTxId && it.linkedTxId !== currentTxId)) return true;
    return false;
  };

  // 상계 후보
  const linkedCandidates = useMemo(() => transactions.filter(t =>
    t.id !== tx?.id && t.amount === tx?.amount && t.type !== tx?.type &&
    !isAlreadyLinked(t, tx?.id)
  ), [transactions, tx]);

  const filteredCandidates = useMemo(() => {
    if (!linkSearch) return linkedCandidates;
    return linkedCandidates.filter(t =>
      t.description.includes(linkSearch) || t.datetime.includes(linkSearch)
    );
  }, [linkedCandidates, linkSearch]);

  const getTransactionDesc = (id) => {
    const t = transactions.find(t => t.id === id);
    return t ? t.description : '알 수 없음';
  };

  const getTransactionAmount = (id) => {
    const t = transactions.find(t => t.id === id);
    return t ? t.amount : 0;
  };

  const getCandidatesForAmount = (amount, excludeId) => {
    const amt = Number(amount) || 0;
    
    // 후보: 나와 반대 타입이고, (연결 안 된 것이거나, 현재 거래에 이미 연결된 것)
    const candidates = transactions.filter(t =>
      t.id !== excludeId &&
      t.type !== tx.type &&
      !isAlreadyLinked(t, excludeId)
    );

    // 정렬: 금액이 완전히 일치하는 것 우선, 그 다음 최신순
    return candidates.sort((a, b) => {
      const aMatch = Math.abs(a.amount) === amt;
      const bMatch = Math.abs(b.amount) === amt;
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return new Date(b.datetime) - new Date(a.datetime);
    });
  };

  const handleAutoReconcile = () => {
    const matchedIds = new Set(splitItems.map(it => it.linkedTxId).filter(Boolean));
    const newItems = splitItems.map(item => {
      if (item.linkedTxId) return item;
      const amt = Number(item.amount) || 0;
      if (amt <= 0) return item;
      const match = transactions.find(t =>
        t.id !== tx.id &&
        Math.abs(t.amount) === amt &&
        t.type !== tx.type &&
        !isAlreadyLinked(t, tx.id) &&
        !matchedIds.has(t.id)
      );
      if (match) {
        matchedIds.add(match.id);
        return { ...item, linkedTxId: match.id };
      }
      return item;
    });
    setSplitItems(newItems);
  };

  const linkedTx = useMemo(() =>
    formData.linkedTxId ? transactions.find(t => t.id === formData.linkedTxId) : null,
    [formData.linkedTxId, transactions]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.datetime || !formData.description) {
      return alert('필수 항목(날짜, 적요)을 입력해주세요.');
    }
    if (showSplit && splitTotal > tx.amount) {
      return alert(`분할 항목 합계(${formatKRW(splitTotal)})가 총 금액(${formatKRW(tx.amount)})을 초과합니다.`);
    }

    runWithAdmin(() => {
      const normalizedCategory = normalizeCategory(formData.category, tx.type);
      const updated = {
        ...tx,
        ...formData,
        category: normalizedCategory,
        amount: tx.amount, // 금액은 원본 유지
        splitItems: showSplit 
          ? splitItems.filter(it => it.desc || it.amount).map(it => ({
              ...it,
              category: normalizeCategory(it.category, tx.type)
            }))
          : []
      };

      // 연결 상대에도 역방향 링크 처리 준비
      const newLinkedIds = new Set(updated.splitItems.map(it => it.linkedTxId).filter(Boolean));
      const oldLinkedIds = new Set((tx.splitItems || []).map(it => it.linkedTxId).filter(Boolean));

      if (formData.linkedTxId) newLinkedIds.add(formData.linkedTxId);
      if (tx.linkedTxId) oldLinkedIds.add(tx.linkedTxId);

      const batchUpdates = [];
      transactions.forEach(t => {
        if (newLinkedIds.has(t.id)) {
          const matchingSplit = updated.splitItems.find(it => it.linkedTxId === t.id);
          const newCategory = matchingSplit ? matchingSplit.category : (formData.linkedTxId === t.id ? updated.category : t.category);
          const linkMemo = updated.note ? updated.note : updated.description;
          
          if (t.linkedTxId !== tx.id || t.category !== newCategory || t.note !== linkMemo) {
            batchUpdates.push({ id: t.id, linkedTxId: tx.id, category: newCategory, note: linkMemo });
          }
        } else if (oldLinkedIds.has(t.id)) {
          if (t.linkedTxId === tx.id) {
            batchUpdates.push({ id: t.id, linkedTxId: '' });
          }
        }
      });

      // 1. 불변성을 완벽히 준수하며 상태를 반영한 새로운 트랜잭션 배열을 생성합니다.
      const updatedTransactions = transactions.map(t => {
        if (t.id === tx.id) return updated;
        
        if (newLinkedIds.has(t.id)) {
          const matchingSplit = updated.splitItems.find(it => it.linkedTxId === t.id);
          const newCategory = normalizeCategory(
            matchingSplit ? matchingSplit.category : (formData.linkedTxId === t.id ? updated.category : t.category),
            t.type
          );
          const linkMemo = updated.note ? updated.note : updated.description;
          return {
            ...t,
            linkedTxId: tx.id,
            category: newCategory,
            note: linkMemo
          };
        } else if (oldLinkedIds.has(t.id)) {
          if (t.linkedTxId === tx.id) {
            return { ...t, linkedTxId: '' };
          }
        }
        return t;
      });

      // 2. 스토어 상태 변경 디스패치
      dispatch({ type: 'UPDATE_TRANSACTION', tx: updated });
      if (batchUpdates.length > 0) {
        dispatch({ type: 'BATCH_UPDATE_TRANSACTIONS', updates: batchUpdates });
      }

      // 3. 로컬 스토리지 즉시 동기화 실행
      try {
        const serialized = JSON.stringify(updatedTransactions);
        localStorage.setItem('transactions', serialized);
        localStorage.setItem('lumique_transactions', serialized);
        localStorage.setItem('lumique_last_updated', new Date().toISOString());
      } catch (e) {
        console.error("Local Storage Sync Error:", e);
      }

      onClose();
    });
  };

  const handleDelete = () => {
    if (window.confirm('정말 이 내역을 삭제하시겠습니까?')) {
      runWithAdmin(() => {
        const updatedTransactions = transactions.filter(t => t.id !== tx.id);
        dispatch({ type: 'DELETE_TRANSACTION', id: tx.id });
        
        try {
          const serialized = JSON.stringify(updatedTransactions);
          localStorage.setItem('transactions', serialized);
          localStorage.setItem('lumique_transactions', serialized);
          localStorage.setItem('lumique_last_updated', new Date().toISOString());
        } catch (e) {
          console.error("Local Storage Sync Error:", e);
        }
        
        onClose();
      });
    }
  };

  if (!tx) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>거래 내역 수정</h3>
          <span className={`badge ${tx.type === 'income' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: 12 }}>
            {tx.type === 'income' ? '입금' : '출금'}
          </span>
          <strong style={{ marginLeft: 'auto', color: tx.type === 'income' ? 'var(--green-600, #16a34a)' : 'var(--red-500)', fontSize: 16 }}>
            {tx.type === 'income' ? '+' : '-'}{formatKRW(tx.amount)}
          </strong>
        </div>

        <form onSubmit={handleSubmit} className="add-form" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', paddingBottom: 20 }}>

          <div className="modal-form-row">
            <div style={{ flex: 1 }}>
              <label>분류</label>
              <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                <optgroup label="수입 분류">
                  {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
                <optgroup label="지출 분류">
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>파트</label>
              <select value={formData.part} onChange={e => setFormData({ ...formData, part: e.target.value })}>
                {PARTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="modal-form-row">
            <div style={{ flex: 1 }}>
              <label>일시</label>
              <input type="datetime-local" value={formData.datetime} onChange={e => setFormData({ ...formData, datetime: e.target.value })} required />
            </div>
            <div style={{ flex: 1 }}>
              <label>연결된 회원 (선택)</label>
              <select value={formData.memberId} onChange={e => setFormData({ ...formData, memberId: e.target.value })}>
                <option value="">-- 미지정 (비회원) --</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.part})</option>)}
              </select>
            </div>
          </div>

          <div className="modal-form-row">
            <div style={{ flex: 1 }}>
              <label>적요 (내용)</label>
              <input type="text" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} required />
            </div>
            <div style={{ flex: 1 }}>
              <label>비고 (메모)</label>
              <input type="text" value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} placeholder="메모 입력" />
            </div>
          </div>

          {/* ── 분할 기록 ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ margin: 0 }}>📂 분할 기록</label>
              <button type="button"
                style={{ fontSize: 12, color: 'var(--blue-500)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => {
                  setShowSplit(!showSplit);
                  if (!showSplit && splitItems.length === 0) setSplitItems([newSplitItem(tx.type)]);
                }}>
                {showSplit ? '접기' : '여러 항목으로 나누기'}
              </button>
            </div>

            {showSplit && (
              <div style={{ border: '1px solid var(--slate-200)', borderRadius: 10, overflow: 'hidden' }}>
                {/* 잔액 표시 */}
                <div style={{ padding: '8px 12px', background: splitRemaining < 0 ? '#fef2f2' : splitRemaining === 0 ? '#f0fdf4' : 'var(--slate-50)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderBottom: '1px solid var(--slate-200)', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--slate-500)' }}>
                    분할 합계: <strong>{formatKRW(splitTotal)}</strong> 
                    <span style={{ color: splitRemaining < 0 ? 'var(--red-500)' : splitRemaining === 0 ? '#16a34a' : 'var(--slate-600)', marginLeft: 8 }}>
                      ({splitRemaining === 0 ? '정확히 배분됨' : splitRemaining < 0 ? `${formatKRW(-splitRemaining)} 초과` : `잔여: ${formatKRW(splitRemaining)}`})
                    </span>
                  </span>
                  {splitItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoReconcile}
                      style={{ fontSize: 11, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                    >
                      ⚡ 일치 거래 자동 상계
                    </button>
                  )}
                </div>

                {/* 항목 목록 */}
                {splitItems.map((item, idx) => (
                  <div key={idx} style={{ padding: '10px 12px', borderBottom: '1px solid var(--slate-100)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="split-item-inputs">
                      <input type="text" placeholder="항목명" value={item.desc}
                        onChange={e => { const arr = [...splitItems]; arr[idx] = { ...arr[idx], desc: e.target.value }; setSplitItems(arr); }} />
                      <input type="number" placeholder="금액" value={item.amount}
                        onChange={e => { const arr = [...splitItems]; arr[idx] = { ...arr[idx], amount: e.target.value }; setSplitItems(arr); }} />
                      <button type="button" onClick={() => setSplitItems(splitItems.filter((_, i) => i !== idx))}
                        style={{ color: 'var(--red-400)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>
                    </div>
                    <div className="split-item-selects">
                      <select value={item.category}
                        onChange={e => { const arr = [...splitItems]; arr[idx] = { ...arr[idx], category: e.target.value }; setSplitItems(arr); }}>
                        <optgroup label="수입 분류">
                          {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                        <optgroup label="지출 분류">
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </optgroup>
                      </select>
                      <select value={item.part}
                        onChange={e => { const arr = [...splitItems]; arr[idx] = { ...arr[idx], part: e.target.value }; setSplitItems(arr); }}>
                        {PARTS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <select value={item.memberId}
                        onChange={e => { const arr = [...splitItems]; arr[idx] = { ...arr[idx], memberId: e.target.value }; setSplitItems(arr); }}>
                        <option value="">회원 없음</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    
                     <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px dashed var(--slate-200)', marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--slate-500)', whiteSpace: 'nowrap' }}>🔗 상계 거래:</span>
                      {item.linkedTxId ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                            {(() => {
                              const t = transactions.find(x => x.id === item.linkedTxId);
                              if (!t) return '알 수 없음';
                              const typeLabel = t.type === 'income' ? '입금' : '출금';
                              return `[${typeLabel}] ${t.description} (${formatKRW(t.amount)})`;
                            })()}
                          </span>
                          <button type="button" style={{ color: 'var(--red-500)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0, marginLeft: 'auto', fontWeight: 600 }}
                            onClick={() => {
                              const arr = [...splitItems];
                              arr[idx] = { ...arr[idx], linkedTxId: '' };
                              setSplitItems(arr);
                            }}>해제</button>
                        </div>
                      ) : (
                        <select
                          style={{ flex: 1, fontSize: 11, padding: '2px 4px', border: '1px solid var(--slate-200)', borderRadius: 4, background: 'white' }}
                          value={item.linkedTxId || ''}
                          onChange={e => {
                            const arr = [...splitItems];
                            arr[idx] = { ...arr[idx], linkedTxId: e.target.value };
                            setSplitItems(arr);
                          }}
                        >
                          <option value="">-- 연결 안 함 --</option>
                          {getCandidatesForAmount(item.amount, tx.id).map(t => (
                            <option key={t.id} value={t.id}>
                              [{t.type === 'income' ? '입금' : '출금'}] {t.description} ({t.datetime.slice(5, 10)}) - {formatKRW(t.amount)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setSplitItems([...splitItems, newSplitItem(tx.type)])}
                    style={{ flex: 1, padding: '10px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, cursor: 'pointer', color: 'var(--blue-600)', fontSize: 13, fontWeight: 600 }}>
                    + 항목 추가
                  </button>
                  <button type="button" onClick={() => {
                    const parts = window.prompt("몇 등분으로 나눌까요? (예: 14)\n분할된 금액과 일치하는 상계 후보를 자동으로 찾아 연결합니다.");
                    const n = parseInt(parts);
                    if (isNaN(n) || n <= 0) return;
                    
                    const amountPerPart = Math.floor(tx.amount / n);
                    
                    // 현재 이미 사용중인(다른 splitItem에 연결된) ID들을 제외
                    const usedIds = new Set(splitItems.map(it => it.linkedTxId).filter(Boolean));
                    
                    // 상계 후보 찾기
                    const candidates = transactions.filter(t => 
                      t.id !== tx.id && 
                      Math.abs(t.amount) === amountPerPart && 
                      t.type !== tx.type && 
                      !isAlreadyLinked(t, tx.id) &&
                      !usedIds.has(t.id)
                    );
                    
                    const newItems = [];
                    for (let i = 0; i < n; i++) {
                      const candidate = candidates[i];
                      newItems.push({
                        ...newSplitItem(tx.type),
                        amount: amountPerPart.toString(),
                        linkedTxId: candidate ? candidate.id : '',
                        desc: candidate ? candidate.description : '',
                        memberId: candidate && candidate.memberId ? candidate.memberId : '',
                        category: tx.category // 원본 거래의 분류를 상속
                      });
                    }
                    setSplitItems([...splitItems, ...newItems]);
                    alert(`${n}등분 완료 (항목당 ${amountPerPart}원)!\n매칭된 상대 거래: ${Math.min(n, candidates.length)}건`);
                  }}
                    style={{ flex: 1, padding: '10px', background: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: 8, cursor: 'pointer', color: 'var(--indigo-600)', fontSize: 13, fontWeight: 600 }}>
                    ✨ 1/N 일괄 상계 매칭
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── 상계 연결 ── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ margin: 0 }}>🔗 상계 거래 연결</label>
              <button type="button"
                style={{ fontSize: 12, color: 'var(--blue-500)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => setShowLinkPanel(!showLinkPanel)}>
                {showLinkPanel ? '닫기' : `후보 ${linkedCandidates.length}건 조회`}
              </button>
            </div>

            {linkedTx && !showLinkPanel && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>🔗 {linkedTx.description}</span>
                  <strong style={{ color: linkedTx.type === 'income' ? '#16a34a' : 'var(--red-500)' }}>
                    {linkedTx.type === 'income' ? '+' : '-'}{formatKRW(linkedTx.amount)}
                  </strong>
                </div>
                <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{linkedTx.datetime?.slice(0, 10)}</span>
                  <button type="button" style={{ color: 'var(--red-400)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
                    onClick={() => setFormData({ ...formData, linkedTxId: '' })}>연결 해제</button>
                </div>
              </div>
            )}

            {showLinkPanel && (
              <div style={{ border: '1px solid var(--slate-200)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '8px 10px', background: 'var(--slate-50)', borderBottom: '1px solid var(--slate-200)' }}>
                  <input type="text" placeholder="이름 또는 날짜로 검색..." value={linkSearch}
                    onChange={e => setLinkSearch(e.target.value)}
                    style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, outline: 'none' }} />
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {filteredCandidates.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--slate-400)', fontSize: 13 }}>금액이 동일한 반대 거래가 없습니다</div>
                  ) : filteredCandidates.map(t => (
                    <div key={t.id}
                      onClick={() => { setFormData({ ...formData, linkedTxId: t.id }); setShowLinkPanel(false); }}
                      style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: formData.linkedTxId === t.id ? 'var(--blue-50)' : 'transparent', borderBottom: '1px solid var(--slate-100)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.description}</div>
                        <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>{t.datetime?.slice(0, 10)}</div>
                      </div>
                      <strong style={{ color: t.type === 'income' ? '#16a34a' : 'var(--red-500)', fontSize: 13 }}>
                        {t.type === 'income' ? '+' : '-'}{formatKRW(t.amount)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>



          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1, color: 'var(--red-500)', borderColor: 'var(--red-200)' }} onClick={handleDelete}>삭제</button>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>저장</button>
          </div>
        </form>
      </div>
    </div>
  );
}
