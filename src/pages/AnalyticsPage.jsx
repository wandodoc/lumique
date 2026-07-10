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


  const INCOME_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
  const EXPENSE_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  // 매트릭스 테이블(교차 집계) 계산
  const pivotData = useMemo(() => {
    const incMap = {};
    const expMap = {};
    
    incomeByCategory.forEach(c => {
      incMap[c.cat] = { 'VOIX·SESSION': 0, 'DANCE': 0, '공통': 0, total: 0 };
    });
    expenseByCategory.forEach(c => {
      expMap[c.cat] = { 'VOIX·SESSION': 0, 'DANCE': 0, '공통': 0, total: 0 };
    });
    
    filteredTxs.forEach(t => {
      const isRefund = isRefundTx(t, txMap);
      const isInc = (t.type === 'income' && !isRefund) || (t.type === 'expense' && isRefund);
      const isExp = (t.type === 'expense' && !isRefund) || (t.type === 'income' && isRefund);
      
      const multiplier = isRefund ? -1 : 1;
      
      const processItem = (cat, amt, part) => {
        const pGroup = (part === 'VOIX' || part === 'SESSION') ? 'VOIX·SESSION' : (part === 'DANCE' ? 'DANCE' : '공통');
        if (isInc && incMap[cat]) {
          incMap[cat][pGroup] += amt * multiplier;
          incMap[cat].total += amt * multiplier;
        } else if (isExp && expMap[cat]) {
          expMap[cat][pGroup] += amt * multiplier;
          expMap[cat].total += amt * multiplier;
        }
      };

      if (t.splitItems && t.splitItems.length > 0) {
        t.splitItems.forEach(item => {
          processItem(item.category || '기타', Number(item.amount) || 0, item.part || t.part);
        });
      } else {
        processItem(t.category || '기타', t.amount, t.part);
      }
    });
    
    const incTotals = { 'VOIX·SESSION': 0, 'DANCE': 0, '공통': 0, total: 0 };
    const expTotals = { 'VOIX·SESSION': 0, 'DANCE': 0, '공통': 0, total: 0 };
    
    Object.values(incMap).forEach(row => {
      incTotals['VOIX·SESSION'] += row['VOIX·SESSION'];
      incTotals['DANCE'] += row['DANCE'];
      incTotals['공통'] += row['공통'];
      incTotals.total += row.total;
    });
    Object.values(expMap).forEach(row => {
      expTotals['VOIX·SESSION'] += row['VOIX·SESSION'];
      expTotals['DANCE'] += row['DANCE'];
      expTotals['공통'] += row['공통'];
      expTotals.total += row.total;
    });
    
    const netTotals = {
      'VOIX·SESSION': incTotals['VOIX·SESSION'] - expTotals['VOIX·SESSION'],
      'DANCE': incTotals['DANCE'] - expTotals['DANCE'],
      '공통': incTotals['공통'] - expTotals['공통'],
      total: incTotals.total - expTotals.total
    };
    
    return { incMap, expMap, incTotals, expTotals, netTotals };
  }, [filteredTxs, txMap, incomeByCategory, expenseByCategory]);

  let incPct = 0;
  const incGradArgs = incomeByCategory.map((item, i) => {
    const pct = totalIncome > 0 ? (item.total / totalIncome) * 100 : 0;
    const color = INCOME_COLORS[i % INCOME_COLORS.length];
    const str = `${color} ${incPct}% ${incPct + pct}%`;
    incPct += pct;
    return str;
  }).join(', ');
  const incGradient = incGradArgs ? `conic-gradient(${incGradArgs})` : 'var(--slate-100)';

  let expPct = 0;
  const expGradArgs = expenseByCategory.map((item, i) => {
    const pct = totalExpense > 0 ? (item.total / totalExpense) * 100 : 0;
    const color = EXPENSE_COLORS[i % EXPENSE_COLORS.length];
    const str = `${color} ${expPct}% ${expPct + pct}%`;
    expPct += pct;
    return str;
  }).join(', ');
  const expGradient = expGradArgs ? `conic-gradient(${expGradArgs})` : 'var(--slate-100)';

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
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="card-title" style={{ display: 'block', marginBottom: 16 }}>수입 구성</span>
          {incomeByCategory.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 16, fontSize: 13, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>수입 내역 없음</div>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <div className="donut-chart" style={{ width: 100, height: 100, flexShrink: 0, background: incGradient }}>
                  <div style={{ position: 'absolute', width: 70, height: 70, background: 'var(--c-white)', borderRadius: '50%' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
                  {incomeByCategory.map(({ cat, total }, i) => {
                    const pct = totalIncome > 0 ? Math.round((total / totalIncome) * 100) : 0;
                    const color = INCOME_COLORS[i % INCOME_COLORS.length];
                    return (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 14, color: 'var(--slate-700)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, width: 36, textAlign: 'right' }}>{pct}%</span>
                          <span className="text-green" style={{ fontSize: 14, fontWeight: 800, width: 85, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatKRW(total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          }
        </div>

        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="card-title" style={{ display: 'block', marginBottom: 16 }}>지출 구성</span>
          {expenseByCategory.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 16, fontSize: 13, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>지출 내역 없음</div>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <div className="donut-chart" style={{ width: 100, height: 100, flexShrink: 0, background: expGradient }}>
                  <div style={{ position: 'absolute', width: 70, height: 70, background: 'var(--c-white)', borderRadius: '50%' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
                  {expenseByCategory.map(({ cat, total }, i) => {
                    const pct = totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0;
                    const color = EXPENSE_COLORS[i % EXPENSE_COLORS.length];
                    return (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 14, color: 'var(--slate-700)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, width: 36, textAlign: 'right' }}>{pct}%</span>
                          <span className="text-red" style={{ fontSize: 14, fontWeight: 800, width: 85, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatKRW(total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          }
        </div>
      </div>

      {/* 수익 및 지출 내역 교차표 */}
      <div className="card card-pad">
        <span className="card-title" style={{ display: 'block', marginBottom: 16 }}>수익 및 지출 내역 (파트별 상세)</span>
        <div className="pivot-table-container">
          <table className="pivot-table">
            <thead>
              <tr>
                <th>구분</th>
                <th>VOIX·SESSION</th>
                <th>DANCE</th>
                <th>공통</th>
                <th>총 합계</th>
              </tr>
            </thead>
            <tbody>
              {/* 수입 섹션 */}
              {incomeByCategory.map(c => {
                const row = pivotData.incMap[c.cat];
                return (
                  <tr key={`inc-${c.cat}`}>
                    <td>{c.cat}</td>
                    <td>{row['VOIX·SESSION'] === 0 ? '-' : formatKRW(row['VOIX·SESSION'])}</td>
                    <td>{row['DANCE'] === 0 ? '-' : formatKRW(row['DANCE'])}</td>
                    <td>{row['공통'] === 0 ? '-' : formatKRW(row['공통'])}</td>
                    <td className="text-green">{formatKRW(row.total)}</td>
                  </tr>
                );
              })}
              <tr className="summary-row inc-summary">
                <td>수입 계</td>
                <td>{formatKRW(pivotData.incTotals['VOIX·SESSION'])}</td>
                <td>{formatKRW(pivotData.incTotals['DANCE'])}</td>
                <td>{formatKRW(pivotData.incTotals['공통'])}</td>
                <td className="text-green">{formatKRW(pivotData.incTotals.total)}</td>
              </tr>
              
              {/* 지출 섹션 */}
              {expenseByCategory.map(c => {
                const row = pivotData.expMap[c.cat];
                return (
                  <tr key={`exp-${c.cat}`}>
                    <td>{c.cat}</td>
                    <td className={row['VOIX·SESSION'] > 0 ? 'text-red' : ''}>{row['VOIX·SESSION'] === 0 ? '-' : `-${formatKRW(row['VOIX·SESSION'])}`}</td>
                    <td className={row['DANCE'] > 0 ? 'text-red' : ''}>{row['DANCE'] === 0 ? '-' : `-${formatKRW(row['DANCE'])}`}</td>
                    <td className={row['공통'] > 0 ? 'text-red' : ''}>{row['공통'] === 0 ? '-' : `-${formatKRW(row['공통'])}`}</td>
                    <td className="text-red">-{formatKRW(row.total)}</td>
                  </tr>
                );
              })}
              <tr className="summary-row exp-summary">
                <td>지출 계</td>
                <td className="text-red">-{formatKRW(pivotData.expTotals['VOIX·SESSION'])}</td>
                <td className="text-red">-{formatKRW(pivotData.expTotals['DANCE'])}</td>
                <td className="text-red">-{formatKRW(pivotData.expTotals['공통'])}</td>
                <td className="text-red">-{formatKRW(pivotData.expTotals.total)}</td>
              </tr>
              
              {/* 잔액 */}
              <tr className="summary-row net-summary">
                <td>잔액</td>
                <td className={pivotData.netTotals['VOIX·SESSION'] < 0 ? 'text-red' : 'text-blue'}>{formatKRW(pivotData.netTotals['VOIX·SESSION'])}</td>
                <td className={pivotData.netTotals['DANCE'] < 0 ? 'text-red' : 'text-blue'}>{formatKRW(pivotData.netTotals['DANCE'])}</td>
                <td className={pivotData.netTotals['공통'] < 0 ? 'text-red' : 'text-blue'}>{formatKRW(pivotData.netTotals['공통'])}</td>
                <td style={{ fontSize: 15, color: pivotData.netTotals.total < 0 ? 'var(--rose-600)' : 'var(--blue-600)' }}>
                  {formatKRW(pivotData.netTotals.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
