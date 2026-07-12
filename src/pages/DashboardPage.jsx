import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { calcPartBalances, calcMonthlyStats, calcMemberDues, formatKRW, isRefundTx, normalizeCategory } from '../utils/calculations';
import ShareSummaryModal from '../components/ShareSummaryModal';
import './Pages.css';

const PART_CONFIGS = {
  VOIX:    { label: 'VOIX',    colorClass: 'voix' },
  DANCE:   { label: 'DANCE',   colorClass: 'dance' },
  SESSION: { label: 'SESSION', colorClass: 'session' },
  공통:    { label: '공통',    colorClass: 'common' },
};

import { CATEGORY_ICONS } from '../data/constants';

export default function DashboardPage({ onAddClick, setTab }) {
  const { state } = useApp();
  const { transactions, members } = state;
  const [showShareModal, setShowShareModal] = useState(false);

  const totalBalance = transactions.reduce(
    (s, tx) => tx.type === 'income' ? s + tx.amount : s - tx.amount, 0
  );
  const partBal = calcPartBalances(transactions);
  const monthly = calcMonthlyStats(transactions);
  const thisMonth = monthly[monthly.length - 1] || { income: 0, expense: 0, month: '-' };

  const txMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => map[t.id] = t);
    return map;
  }, [transactions]);

  const thisMonthIncomes = useMemo(() => {
    if (!thisMonth.month || thisMonth.month === '-') return [];
    const map = {};
    transactions.filter(t => t.datetime.startsWith(thisMonth.month)).forEach(t => {
      const isRefund = isRefundTx(t, txMap);
      const isIncome = t.type === 'income' && !isRefund;
      const isRecovery = t.type === 'expense' && isRefund;
      if (!isIncome && !isRecovery) return;
      
      const multiplier = isRecovery ? -1 : 1;
      
      if (t.splitItems && t.splitItems.length > 0) {
        t.splitItems.forEach(item => {
          const rawCat = item.category || '기타';
          const cat = normalizeCategory(rawCat, 'income');
          map[cat] = (map[cat] || 0) + (Number(item.amount) || 0) * multiplier;
        });
      } else {
        const rawCat = t.category || '기타';
        const cat = normalizeCategory(rawCat, 'income');
        map[cat] = (map[cat] || 0) + t.amount * multiplier;
      }
    });
    return Object.entries(map).map(([category, amount]) => ({ category, amount }))
      .filter(x => x.amount > 0) // 음수나 0이 된 카테고리는 제외
      .sort((a, b) => b.amount - a.amount);
  }, [transactions, thisMonth.month, txMap]);

  const thisMonthExpenses = useMemo(() => {
    if (!thisMonth.month || thisMonth.month === '-') return [];
    const map = {};
    transactions.filter(t => t.datetime.startsWith(thisMonth.month)).forEach(t => {
      const isRefund = isRefundTx(t, txMap);
      const isExpense = t.type === 'expense' && !isRefund;
      const isReturn = t.type === 'income' && isRefund;
      if (!isExpense && !isReturn) return;
      
      const multiplier = isReturn ? -1 : 1;

      if (t.splitItems && t.splitItems.length > 0) {
        t.splitItems.forEach(item => {
          const rawCat = item.category || '기타';
          const cat = normalizeCategory(rawCat, 'expense');
          map[cat] = (map[cat] || 0) + (Number(item.amount) || 0) * multiplier;
        });
      } else {
        const rawCat = t.category || '기타';
        const cat = normalizeCategory(rawCat, 'expense');
        map[cat] = (map[cat] || 0) + t.amount * multiplier;
      }
    });
    return Object.entries(map).map(([category, amount]) => ({ category, amount }))
      .filter(x => x.amount > 0) // 음수나 0이 된 카테고리는 제외
      .sort((a, b) => b.amount - a.amount);
  }, [transactions, thisMonth.month, txMap]);

  const unpaidCount = members.filter(m =>
    m.status === 'active' && calcMemberDues(m, transactions).diff < 0
  ).length;

  const activeMembers = members.filter(m => m.status === 'active');
  const paidThisMonth = activeMembers.filter(m => {
    const dues = calcMemberDues(m, transactions);
    return dues.diff >= 0;
  });
  const duesRate = activeMembers.length > 0 ? Math.round((paidThisMonth.length / activeMembers.length) * 100) : 0;
  const duesColor = duesRate >= 80 ? 'var(--emerald-500)' : duesRate >= 50 ? '#f59e0b' : 'var(--rose-500)';
  const recentTxs = [...transactions]
    .sort((a, b) => b.datetime.localeCompare(a.datetime))
    .slice(0, 6);

  if (state.loading) return <div className="page-loading">불러오는 중…</div>;

  return (
    <div className="page fade-in">
      {/* 총 잔액 히어로 */}
      <div className="hero-card" style={{ marginBottom: 16 }}>
        <div className="flex-between">
          <p className="hero-label" style={{ margin: 0 }}>현재 총 잔액</p>
          {state.lastUpdated && (
            <p className="hero-label" style={{ margin: 0, fontSize: 11, opacity: 0.7, fontWeight: 500 }}>
              최근 업데이트: {
                new Date(state.lastUpdated).toLocaleDateString('ko-KR', {
                  year: 'numeric', month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit'
                })
              }
            </p>
          )}
        </div>
        <h2 className="hero-amount" style={{ color: totalBalance < 0 ? '#fca5a5' : 'inherit', marginBottom: 8, fontSize: 'clamp(26px, 5vw, 34px)' }}>
          {totalBalance < 0 ? '-' : ''}{formatKRW(Math.abs(totalBalance))}
        </h2>
        <p className="hero-sub" style={{ marginBottom: 20 }}>토스뱅크 1001-7629-3105</p>
        
        {/* 파트별 잔고 현황 (히어로 내부에 병합) */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 16 }}>
          {['VOIX · SESSION', 'DANCE', '공통'].map(p => {
            const pb = p === 'VOIX · SESSION' ? (partBal['VOIX'] || 0) + (partBal['SESSION'] || 0) : (partBal[p] || 0);
            return (
              <div key={p} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 4, whiteSpace: 'nowrap' }}>{p}</div>
                <div style={{ fontSize: 'clamp(15px, 4vw, 22px)', fontWeight: 800, color: pb < 0 ? '#fca5a5' : '#ffffff', whiteSpace: 'nowrap', letterSpacing: '-0.5px' }}>
                  {formatKRW(pb)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 중간 그리드: 요약 및 납부율 */}
      <div className="dashboard-middle-grid">
        {/* 이달 요약 */}
        <div className="card card-pad" style={{ overflow: 'visible', display: 'flex', flexDirection: 'column' }}>
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="card-title" style={{ margin: 0 }}>이번 달 요약</span>
            <button type="button" onClick={() => setShowShareModal(true)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 99, color: 'var(--blue-600)', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', outline: 'none', transition: 'all 0.2s' }} className="share-btn">
              📤 공유
            </button>
          </div>
          <span className="badge badge-gray">{thisMonth.month}</span>
        </div>
        <div className="month-summary" style={{ flex: 1 }}>
          <div className="month-col has-tooltip">
            <span>수입</span>
            <strong className="text-green">+{formatKRW(thisMonth.income)}</strong>
            <div className="tooltip-box">
              <div className="tooltip-title">{thisMonth.month ? thisMonth.month.slice(5) : ''}월 수입 구성</div>
              {thisMonthIncomes.length === 0 ? (
                <div style={{ color: 'var(--slate-400)', fontSize: 11 }}>내역 없음</div>
              ) : (
                thisMonthIncomes.map(item => (
                  <div className="tooltip-row" key={item.category}>
                    <span>{item.category}</span>
                    <strong>{formatKRW(item.amount)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="month-divider" />
          <div className="month-col has-tooltip">
            <span>지출</span>
            <strong className="text-red">-{formatKRW(thisMonth.expense)}</strong>
            <div className="tooltip-box">
              <div className="tooltip-title">{thisMonth.month ? thisMonth.month.slice(5) : ''}월 지출 구성</div>
              {thisMonthExpenses.length === 0 ? (
                <div style={{ color: 'var(--slate-400)', fontSize: 11 }}>내역 없음</div>
              ) : (
                thisMonthExpenses.map(item => (
                  <div className="tooltip-row" key={item.category}>
                    <span>{item.category}</span>
                    <strong>{formatKRW(item.amount)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="month-divider" />
          <div className="month-col has-tooltip">
            <span>잔액</span>
            <strong style={{ color: thisMonth.income - thisMonth.expense >= 0 ? 'inherit' : 'var(--red-500)' }}>
              {thisMonth.income - thisMonth.expense >= 0 ? '+' : '-'}{formatKRW(Math.abs(thisMonth.income - thisMonth.expense))}
            </strong>
            <div className="tooltip-box">
              <div className="tooltip-title">{thisMonth.month ? thisMonth.month.slice(5) : ''}월 잔액 계산</div>
              <div className="tooltip-row">
                <span>총 수입</span>
                <strong style={{ color: 'var(--emerald-400)' }}>+{formatKRW(thisMonth.income)}</strong>
              </div>
              <div className="tooltip-row">
                <span>총 지출</span>
                <strong style={{ color: 'var(--rose-400)' }}>-{formatKRW(thisMonth.expense)}</strong>
              </div>
              <div className="tooltip-divider" />
              <div className="tooltip-row">
                <span>순잔액</span>
                <strong>
                  {thisMonth.income - thisMonth.expense >= 0 ? '+' : '-'}
                  {formatKRW(Math.abs(thisMonth.income - thisMonth.expense))}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 이번 달 회비 납부율 (단일 카드) */}
      <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="card-title" style={{ margin: 0 }}>이번 달 회비 납부율</span>
          <span style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600 }}>회원 {activeMembers.length}명 중 {paidThisMonth.length}명 납부</span>
        </div>
        
        {/* 가로 막대 그래프 (PC & 모바일 공통) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: duesColor, lineHeight: 1 }}>{duesRate}%</span>
          </div>
          <div className="progress-track" style={{ height: 16, borderRadius: 8 }}>
            <div className="progress-fill" style={{ width: `${duesRate}%`, background: duesColor, borderRadius: 8 }} />
          </div>
          
          {/* 미납 내역 알림 (카드 내부로 통합) */}
          {unpaidCount > 0 && (
            <div 
              onClick={() => setTab?.('dues')}
              style={{ 
                marginTop: 16, 
                padding: '10px 12px', 
                background: '#fef2f2', 
                border: '1px solid #fecdd3', 
                borderRadius: 8, 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>⚠️</span>
                <span style={{ fontSize: 13, color: '#9f1239', fontWeight: 600 }}>미납 회원 <strong style={{ fontWeight: 800 }}>{unpaidCount}명</strong></span>
              </div>
              <span style={{ fontSize: 12, color: '#e11d48', fontWeight: 700 }}>납부 현황 확인 ❯</span>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* 최근 거래 타임라인 */}
      <div className="card">
        <div className="card-pad flex-between" style={{ paddingBottom: 0, marginBottom: 12 }}>
          <span className="card-title" style={{ margin: 0 }}>최근 거래</span>
          <button onClick={() => setTab?.('ledger')} style={{ background: 'transparent', border: 'none', color: 'var(--slate-500)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            더 보기 <span style={{ fontSize: 10 }}>❯</span>
          </button>
        </div>
        {recentTxs.map((tx, i) => {
          const normCat = normalizeCategory(tx.category, tx.type);
          return (
            <div key={tx.id} className="timeline-row">
              <div className="timeline-icon">{CATEGORY_ICONS[normCat] || '📌'}</div>
              <div className="timeline-body">
                <div className="timeline-desc">{tx.description}</div>
                <div className="timeline-meta">{tx.datetime.slice(0, 10)} · {normCat}</div>
              </div>
              <span className={`timeline-amount ${tx.type}`}>
                {tx.type === 'income' ? '+' : '-'}{formatKRW(tx.amount)}
              </span>
            </div>
          );
        })}
      </div>

      {showShareModal && (
        <ShareSummaryModal onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}
