import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { calcMonthlyStats, calcPartBalances, calcMemberDues, formatKRW } from '../utils/calculations';
import './Pages.css';

const PERIOD_OPTIONS = [
  { label: '전체', value: 'all' },
  { label: '올해', value: 'year' },
  { label: '최근 6개월', value: '6m' },
  { label: '최근 3개월', value: '3m' },
];

const PART_COLORS = {
  VOIX: '#2b74e2', DANCE: '#e2596b', SESSION: '#7c3aed', 공통: '#059669',
};

export default function AnalyticsPage() {
  const { state } = useApp();
  const { transactions, members } = state;
  const [period, setPeriod] = useState('all');

  // 기간 필터
  const filteredTxs = useMemo(() => {
    const now = new Date();
    return transactions.filter(tx => {
      if (period === 'all') return true;
      const d = new Date(tx.datetime);
      if (period === 'year') return d.getFullYear() === now.getFullYear();
      if (period === '6m') return (now - d) <= 1000 * 60 * 60 * 24 * 182;
      if (period === '3m') return (now - d) <= 1000 * 60 * 60 * 24 * 91;
      return true;
    });
  }, [transactions, period]);

  const totalIncome = filteredTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filteredTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netBalance = totalIncome - totalExpense;

  // 월별 통계 (최근 7개월)
  const monthly = calcMonthlyStats(filteredTxs).slice(-7);
  const maxIncome = Math.max(...monthly.map(m => m.income), 1);
  const maxExpense = Math.max(...monthly.map(m => m.expense), 1);

  // 누적 잔액 추세 (월별)
  const balanceTrend = useMemo(() => {
    const sortedMonthly = calcMonthlyStats(filteredTxs);
    let running = 0;
    return sortedMonthly.slice(-7).map(m => {
      running += m.income - m.expense;
      return { month: m.month, balance: running };
    });
  }, [filteredTxs]);
  const maxBalance = Math.max(...balanceTrend.map(b => Math.abs(b.balance)), 1);

  // 지출 계정과목별 — 실제 거래 데이터에서 동적 집계
  const expenseByCategory = useMemo(() => {
    const map = {};
    filteredTxs.forEach(t => {
      const isExpense = t.type === 'expense' && !t.linkedTxId;
      const isReturn = t.type === 'income' && t.linkedTxId;
      if (!isExpense && !isReturn) return;
      
      const multiplier = isReturn ? -1 : 1;

      if (t.splitItems && t.splitItems.length > 0) {
        t.splitItems.forEach(item => {
          const cat = item.category || '기타';
          map[cat] = (map[cat] || 0) + (Number(item.amount) || 0) * multiplier;
        });
      } else {
        const cat = t.category || '기타';
        map[cat] = (map[cat] || 0) + t.amount * multiplier;
      }
    });
    return Object.entries(map).map(([cat, total]) => ({ cat, total }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [filteredTxs]);
  const maxCat = Math.max(...expenseByCategory.map(e => e.total), 1);

  // 수입 카테고리별 — 동적 집계
  const incomeByCategory = useMemo(() => {
    const map = {};
    filteredTxs.forEach(t => {
      const isIncome = t.type === 'income' && !t.linkedTxId;
      const isRecovery = t.type === 'expense' && t.linkedTxId;
      if (!isIncome && !isRecovery) return;
      
      const multiplier = isRecovery ? -1 : 1;

      if (t.splitItems && t.splitItems.length > 0) {
        t.splitItems.forEach(item => {
          const cat = item.category || '기타';
          map[cat] = (map[cat] || 0) + (Number(item.amount) || 0) * multiplier;
        });
      } else {
        const cat = t.category || '기타';
        map[cat] = (map[cat] || 0) + t.amount * multiplier;
      }
    });
    return Object.entries(map).map(([cat, total]) => ({ cat, total }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [filteredTxs]);
  const maxIncomeCat = Math.max(...incomeByCategory.map(e => e.total), 1);

  // 파트별 잔액
  const partBal = calcPartBalances(filteredTxs);

  // 이번 달 회비 납부율
  const now = new Date();
  const thisYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const activeMembers = members.filter(m => m.status === 'active');
  const paidThisMonth = activeMembers.filter(m => {
    const dues = calcMemberDues(m, transactions);
    return dues.diff >= 0;
  });
  const duesRate = activeMembers.length > 0 ? Math.round((paidThisMonth.length / activeMembers.length) * 100) : 0;

  const INCOME_COLORS = ['#059669', '#2b74e2', '#f59e0b', '#7c3aed', '#e2596b'];
  const EXPENSE_COLORS = ['#e2596b', '#f97316', '#f59e0b', '#8b5cf6', '#6b7280'];

  return (
    <div className="page fade-in">

      {/* 기간 필터 */}
      <div className="segmented-control" style={{ marginBottom: 20, width: 'fit-content' }}>
        {PERIOD_OPTIONS.map(opt => (
          <button key={opt.value} className={`segment-btn ${period === opt.value ? 'active' : ''}`}
            onClick={() => setPeriod(opt.value)}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* 요약 카드 3개 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card card-pad has-tooltip" style={{ textAlign: 'center', overflow: 'visible' }}>
          <div style={{ fontSize: 11, color: 'var(--slate-500)', marginBottom: 4 }}>총 수입</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>+{formatKRW(totalIncome)}</div>
          <div className="tooltip-box">
            <div className="tooltip-title">수입 구성 (필터 기간)</div>
            {incomeByCategory.length === 0 ? (
              <div style={{ color: 'var(--slate-400)', fontSize: 11 }}>내역 없음</div>
            ) : (
              incomeByCategory.map(item => (
                <div className="tooltip-row" key={item.cat}>
                  <span>{item.cat}</span>
                  <strong>{formatKRW(item.total)}</strong>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="card card-pad has-tooltip" style={{ textAlign: 'center', overflow: 'visible' }}>
          <div style={{ fontSize: 11, color: 'var(--slate-500)', marginBottom: 4 }}>총 지출</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--red-500)' }}>-{formatKRW(totalExpense)}</div>
          <div className="tooltip-box">
            <div className="tooltip-title">지출 구성 (필터 기간)</div>
            {expenseByCategory.length === 0 ? (
              <div style={{ color: 'var(--slate-400)', fontSize: 11 }}>내역 없음</div>
            ) : (
              expenseByCategory.map(item => (
                <div className="tooltip-row" key={item.cat}>
                  <span>{item.cat}</span>
                  <strong>{formatKRW(item.total)}</strong>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="card card-pad has-tooltip" style={{ textAlign: 'center', overflow: 'visible' }}>
          <div style={{ fontSize: 11, color: 'var(--slate-500)', marginBottom: 4 }}>순잔액</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: netBalance >= 0 ? '#059669' : 'var(--red-500)' }}>
            {netBalance >= 0 ? '+' : ''}{formatKRW(netBalance)}
          </div>
          <div className="tooltip-box">
            <div className="tooltip-title">순잔액 계산</div>
            <div className="tooltip-row">
              <span>총 수입</span>
              <strong style={{ color: 'var(--emerald-400)' }}>+{formatKRW(totalIncome)}</strong>
            </div>
            <div className="tooltip-row">
              <span>총 지출</span>
              <strong style={{ color: 'var(--rose-400)' }}>-{formatKRW(totalExpense)}</strong>
            </div>
            <div className="tooltip-divider" />
            <div className="tooltip-row">
              <span>순잔액</span>
              <strong>{netBalance >= 0 ? '+' : ''}{formatKRW(netBalance)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 월별 수입/지출 바 차트 */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <span className="card-title">월별 수입 / 지출</span>
        {monthly.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 24 }}>해당 기간 데이터가 없습니다</div>
          : <>
            <div className="bar-chart">
              {monthly.map(m => (
                <div key={m.month} className="bar-chart-col">
                  <div className="bar-pair">
                    <div className="bar income" style={{ height: `${(m.income / maxIncome) * 100}%` }} title={`+${formatKRW(m.income)}`} />
                    <div className="bar expense" style={{ height: `${(m.expense / maxExpense) * 100}%` }} title={`-${formatKRW(m.expense)}`} />
                  </div>
                  <span className="bar-label">{m.month.slice(5)}월</span>
                </div>
              ))}
            </div>
            <div className="bar-legend">
              <span><i style={{ background: 'var(--green-500)' }} />수입</span>
              <span><i style={{ background: 'var(--red-500)' }} />지출</span>
            </div>
          </>
        }
      </div>

      {/* 누적 잔액 추세 */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <span className="card-title">월별 누적 잔액 추세</span>
        {balanceTrend.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 24 }}>해당 기간 데이터가 없습니다</div>
          : <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 100, paddingTop: 8 }}>
              {balanceTrend.map((b, i) => {
                const h = Math.abs(b.balance) / maxBalance * 80;
                const isNeg = b.balance < 0;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div title={formatKRW(b.balance)}
                        style={{ width: '60%', height: `${h}px`, minHeight: 4, background: isNeg ? '#fca5a5' : '#6ee7b7', borderRadius: '4px 4px 0 0' }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--slate-500)' }}>{b.month.slice(5)}월</span>
                  </div>
                );
              })}
            </div>
        }
      </div>

      {/* 지출 계정과목 + 수입 카테고리 나란히 */}
      <div className="dash-grid-2" style={{ gap: 16, marginBottom: 16 }}>
        <div className="card card-pad">
          <span className="card-title">지출 계정과목</span>
          {expenseByCategory.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 16, fontSize: 13 }}>지출 내역 없음</div>
            : expenseByCategory.map(({ cat, total }, i) => (
              <div key={cat} className="cat-row">
                <div className="cat-row-top">
                  <span className="cat-name" style={{ fontSize: 12 }}>{cat}</span>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{formatKRW(total)}</span>
                </div>
                <div className="cat-bar-track">
                  <div className="cat-bar-fill" style={{ width: `${(total / maxCat) * 100}%`, background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                </div>
                <span className="cat-pct">{totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0}%</span>
              </div>
            ))
          }
        </div>

        <div className="card card-pad">
          <span className="card-title">수입 분류</span>
          {incomeByCategory.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 16, fontSize: 13 }}>수입 내역 없음</div>
            : incomeByCategory.map(({ cat, total }, i) => (
              <div key={cat} className="cat-row">
                <div className="cat-row-top">
                  <span className="cat-name" style={{ fontSize: 12 }}>{cat}</span>
                  <span style={{ fontWeight: 600, fontSize: 12, color: '#059669' }}>{formatKRW(total)}</span>
                </div>
                <div className="cat-bar-track">
                  <div className="cat-bar-fill" style={{ width: `${(total / maxIncomeCat) * 100}%`, background: INCOME_COLORS[i % INCOME_COLORS.length] }} />
                </div>
                <span className="cat-pct">{totalIncome > 0 ? Math.round((total / totalIncome) * 100) : 0}%</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* 파트별 잔고 현황 */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <span className="card-title" style={{ margin: 0 }}>파트별 잔고 현황</span>
          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600 }}>총 잔액</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: netBalance >= 0 ? '#0f172a' : 'var(--red-500)' }}>
              {netBalance < 0 ? '-' : ''}{formatKRW(Math.abs(netBalance))}
            </span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {['VOIX · SESSION', 'DANCE', '공통'].map(p => {
            const val = p === 'VOIX · SESSION' ? (partBal['VOIX'] || 0) + (partBal['SESSION'] || 0) : (partBal[p] || 0);
            return (
              <div key={p} style={{ padding: '10px 4px', borderRadius: 10, background: 'var(--slate-50)', border: '1px solid var(--slate-100)', textAlign: 'center', minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--slate-500)', marginBottom: 2, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{p}</div>
                <div style={{ fontSize: 'clamp(12px, 3.5vw, 15px)', fontWeight: 700, color: val < 0 ? 'var(--red-500)' : (PART_COLORS[p] || '#3b82f6'), whiteSpace: 'nowrap', letterSpacing: '-0.5px' }}>
                  {val < 0 ? '-' : ''}{formatKRW(Math.abs(val))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 이번 달 회비 납부율 */}
      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="card-title" style={{ margin: 0 }}>이번 달 회비 납부율</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: duesRate >= 80 ? '#059669' : duesRate >= 50 ? '#f59e0b' : 'var(--red-500)' }}>
            {duesRate}%
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 99, background: 'var(--slate-100)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${duesRate}%`, borderRadius: 99, background: duesRate >= 80 ? '#059669' : duesRate >= 50 ? '#f59e0b' : 'var(--red-500)', transition: 'width 0.6s ease' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 6 }}>
          활성 {activeMembers.length}명 중 {paidThisMonth.length}명 납부 완료
        </div>
      </div>

    </div>
  );
}
