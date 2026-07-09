import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { formatKRW } from '../utils/calculations';
import ExcelImportModal from '../components/ExcelImportModal';
import EditTransactionModal from '../components/EditTransactionModal';
import './Pages.css';

const PARTS_FILTER = ['전체', 'VOIX', 'DANCE', 'SESSION', '공통'];
const TYPES_FILTER = ['전체', '수입', '지출'];

export default function TransactionPage() {
  const { state, dispatch } = useApp();
  const { isAdmin, requestLogin } = useAuth();
  const { transactions, members } = state;

  const [partFilter, setPartFilter] = useState('전체');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [yearFilter, setYearFilter] = useState('전체');
  const [monthFilter, setMonthFilter] = useState('전체');
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  
  // 일괄 수정(Batch Edit) 관련 상태
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState(new Set());

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

  const filtered = useMemo(() => transactions
    .filter(tx => partFilter === '전체' || tx.part === partFilter)
    .filter(tx => typeFilter === '전체' || (typeFilter === '수입' ? tx.type === 'income' : tx.type === 'expense'))
    .filter(tx => yearFilter === '전체' || tx.datetime.startsWith(yearFilter))
    .filter(tx => monthFilter === '전체' || tx.datetime.slice(5, 7) === monthFilter)
    .filter(tx => !unclassifiedOnly || tx.category === '기타' || tx.category === '기타지출')
    .sort((a, b) => b.datetime.localeCompare(a.datetime)),
    [transactions, partFilter, typeFilter, yearFilter, monthFilter, unclassifiedOnly]
  );

  const totalIncome  = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

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

  const handleBatchUpdateToPerformance = () => {
    if (selectedTxIds.size === 0) return alert('선택된 항목이 없습니다.');
    if (!window.confirm(`선택한 ${selectedTxIds.size}개 항목을 모두 '공연 수익'으로 변경하시겠습니까?\n(분류: 공연 수익 / 파트: 공통 / 연결된 회원: 미지정)`)) return;
    
    const updates = Array.from(selectedTxIds).map(id => ({
      id,
      category: '공연 수익',
      part: '공통',
      memberId: '' // 비회원으로 변경
    }));
    
    dispatch({ type: 'BATCH_UPDATE_TRANSACTIONS', updates });
    alert('일괄 수정이 완료되었습니다.');
    setSelectedTxIds(new Set());
    setIsBatchMode(false);
  };

  return (
    <div className="page fade-in">
      {/* 상단 필터/액션 영역 */}
      <div className="flex-between" style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>내역 필터</h2>
        {isAdmin && (
          <button className="add-member-btn" onClick={() => setShowExcelModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4, verticalAlign: 'middle' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z M14 3v5h5 M12 18v-6 M9 15h6"/></svg>
            엑셀 붙여넣기
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
        <div className="alert-banner" style={{ marginBottom: 16 }}>
          <span>{selectedTxIds.size}개 항목 선택됨</span>
          <button className="btn-primary btn-sm" style={{ padding: '6px 12px', height: 'auto', fontSize: 13, width: 'auto' }} onClick={handleBatchUpdateToPerformance}>
            모두 '공연 수익(비회원)'으로 변경
          </button>
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
          <div className="th-desc">적요 (이름)</div>
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
                <span className="td-date-ymd">{tx.datetime.slice(0,10)}</span>
                <span className="td-date-hm text-muted" style={{ fontSize: 11 }}>{tx.datetime.slice(11,16)}</span>
              </div>
              <div className="td-desc">
                <strong>{tx.description}</strong>
                {tx.memberId && tx.description.trim() !== getMemberName(tx.memberId).trim() && (
                  <span className="badge badge-common" style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px' }}>
                    {getMemberName(tx.memberId)}
                  </span>
                )}
                {tx.note && <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{tx.note}</div>}
              </div>
              <div className="td-type">
                <span className={`badge ${tx.type === 'income' ? 'badge-success' : 'badge-danger'}`}>
                  {tx.type === 'income' ? '입금' : '출금'}
                </span>
              </div>
              <div className="td-cat">
                <span>{tx.category}</span>
                {tx.part && <span className="text-muted" style={{ fontSize: 11, display: 'block' }}>{tx.part}</span>}
              </div>
              <div className={`td-amount ${tx.type === 'income' ? 'text-green' : 'text-red'}`}>
                <strong>{formatKRW(tx.amount)}</strong>
              </div>
            </div>
          ))}
        </div>
        
        {/* 총계 푸터 */}
        <div className="table-footer flex-between" style={{ background: 'var(--slate-50)' }}>
          <span className="text-muted">총 {filtered.length}건 조회</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <div><span className="text-muted" style={{ marginRight: 6 }}>총 수입</span><strong className="text-green">+{formatKRW(totalIncome)}</strong></div>
            <div><span className="text-muted" style={{ marginRight: 6 }}>총 지출</span><strong className="text-red">-{formatKRW(totalExpense)}</strong></div>
          </div>
        </div>
      </div>

      {showExcelModal && <ExcelImportModal onClose={() => setShowExcelModal(false)} />}
      {editingTx && <EditTransactionModal tx={editingTx} onClose={() => setEditingTx(null)} />}
    </div>
  );
}
