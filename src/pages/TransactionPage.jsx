import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatKRW, isRefundTx, normalizeCategory } from '../utils/calculations';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, CATEGORY_ICONS } from '../data/constants';
import ExcelImportModal from '../components/ExcelImportModal';
import EditTransactionModal from '../components/EditTransactionModal';
import './Pages.css';

const PARTS_FILTER = ['전체', 'VOIX · SESSION', 'DANCE', '공통'];
const TYPES_FILTER = ['전체', '수입', '지출'];

export default function TransactionPage({ openExcelImport }) {
  const { state, dispatch } = useApp();
  const { isAdmin: rawIsAdmin, requestLogin } = useAuth();
  const isAdmin = rawIsAdmin && window.innerWidth >= 768;
  const { transactions, members } = state;

  const [partFilter, setPartFilter] = useState('전체');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [yearFilter, setYearFilter] = useState('전체');
  const [monthFilter, setMonthFilter] = useState('전체');
  const [categoryFilter, setCategoryFilter] = useState('전체');
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTx, setEditingTx] = useState(null);
  
  // 일괄 수정(Batch Edit) 관련 상태
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState(new Set());
  const [batchCategory, setBatchCategory] = useState('');
  const [batchPart, setBatchPart] = useState('');

  const years = useMemo(() => {
    const set = new Set(transactions.map(tx => tx.datetime.slice(0, 4)));
    return ['전체', ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [transactions]);

  const months = useMemo(() => {
    if (yearFilter === '전체') return ['전체'];
    const set = new Set(
      transactions
        .filter(tx => tx.datetime.startsWith(yearFilter))
        .map(tx => tx.datetime.slice(5, 7))
    );
    return ['전체', ...[...set].sort((a, b) => b.localeCompare(a))];
  }, [transactions, yearFilter]);

  const categories = useMemo(() => {
    const set = new Set();
    transactions.forEach(tx => {
      if (typeFilter === '전체' || (typeFilter === '수입' ? tx.type === 'income' : tx.type === 'expense')) {
        const normCat = normalizeCategory(tx.category || '기타', tx.type);
        set.add(normCat);
      }
    });
    return ['전체', ...[...set].sort()];
  }, [transactions, typeFilter]);

  // 수입/지출 탭 변경시 계정과목 필터 초기화
  useEffect(() => {
    setCategoryFilter('전체');
  }, [typeFilter]);

  const filtered = useMemo(() => transactions
    .filter(tx => partFilter === '전체' || (partFilter === 'VOIX · SESSION' ? (tx.part === 'VOIX' || tx.part === 'SESSION') : tx.part === partFilter))
    .filter(tx => typeFilter === '전체' || (typeFilter === '수입' ? tx.type === 'income' : tx.type === 'expense'))
    .filter(tx => categoryFilter === '전체' || normalizeCategory(tx.category, tx.type) === categoryFilter)
    .filter(tx => yearFilter === '전체' || tx.datetime.startsWith(yearFilter))
    .filter(tx => monthFilter === '전체' || tx.datetime.slice(5, 7) === monthFilter)
    .filter(tx => !unclassifiedOnly || tx.category === '기타' || tx.category === '기타지출')
    .filter(tx => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const desc = (tx.description || '').toLowerCase();
      const note = (tx.note || '').toLowerCase();
      const cat = (normalizeCategory(tx.category, tx.type) || '').toLowerCase();
      const part = (tx.part || '').toLowerCase();
      const m = members.find(x => x.id === tx.memberId);
      const mName = m ? m.name.toLowerCase() : '';
      return desc.includes(q) || note.includes(q) || cat.includes(q) || part.includes(q) || mName.includes(q);
    })
    .sort((a, b) => b.datetime.localeCompare(a.datetime)),
    [transactions, partFilter, typeFilter, categoryFilter, yearFilter, monthFilter, unclassifiedOnly, searchQuery, members]
  );

  const summaryFiltered = useMemo(() => transactions
    .filter(tx => partFilter === '전체' || (partFilter === 'VOIX · SESSION' ? (tx.part === 'VOIX' || tx.part === 'SESSION') : tx.part === partFilter))
    // 수입/지출 탭을 눌러도 요약 카드에서는 양쪽 다 보이게 하기 위해 typeFilter 제외
    .filter(tx => categoryFilter === '전체' || normalizeCategory(tx.category, tx.type) === categoryFilter)
    .filter(tx => yearFilter === '전체' || tx.datetime.startsWith(yearFilter))
    .filter(tx => monthFilter === '전체' || tx.datetime.slice(5, 7) === monthFilter)
    .filter(tx => !unclassifiedOnly || tx.category === '기타' || tx.category === '기타지출')
    .filter(tx => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const desc = (tx.description || '').toLowerCase();
      const note = (tx.note || '').toLowerCase();
      const cat = (normalizeCategory(tx.category, tx.type) || '').toLowerCase();
      const part = (tx.part || '').toLowerCase();
      const m = members.find(x => x.id === tx.memberId);
      const mName = m ? m.name.toLowerCase() : '';
      return desc.includes(q) || note.includes(q) || cat.includes(q) || part.includes(q) || mName.includes(q);
    }),
    [transactions, partFilter, typeFilter, categoryFilter, yearFilter, monthFilter, unclassifiedOnly, searchQuery, members]
  );

  const txMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => map[t.id] = t);
    return map;
  }, [transactions]);

  let totalIncome = 0;
  let totalExpense = 0;
  summaryFiltered.forEach(tx => {
    const isRefund = isRefundTx(tx, txMap);
    if (tx.type === 'income') {
      if (isRefund) totalExpense -= tx.amount;
      else totalIncome += tx.amount;
    } else {
      if (isRefund) totalIncome -= tx.amount;
      else totalExpense += tx.amount;
    }
  });

  // 멤버 이름 찾기 헬퍼
  const getMemberName = (id) => {
    const m = members.find(x => x.id === id);
    return m ? m.name : '-';
  };

  const handleRowClick = (tx) => {
    if (!isAdmin) return;
    if (isBatchMode) {
      const next = new Set(selectedTxIds);
      if (next.has(tx.id)) next.delete(tx.id);
      else next.add(tx.id);
      setSelectedTxIds(next);
    } else {
      setEditingTx(tx);
    }
  };

  const toggleSelectAll = () => {
    if (selectedTxIds.size === filtered.length && filtered.length > 0) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(filtered.map(t => t.id)));
    }
  };

  const handleBatchUpdate = () => {
    if (selectedTxIds.size === 0) return alert('선택된 항목이 없습니다.');
    if (!batchCategory && !batchPart) return alert('변경할 분류나 파트를 선택해주세요.');
    
    let msg = `선택한 ${selectedTxIds.size}개 항목을 일괄 변경하시겠습니까?\n`;
    if (batchCategory) msg += `- 분류: ${batchCategory}\n`;
    if (batchPart) msg += `- 파트: ${batchPart}\n`;
    
    if (!window.confirm(msg)) return;
    
    const updates = Array.from(selectedTxIds).map(id => {
      const update = { id };
      if (batchCategory) update.category = batchCategory;
      if (batchPart) update.part = batchPart;
      return update;
    });
    
    dispatch({ type: 'BATCH_UPDATE_TRANSACTIONS', updates });
    alert('일괄 수정이 완료되었습니다.');
    setSelectedTxIds(new Set());
    setIsBatchMode(false);
    setBatchCategory('');
    setBatchPart('');
  };

  return (
    <div className="page fade-in">
      {/* 상단 필터/액션 영역 */}
      <div className="flex-between" style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>내역 필터</h2>
        {isAdmin && (
          <button className="add-member-btn" onClick={openExcelImport}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4, verticalAlign: 'middle' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z M14 3v5h5 M12 18v-6 M9 15h6"/></svg>
            새 거래 추가
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 연도 필터 (Select) */}
        <select 
          className="filter-select" 
          value={yearFilter} 
          onChange={e => { setYearFilter(e.target.value); setMonthFilter('전체'); }}
        >
          {years.map(y => (
            <option key={y} value={y}>{y === '전체' ? '전체 연도' : `${y}년`}</option>
          ))}
        </select>

        {/* 월별 필터 (Select) */}
        <select 
          className="filter-select" 
          value={monthFilter} 
          onChange={e => setMonthFilter(e.target.value)}
          disabled={yearFilter === '전체'}
        >
          {months.map(m => (
            <option key={m} value={m}>{m === '전체' ? '전체 월' : `${m}월`}</option>
          ))}
        </select>

        {/* 파트 필터 (Select) */}
        <select 
          className="filter-select" 
          value={partFilter} 
          onChange={e => setPartFilter(e.target.value)}
        >
          {PARTS_FILTER.map(p => (
            <option key={p} value={p}>
              {p === '전체' ? '모든 파트' : p}
            </option>
          ))}
        </select>

        {/* 계정과목 필터 (Select) */}
        <select 
          className="filter-select" 
          value={categoryFilter} 
          onChange={e => setCategoryFilter(e.target.value)}
          style={{ width: '110px' }}
        >
          {categories.map(c => (
            <option key={c} value={c}>
              {c === '전체' ? '모든 분류' : c}
            </option>
          ))}
        </select>

        {/* 검색 필터 */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="적요, 회원명, 분류 검색..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ 
              paddingLeft: '32px', 
              paddingRight: '28px',
              height: '38px', 
              borderRadius: '8px',
              border: '1px solid var(--slate-200)',
              fontSize: '13px',
              outline: 'none',
              width: '200px',
              background: 'white'
            }}
          />
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="var(--slate-400)" 
            strokeWidth="2.5" 
            style={{ position: 'absolute', left: 10, pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          {searchQuery && (
            <button 
              type="button" 
              onClick={() => setSearchQuery('')}
              style={{ 
                position: 'absolute', 
                right: 8, 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer', 
                color: 'var(--slate-400)',
                fontSize: 12,
                padding: 4
              }}
            >
              ✕
            </button>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--slate-600)', cursor: 'pointer', marginLeft: 8 }}>
          <input type="checkbox" checked={unclassifiedOnly} onChange={e => setUnclassifiedOnly(e.target.checked)} style={{ accentColor: 'var(--blue-500)' }} />
          미분류만 보기
        </label>

        {/* 수입/지출 필터 (Segmented Control) */}
        <div className="segmented-control" style={{ marginLeft: 'auto' }}>
          {TYPES_FILTER.map(t => (
            <button key={t} className={`segment-btn ${typeFilter === t ? 'active' : ''}`}
              onClick={() => setTypeFilter(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* 상단 1. 수입/지출 내역 요약 */}
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 10px' }}>
        {yearFilter === '전체' ? '전체 내역 요약' : monthFilter === '전체' ? `${yearFilter}년 전체 요약` : `${yearFilter}년 ${monthFilter}월 요약`}
        {partFilter !== '전체' && <span style={{ color: 'var(--blue-500)', marginLeft: 8 }}>{partFilter}</span>}
      </h3>
      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div className="month-summary">
          <div className="month-col">
            <span>총 수입</span><strong className="text-green">+{formatKRW(totalIncome)}</strong>
          </div>
          <div className="month-divider" />
          <div className="month-col">
            <span>총 지출</span><strong className="text-red">-{formatKRW(totalExpense)}</strong>
          </div>
          <div className="month-divider" />
          <div className="month-col">
            <span>잔액</span><strong className={totalIncome - totalExpense >= 0 ? 'text-blue' : 'text-red'}>
              {totalIncome - totalExpense >= 0 ? '+' : '-'}{formatKRW(totalIncome - totalExpense)}
            </strong>
          </div>
        </div>
      </div>

      {/* 하단 2. 전체 거래 내역 (세부 낱개) */}
      <div className="flex-between" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>전체 거래 내역</h3>
        {isAdmin && (
          <button className={`filter-chip ${isBatchMode ? 'active' : ''}`} onClick={() => {
            setIsBatchMode(!isBatchMode);
            setSelectedTxIds(new Set());
          }}>
            {isBatchMode ? '일괄 수정 취소' : '☑️ 다중 선택 모드'}
          </button>
        )}
      </div>
      
      {isBatchMode && (
        <div className="alert-banner" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{selectedTxIds.size}개 항목 선택됨</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <select className="filter-select" value={batchCategory} onChange={e => setBatchCategory(e.target.value)} style={{ padding: '4px 8px', height: 'auto', fontSize: 13 }}>
              <option value="">-- 분류 유지 --</option>
              <optgroup label="수입 분류">
                {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="지출 분류">
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            </select>
            <select className="filter-select" value={batchPart} onChange={e => setBatchPart(e.target.value)} style={{ padding: '4px 8px', height: 'auto', fontSize: 13 }}>
              <option value="">-- 파트 유지 --</option>
              {PARTS_FILTER.filter(p => p !== '전체').map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button className="btn-primary btn-sm" style={{ padding: '6px 12px', height: 'auto', fontSize: 13, width: 'auto' }} onClick={handleBatchUpdate}>
              일괄 변경 적용
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-header">
          {isBatchMode && (
            <div style={{ width: 32, textAlign: 'center' }}>
              <input type="checkbox" checked={filtered.length > 0 && selectedTxIds.size === filtered.length} onChange={toggleSelectAll} />
            </div>
          )}
          <div className="th-date">일시</div>
          <div className="th-desc">거래자명</div>
          <div className="th-note">거래 내용</div>
          <div className="th-type">유형</div>
          <div className="th-cat">분류/파트</div>
          <div className="th-amount">금액</div>
        </div>
        
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate-400)' }}>조회된 데이터가 없습니다.</div>
        )}
        
        <div className="table-body">
          {filtered.map(tx => (
            <div key={tx.id} 
                 className={`table-row ${isAdmin && !isBatchMode ? 'clickable' : ''}`} 
                 style={{ cursor: isAdmin ? 'pointer' : 'default', backgroundColor: selectedTxIds.has(tx.id) ? 'var(--blue-50)' : undefined }}
                 onClick={() => handleRowClick(tx)}>
              
              {isBatchMode && (
                <div style={{ width: 32, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedTxIds.has(tx.id)} onChange={() => handleRowClick(tx)} />
                </div>
              )}

              <div className="td-date">
                <span className="td-date-ymd pc-only-date">{tx.datetime.slice(0,10)}</span>
                <span className="td-date-ymd mobile-only-date">{tx.datetime.slice(5,10)}</span>
                <span className="td-date-hm text-muted" style={{ fontSize: 11 }}>{tx.datetime.slice(11,16)}</span>
              </div>
              <div className="td-desc">
                <strong>{tx.description}</strong>
                {tx.memberId && tx.description.trim() !== getMemberName(tx.memberId).trim() && (
                  <span className="badge badge-common" style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px' }}>
                    {getMemberName(tx.memberId)}
                  </span>
                )}
                {tx.linkedTxId && (() => {
                  const linked = transactions.find(t => t.id === tx.linkedTxId);
                  if (!linked) return null;
                  const typeLabel = linked.type === 'income' ? '수입 회수' : '지출 반환';
                  return (
                    <span style={{ 
                      marginLeft: 6, 
                      fontSize: 10, 
                      color: '#16a34a', 
                      background: '#f0fdf4', 
                      border: '1px solid #bbf7d0', 
                      borderRadius: 4, 
                      padding: '1px 5px',
                      fontWeight: 600
                    }}>
                      🔗 {typeLabel} ({linked.description})
                    </span>
                  );
                })()}
                
                {/* 모바일 화면에서만 거래 내용(메모)을 이름 하단에 노출 */}
                {tx.note && <div className="mobile-only-note text-muted" style={{ fontSize: 11, marginTop: 2 }}>{tx.note}</div>}

                {/* 분할 내역을 거래자명 하단에 항상 상세하게 표시 */}
                {tx.splitItems && tx.splitItems.length > 0 && (
                  <div className="split-items-list" style={{ marginTop: 6, paddingLeft: 8, borderLeft: '2px solid #cbd5e1' }}>
                    {tx.splitItems.map((item, idx) => (
                      <div key={idx} style={{ fontSize: 11, color: 'var(--slate-600)', display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3, alignItems: 'center' }}>
                        <span style={{ color: '#7c3aed', background: '#f5f3ff', padding: '1px 4px', borderRadius: 4, fontWeight: 700, fontSize: 9 }}>
                          {normalizeCategory(item.category, tx.type)}/{item.part}
                        </span>
                        <span style={{ fontWeight: 600 }}>{item.desc || '내용 없음'}</span>
                        <span className={item.linkedTxId ? 'diagonal-strike' : ''} style={{ 
                          color: item.linkedTxId ? undefined : (tx.type === 'income' ? 'var(--emerald-600)' : 'var(--rose-600)'), 
                          fontWeight: 700
                        }}>
                          ({formatKRW(Number(item.amount) || 0)})
                        </span>
                        {item.memberId && (
                          <span className="badge badge-common" style={{ fontSize: 9, padding: '0px 4px' }}>
                            {getMemberName(item.memberId)}
                          </span>
                        )}
                        {item.linkedTxId && (() => {
                          const linked = transactions.find(t => t.id === item.linkedTxId);
                          if (!linked) return null;
                          const isOpposite = linked.type !== tx.type;
                          const typeLabel = linked.type === 'income' ? '수입 회수' : '지출 반환';
                          return (
                            <span style={{ 
                              marginLeft: 4, 
                              fontSize: 9, 
                              color: isOpposite ? '#16a34a' : '#f97316', 
                              background: isOpposite ? '#f0fdf4' : '#fff7ed', 
                              border: isOpposite ? '1px solid #bbf7d0' : '1px solid #fed7aa', 
                              borderRadius: 4, 
                              padding: '0px 4px', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: 2, 
                              fontWeight: 600 
                            }}>
                              🔗 {isOpposite ? `${typeLabel}됨` : '상계됨'} ({linked.description})
                            </span>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="td-note">
                {tx.note || <span className="text-muted" style={{ fontStyle: 'italic', fontSize: 12 }}>-</span>}
              </div>
              <div className="td-type">
                <span className={`badge ${tx.type === 'income' ? 'badge-success' : 'badge-danger'}`}>
                  {tx.type === 'income' ? '입금' : '출금'}
                </span>
              </div>
              <div className="td-cat">
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {tx.splitItems && tx.splitItems.length > 0
                    ? [...new Set(tx.splitItems.map(item => normalizeCategory(item.category, tx.type)).filter(Boolean))].join(', ') || '분할'
                    : (() => {
                        const normCat = normalizeCategory(tx.category, tx.type);
                        return <><span style={{ fontSize: 13 }}>{CATEGORY_ICONS[normCat] || '📌'}</span> {normCat}</>;
                      })()}
                </span>
                <span className="text-muted" style={{ fontSize: 11, display: 'block' }}>
                  {tx.splitItems && tx.splitItems.length > 0
                    ? [...new Set(tx.splitItems.map(item => item.part).filter(Boolean))].join(', ')
                    : tx.part}
                </span>
              </div>
              <div className={`td-amount ${tx.linkedTxId ? 'diagonal-strike' : (tx.type === 'income' ? 'text-green' : 'text-red')}`}>
                <strong>{formatKRW(tx.amount)}</strong>
              </div>
            </div>
          ))}
        </div>
        
        {/* 총계 푸터 */}
        <div className="table-footer flex-between" style={{ background: 'var(--slate-50)', flexWrap: 'wrap', gap: 10 }}>
          <span className="text-muted">총 {filtered.length}건 조회</span>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div><span className="text-muted" style={{ marginRight: 6 }}>총 수입</span><strong className="text-green">+{formatKRW(totalIncome)}</strong></div>
            <div><span className="text-muted" style={{ marginRight: 6 }}>총 지출</span><strong className="text-red">-{formatKRW(totalExpense)}</strong></div>
          </div>
        </div>
      </div>

      {editingTx && <EditTransactionModal tx={editingTx} onClose={() => setEditingTx(null)} />}
    </div>
  );
}
