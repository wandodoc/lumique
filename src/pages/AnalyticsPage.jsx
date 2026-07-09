import { useApp } from '../context/AppContext';
import { calcMonthlyStats, calcPartBalances, formatKRW } from '../utils/calculations';
import { EXPENSE_CATEGORIES } from '../data/constants';
import './Pages.css';

export default function AnalyticsPage() {
  const { state } = useApp();
  const { transactions } = state;

  const monthly = calcMonthlyStats(transactions).slice(-7);
  const partBal = calcPartBalances(transactions);
  const maxIncome = Math.max(...monthly.map(m => m.income), 1);
  const maxExpense = Math.max(...monthly.map(m => m.expense), 1);

  const expenseByCategory = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: transactions.filter(tx => tx.category === cat && tx.type === 'expense')
      .reduce((s, tx) => s + tx.amount, 0),
  })).filter(e => e.total > 0).sort((a, b) => b.total - a.total);

  const maxCat = Math.max(...expenseByCategory.map(e => e.total), 1);
  const totalExpense = expenseByCategory.reduce((s, e) => s + e.total, 0);

  const PART_COLORS = {
    VOIX: 'var(--voix-color)', DANCE: 'var(--dance-color)',
    SESSION: 'var(--session-color)', 공통: 'var(--common-color)',
  };

  return (
    <div className="page fade-in">
      {/* 월별 수입/지출 바 차트 */}
      <div className="card card-pad">
        <span className="card-title">월별 수입 / 지출</span>
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
      </div>

      {/* 파트별 잔액 */}
      <div className="card card-pad">
        <span className="card-title">파트별 잔액</span>
        {['VOIX', 'DANCE', 'SESSION', '공통'].map(p => {
          const val = partBal[p] || 0;
          return (
            <div key={p} className="cat-row">
              <div className="cat-row-top">
                <span className="cat-name">{p}</span>
                <span style={{ color: val < 0 ? 'var(--red-500)' : PART_COLORS[p], fontWeight: 600 }}>
                  {val < 0 ? '-' : ''}{formatKRW(Math.abs(val))}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 계정과목별 지출 */}
      <div className="card card-pad">
        <span className="card-title">계정과목별 지출</span>
        {expenseByCategory.map(({ cat, total }) => (
          <div key={cat} className="cat-row">
            <div className="cat-row-top">
              <span className="cat-name">{cat}</span>
              <span style={{ fontWeight: 600 }}>{formatKRW(total)}</span>
            </div>
            <div className="cat-bar-track">
              <div className="cat-bar-fill" style={{ width: `${(total / maxCat) * 100}%` }} />
            </div>
            <span className="cat-pct">{totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
