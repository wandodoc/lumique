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
  const [partFilter, setPartFilter] = useState('전체');

  const availableYears = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    transactions.forEach(t => {
      if (t.datetime) years.add(parseInt(t.datetime.slice(0, 4), 10));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  // 기간 및 파트 필터
  const filteredTxs = useMemo(() => {
    return transactions.filter(tx => {
      if (period !== 'all') {
        const d = new Date(tx.datetime);
        if (d.getFullYear() !== Number(period)) return false;
      }
      
      if (partFilter !== '전체') {
        if (partFilter === 'VOIX · SESSION') {
          if (tx.part !== 'VOIX' && tx.part !== 'SESSION') return false;
        } else {
          if (tx.part !== partFilter) return false;
        }
      }
      
      return true;
    });
  }, [transactions, period, partFilter]);

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

  // 계정과목별 파트 비중 계산 (현재 기간(period) 기준, partFilter 무시)
  const periodTxs = useMemo(() => {
    return transactions.filter(tx => {
      if (period === 'all') return true;
      return new Date(tx.datetime).getFullYear() === Number(period);
    });
  }, [transactions, period]);

  const partBreakdown = useMemo(() => {
    const map = { income: {}, expense: {} };
    periodTxs.forEach(t => {
      const isRefund = isRefundTx(t, txMap);
      const isIncome = t.type === 'income' && !isRefund;
      const isRecovery = t.type === 'expense' && isRefund;
      const isExpense = t.type === 'expense' && !isRefund;
      const isReturn = t.type === 'income' && isRefund;
      
      let type = null;
      if (isIncome || isRecovery) type = 'income';
      if (isExpense || isReturn) type = 'expense';
      if (!type) return;
      
      const multiplier = (isRecovery || isReturn) ? -1 : 1;
      const partKey = (t.part === 'VOIX' || t.part === 'SESSION') ? 'VOIX·SESSION' : (t.part || '공통');
      
      if (t.splitItems && t.splitItems.length > 0) {
        t.splitItems.forEach(item => {
          const cat = item.category || '기타';
          if (!map[type][cat]) map[type][cat] = { 'VOIX·SESSION': 0, 'DANCE': 0, '공통': 0, total: 0 };
          const amt = (Number(item.amount) || 0) * multiplier;
          map[type][cat][partKey] += amt;
          map[type][cat].total += amt;
        });
      } else {
        const cat = t.category || '기타';
        if (!map[type][cat]) map[type][cat] = { 'VOIX·SESSION': 0, 'DANCE': 0, '공통': 0, total: 0 };
        const amt = t.amount * multiplier;
        map[type][cat][partKey] += amt;
        map[type][cat].total += amt;
      }
    });

    const formatData = (typeMap) => Object.entries(typeMap)
      .map(([cat, data]) => ({ cat, ...data }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);

    return {
      income: formatData(map.income),
      expense: formatData(map.expense)
    };
  }, [periodTxs, txMap]);

  const renderMatrixTable = (data, isIncome) => {
    if (data.length === 0) return <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 20, fontSize: 13 }}>내역 없음</div>;
    
    // 합계 계산
    const gTotal = data.reduce((acc, curr) => {
      acc['VOIX·SESSION'] += curr['VOIX·SESSION'] || 0;
      acc['DANCE'] += curr['DANCE'] || 0;
      acc['공통'] += curr['공통'] || 0;
      acc.total += curr.total || 0;
      return acc;
    }, { 'VOIX·SESSION': 0, 'DANCE': 0, '공통': 0, total: 0 });

    const totalColor = isIncome ? 'var(--emerald-600)' : 'var(--rose-600)';
    const totalBg = isIncome ? 'var(--emerald-50)' : 'var(--rose-50)';
    const totalBorder = isIncome ? '#a7f3d0' : '#fecdd3';
    const totalLabelColor = isIncome ? 'var(--emerald-800)' : 'var(--rose-800)';

    return (
      <>
        {/* PC: Matrix Table */}
        <div className="md-pc-view" style={{ overflowX: 'auto', marginBottom: 24, border: '1px solid var(--slate-100)', borderRadius: 8, display: 'block' }}>
          <table className="matrix-table">
            <thead>
              <tr>
                <th style={{ minWidth: 120 }}>계정과목</th>
                <th>VOIX·SESSION</th>
                <th>DANCE</th>
                <th>공통</th>
                <th style={{ color: 'var(--slate-800)', fontWeight: 700 }}>총액</th>
              </tr>
            </thead>
            <tbody>
              {data.map(item => (
                <tr key={item.cat}>
                  <td style={{ fontWeight: 600, color: 'var(--slate-700)' }}>{item.cat}</td>
                  <td style={{ color: item['VOIX·SESSION'] ? 'var(--slate-700)' : 'var(--slate-300)' }}>{item['VOIX·SESSION'] ? formatKRW(item['VOIX·SESSION']) : '-'}</td>
                  <td style={{ color: item['DANCE'] ? 'var(--slate-700)' : 'var(--slate-300)' }}>{item['DANCE'] ? formatKRW(item['DANCE']) : '-'}</td>
                  <td style={{ color: item['공통'] ? 'var(--slate-700)' : 'var(--slate-300)' }}>{item['공통'] ? formatKRW(item['공통']) : '-'}</td>
                  <td style={{ fontWeight: 700, color: totalColor }}>{formatKRW(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: totalBg, borderTop: `2px solid ${totalBorder}` }}>
                <td style={{ fontWeight: 800, color: totalLabelColor }}>총계</td>
                <td style={{ fontWeight: 800, color: totalLabelColor }}>{formatKRW(gTotal['VOIX·SESSION'])}</td>
                <td style={{ fontWeight: 800, color: totalLabelColor }}>{formatKRW(gTotal['DANCE'])}</td>
                <td style={{ fontWeight: 800, color: totalLabelColor }}>{formatKRW(gTotal['공통'])}</td>
                <td style={{ fontWeight: 800, color: totalColor }}>{formatKRW(gTotal.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile: Card List */}
        <div className="md-mobile-view" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.map(item => (
              <div key={item.cat} style={{ background: 'var(--white)', padding: 16, borderRadius: 12, border: '1px solid var(--slate-200)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid var(--slate-100)', paddingBottom: 10 }}>
                  <span style={{ fontWeight: 800, color: 'var(--slate-800)', fontSize: 16 }}>{item.cat}</span>
                  <span style={{ fontWeight: 800, color: totalColor, fontSize: 16 }}>{formatKRW(item.total)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  {['VOIX·SESSION', 'DANCE', '공통'].map(p => (
                    item[p] > 0 && (
                      <div key={p} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--slate-500)', fontWeight: 500 }}>{p}</span>
                        <span style={{ fontWeight: 700, color: 'var(--slate-700)' }}>{formatKRW(item[p])}</span>
                      </div>
                    )
                  ))}
                  {item.total === 0 && <div style={{ color: 'var(--slate-400)' }}>-</div>}
                </div>
              </div>
            ))}
            {/* Mobile Grand Total */}
            <div style={{ background: totalBg, padding: 16, borderRadius: 12, border: `1px solid ${totalBorder}`, marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, borderBottom: `1px solid ${totalBorder}`, paddingBottom: 10 }}>
                <span style={{ fontWeight: 800, color: totalLabelColor, fontSize: 16 }}>총 합계</span>
                <span style={{ fontWeight: 800, color: totalColor, fontSize: 16 }}>{formatKRW(gTotal.total)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                {['VOIX·SESSION', 'DANCE', '공통'].map(p => (
                  <div key={p} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: totalLabelColor, opacity: 0.8, fontWeight: 600 }}>{p}</span>
                    <span style={{ fontWeight: 700, color: totalLabelColor }}>{formatKRW(gTotal[p])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  const INCOME_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
  const EXPENSE_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

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

  const periodPartBal = useMemo(() => {
    const bal = { 'VOIX·SESSION': 0, 'DANCE': 0, '공통': 0 };
    partBreakdown.income.forEach(item => {
      bal['VOIX·SESSION'] += item['VOIX·SESSION'] || 0;
      bal['DANCE'] += item['DANCE'] || 0;
      bal['공통'] += item['공통'] || 0;
    });
    partBreakdown.expense.forEach(item => {
      bal['VOIX·SESSION'] -= item['VOIX·SESSION'] || 0;
      bal['DANCE'] -= item['DANCE'] || 0;
      bal['공통'] -= item['공통'] || 0;
    });
    return bal;
  }, [partBreakdown]);

  return (
    <div className="page fade-in">

      {/* 필터 영역 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select 
          className="filter-select" 
          value={period} 
          onChange={e => setPeriod(e.target.value)}
          style={{ width: '120px' }}
        >
          <option value="all">전체 연도</option>
          {availableYears.map(y => (
            <option key={y} value={String(y)}>{y}년</option>
          ))}
        </select>

        <div className="filter-row" style={{ margin: 0, flexWrap: 'wrap' }}>
          {['전체', 'VOIX · SESSION', 'DANCE', '공통'].map(p => (
            <button 
              key={p} 
              className={`filter-chip ${partFilter === p ? 'active' : ''}`} 
              onClick={() => setPartFilter(p)}
            >
              {p === '전체' ? '모든 파트' : p}
            </button>
          ))}
        </div>
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

      {/* 계정과목별 파트 비중 대시보드 */}
      <div className="card card-pad" style={{ marginTop: 24, marginBottom: 40 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span className="card-title" style={{ margin: 0, display: 'block', marginBottom: 4 }}>계정과목별 파트 상세 내역</span>
              <span style={{ fontSize: 13, color: 'var(--slate-500)', fontWeight: 600 }}>{period === 'all' ? '전체 기간' : `${period}년`} 파트별 누적 잔액</span>
            </div>
            <div style={{ display: 'flex', gap: 40, background: 'var(--slate-50)', padding: '16px 32px', borderRadius: 12, border: '1px solid var(--slate-100)' }}>
              {['VOIX·SESSION', 'DANCE', '공통'].map(p => (
                <div key={p} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 700, marginBottom: 6 }}>{p}</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: periodPartBal[p] < 0 ? 'var(--rose-600)' : 'var(--slate-800)' }}>
                    {formatKRW(periodPartBal[p])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid var(--emerald-200)' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--emerald-700)' }}>수입 부문</span>
        </div>
        {renderMatrixTable(partBreakdown.income, true)}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 32, marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid var(--rose-200)' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--rose-700)' }}>지출 부문</span>
        </div>
        {renderMatrixTable(partBreakdown.expense, false)}
      </div>

    </div>
  );
}
