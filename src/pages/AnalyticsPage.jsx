import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { calcMonthlyStats, calcPartBalances, calcMemberDues, formatKRW, isRefundTx } from '../utils/calculations';
import './Pages.css';



const PART_COLORS = {
  VOIX: '#2b74e2', DANCE: '#e2596b', SESSION: '#7c3aed', 공통: '#059669',
};

export default function AnalyticsPage() {
  const { state } = useApp();
  const { transactions, members } = state;
  const [period, setPeriod] = useState('all');

  const availableYears = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    transactions.forEach(t => {
      if (t.datetime) years.add(parseInt(t.datetime.slice(0, 4), 10));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  // 기간 필터
  const filteredTxs = useMemo(() => {
    return transactions.filter(tx => {
      if (period === 'all') return true;
      const d = new Date(tx.datetime);
      return d.getFullYear() === Number(period);
    });
  }, [transactions, period]);

  const txMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => map[t.id] = t);
    return map;
  }, [transactions]);

  let totalIncome = 0;
  let totalExpense = 0;
  filteredTxs.forEach(tx => {
    const isRefund = isRefundTx(tx, txMap);
    if (tx.type === 'income') {
      if (isRefund) totalExpense -= tx.amount;
      else totalIncome += tx.amount;
    } else {
      if (isRefund) totalIncome -= tx.amount;
      else totalExpense += tx.amount;
    }
  });

  const netBalance = totalIncome - totalExpense;

  // 월별 통계 (기간에 맞게 표시)
  const monthly = useMemo(() => {
    const stats = calcMonthlyStats(filteredTxs);
    if (period === 'all') return stats.slice(-12); // 전체면 최근 12개월만 보여줌 (너무 길면 깨짐)
    return stats; // 특정 연도면 그 연도 전체
  }, [filteredTxs, period]);

  const maxIncome = Math.max(...monthly.map(m => m.income), 1);
  const maxExpense = Math.max(...monthly.map(m => m.expense), 1);

  // 누적 잔액 추세 (월별)
  const balanceTrend = useMemo(() => {
    const allMonthly = calcMonthlyStats(transactions);
    let running = 0;
    const allTrend = allMonthly.map(m => {
      running += m.income - m.expense;
      return { month: m.month, balance: running };
    });
    
    if (period === 'all') return allTrend.slice(-12);
    return allTrend.filter(t => t.month.startsWith(String(period)));
  }, [transactions, period]);
  const maxBalance = Math.max(...balanceTrend.map(b => Math.abs(b.balance)), 1);



  // 지출 계정과목별 — 실제 거래 데이터에서 동적 집계
  const expenseByCategory = useMemo(() => {
    const map = {};
    filteredTxs.forEach(t => {
      const isRefund = isRefundTx(t, txMap);
      const isExpense = t.type === 'expense' && !isRefund;
      const isReturn = t.type === 'income' && isRefund;
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
  }, [filteredTxs, txMap]);
  const maxCat = Math.max(...expenseByCategory.map(e => e.total), 1);

  // 수입 카테고리별 — 동적 집계
  const incomeByCategory = useMemo(() => {
    const map = {};
    filteredTxs.forEach(t => {
      const isRefund = isRefundTx(t, txMap);
      const isIncome = t.type === 'income' && !isRefund;
      const isRecovery = t.type === 'expense' && isRefund;
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
  }, [filteredTxs, txMap]);
  const maxIncomeCat = Math.max(...incomeByCategory.map(e => e.total), 1);


  const INCOME_COLORS = ['#059669', '#2b74e2', '#f59e0b', '#7c3aed', '#e2596b'];
  const EXPENSE_COLORS = ['#e2596b', '#f97316', '#f59e0b', '#8b5cf6', '#6b7280'];

  return (
    <div className="page fade-in">

      {/* 기간 필터 */}
      <div className="segmented-control" style={{ marginBottom: 20, width: 'max-content', maxWidth: '100%', overflowX: 'auto' }}>
        <button className={`segment-btn ${period === 'all' ? 'active' : ''}`} onClick={() => setPeriod('all')}>전체</button>
        {availableYears.map(y => (
          <button key={y} className={`segment-btn ${period === String(y) ? 'active' : ''}`} onClick={() => setPeriod(String(y))}>
            {y}년
          </button>
        ))}
      </div>

      {/* 요약 카드 3개 */}
      <div className="analytics-summary-grid">
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--slate-500)', marginBottom: 4, fontWeight: 600 }}>총 수입</div>
          <div className="text-green" style={{ fontSize: 20, fontWeight: 800 }}>+{formatKRW(totalIncome)}</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--slate-500)', marginBottom: 4, fontWeight: 600 }}>총 지출</div>
          <div className="text-red" style={{ fontSize: 20, fontWeight: 800 }}>-{formatKRW(totalExpense)}</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--slate-500)', marginBottom: 4, fontWeight: 600 }}>순잔액</div>
          <div className={netBalance >= 0 ? '' : 'text-red'} style={{ fontSize: 20, fontWeight: 800 }}>
            {netBalance >= 0 ? '+' : ''}{formatKRW(netBalance)}
          </div>
        </div>
      </div>

      {/* 지출 계정과목 + 수입 카테고리 나란히 */}
      <div className="dash-grid-2" style={{ gap: 16, marginBottom: 16 }}>
        <div className="card card-pad">
          <span className="card-title">지출 구성</span>
          {expenseByCategory.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 16, fontSize: 13 }}>지출 내역 없음</div>
            : expenseByCategory.map(({ cat, total }, i) => (
              <div key={cat} className="cat-row">
                <div className="cat-row-top">
                  <span className="cat-name" style={{ fontSize: 12 }}>{cat}</span>
                  <span className="text-red" style={{ fontWeight: 600, fontSize: 12 }}>{formatKRW(total)}</span>
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
          <span className="card-title">수입 구성</span>
          {incomeByCategory.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 16, fontSize: 13 }}>수입 내역 없음</div>
            : incomeByCategory.map(({ cat, total }, i) => (
              <div key={cat} className="cat-row">
                <div className="cat-row-top">
                  <span className="cat-name" style={{ fontSize: 12 }}>{cat}</span>
                  <span className="text-green" style={{ fontWeight: 600, fontSize: 12 }}>{formatKRW(total)}</span>
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


    </div>
  );
}
