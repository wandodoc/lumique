import { useApp } from '../context/AppContext';
import { calcPartBalances, calcMonthlyStats, calcMemberDues, formatKRW } from '../utils/calculations';
import './Pages.css';

const PART_CONFIGS = {
  VOIX:    { label: 'VOIX',    colorClass: 'voix' },
  DANCE:   { label: 'DANCE',   colorClass: 'dance' },
  SESSION: { label: 'SESSION', colorClass: 'session' },
  공통:    { label: '공통',    colorClass: 'common' },
};

const CATEGORY_ICONS = {
  '회비': '💰', '공연수익': '🎭', '이자/기타': '📈',
  '연습실대여': '🎵', '비품': '🛒', '소모품': '📦',
  '식대': '🍽️', '사례비': '🤝', '주차비': '🚗',
};

export default function DashboardPage({ onAddClick }) {
  const { state } = useApp();
  const { transactions, members } = state;
  if (state.loading) return <div className="page-loading">불러오는 중…</div>;

  const totalBalance = transactions.reduce(
    (s, tx) => tx.type === 'income' ? s + tx.amount : s - tx.amount, 0
  );
  const partBal = calcPartBalances(transactions);
  const monthly = calcMonthlyStats(transactions);
  const thisMonth = monthly[monthly.length - 1] || { income: 0, expense: 0, month: '-' };
  const unpaidCount = members.filter(m =>
    m.status === 'active' && calcMemberDues(m, transactions).diff < 0
  ).length;
  const recentTxs = [...transactions]
    .sort((a, b) => b.datetime.localeCompare(a.datetime))
    .slice(0, 6);

  return (
    <div className="page fade-in">
      {/* 총 잔액 히어로 */}
      <div className="hero-card">
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
        <h2 className="hero-amount" style={{ color: totalBalance < 0 ? 'var(--red-500)' : 'inherit' }}>
          {totalBalance < 0 ? '-' : ''}{formatKRW(Math.abs(totalBalance))}
        </h2>
        <p className="hero-sub">토스뱅크 1001-7629-3105</p>
      </div>

      {/* 파트별 잔액 */}
      <div className="pc-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {['VOIX', 'DANCE', '공통'].map(p => {
          const val = partBal[p] || 0;
          const cfg = PART_CONFIGS[p];
          return (
            <div key={p} className={`part-card part-card--${cfg.colorClass}`}>
              <span className="part-card-label">{cfg.label}</span>
              <span className="part-card-amount" style={{ color: val < 0 ? 'var(--red-500)' : undefined }}>
                {val < 0 ? '-' : ''}{formatKRW(Math.abs(val))}
              </span>
            </div>
          );
        })}
      </div>

      {/* 이달 요약 */}
      <div className="card card-pad">
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <span className="card-title" style={{ margin: 0 }}>이번 달 요약</span>
          <span className="badge badge-gray">{thisMonth.month}</span>
        </div>
        <div className="month-summary">
          <div className="month-col">
            <span>수입</span>
            <strong className="text-green">+{formatKRW(thisMonth.income)}</strong>
          </div>
          <div className="month-divider" />
          <div className="month-col">
            <span>지출</span>
            <strong className="text-red">-{formatKRW(thisMonth.expense)}</strong>
          </div>
          <div className="month-divider" />
          <div className="month-col">
            <span>잔액</span>
            <strong style={{ color: thisMonth.income - thisMonth.expense >= 0 ? 'var(--blue-500)' : 'var(--red-500)' }}>
              {thisMonth.income - thisMonth.expense >= 0 ? '+' : '-'}{formatKRW(thisMonth.income - thisMonth.expense)}
            </strong>
          </div>
        </div>
      </div>

      {/* 미납 배너 */}
      {unpaidCount > 0 && (
        <div className="alert-banner">
          <span className="alert-icon">⚠️</span>
          <span>미납 회원 <strong>{unpaidCount}명</strong></span>
          <span className="alert-hint">회원 납부 탭에서 확인 →</span>
        </div>
      )}

      {/* 최근 거래 타임라인 */}
      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <span className="card-title">최근 거래</span>
        </div>
        {recentTxs.map((tx, i) => (
          <div key={tx.id} className="timeline-row">
            <div className="timeline-icon">{CATEGORY_ICONS[tx.category] || '📌'}</div>
            <div className="timeline-body">
              <div className="timeline-desc">{tx.description}</div>
              <div className="timeline-meta">{tx.datetime.slice(0, 10)} · {tx.category}</div>
            </div>
            <span className={`timeline-amount ${tx.type}`}>
              {tx.type === 'income' ? '+' : '-'}{formatKRW(tx.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
