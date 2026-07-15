import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import './PageStyles.css';

const LS_ORDERS = 'lumique_ticket_orders';
const DEPOSIT_WAIT = '입금대기';
const DEPOSIT_DONE = '입금완료';
const ATTEND_WAIT = '미입장';
const ATTEND_DONE = '입장완료';

const loadLS = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLS = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const downloadCsv = (filename, rows) => {
  const csv = '\uFEFF' + rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

function StatCard({ label, value, color = 'var(--slate-900)' }) {
  return (
    <div className="card card-pad" style={{ display: 'grid', gap: 6, background: '#fff', border: '1px solid var(--slate-100)' }}>
      <div className="caption" style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 950, color }}>{value}</div>
    </div>
  );
}

export default function ReservationManagementPage() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState(() => loadLS(LS_ORDERS));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    document.title = '🎟️ 티켓 신청 및 입장 관리';
  }, []);

  useEffect(() => {
    saveLS(LS_ORDERS, orders);
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesSearch = !q || 
        String(order.audienceName || '').toLowerCase().includes(q) || 
        String(order.phone || '').includes(q);
      
      const matchesFilter =
        filter === 'all' ||
        (filter === 'deposit-wait' && order.depositStatus !== DEPOSIT_DONE) ||
        (filter === 'attend-wait' && order.attendanceStatus !== ATTEND_DONE);
      
      return matchesSearch && matchesFilter;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, query, filter]);

  const totals = useMemo(() => {
    return {
      total: orders.length,
      paid: orders.filter((o) => o.depositStatus === DEPOSIT_DONE).length,
      entered: orders.filter((o) => o.attendanceStatus === ATTEND_DONE).length,
    };
  }, [orders]);

  const exportCsv = () => {
    const headers = ['예매자명', '신청 매수', '입금 확인', '뒤풀이 참여 여부', '뒤풀이 참여자 수', '입장 처리', '신청 시간'];
    const rows = [
      headers,
      ...visibleOrders.map((o) => [
        o.audienceName || '',
        o.ticketCount || 0,
        o.depositStatus === DEPOSIT_DONE ? '입금 완료' : '입금 대기',
        o.isAfterParty ? '참여' : '미참여',
        o.isAfterParty ? o.afterPartyCount || 1 : 0,
        o.attendanceStatus === ATTEND_DONE ? '입장 완료' : '미입장',
        o.createdAt ? new Date(o.createdAt).toLocaleString('ko-KR') : '',
      ]),
    ];
    downloadCsv(`lumique_reservations_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const updateOrder = (id, patch) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const toggleDeposit = (order) => {
    if (!isAdmin) return;
    const isDone = order.depositStatus === DEPOSIT_DONE;
    updateOrder(order.id, { depositStatus: isDone ? DEPOSIT_WAIT : DEPOSIT_DONE });
  };

  const toggleAttendance = (order) => {
    if (!isAdmin) return;
    const isDone = order.attendanceStatus === ATTEND_DONE;
    updateOrder(order.id, { attendanceStatus: isDone ? ATTEND_WAIT : ATTEND_DONE });
  };

  return (
    <div className="page-shell" style={{ background: '#f8fafc', minHeight: '100dvh' }}>
      <div className="page-container" style={{ display: 'grid', gap: 20, padding: '32px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.5px' }}>🎟️ 티켓 신청 및 입장 관리</h1>
            <p className="caption" style={{ margin: '6px 0 0', fontWeight: 500 }}>입금 확인과 현장 입장 상태를 한 화면에서 관리합니다.</p>
          </div>
          <button type="button" className="btn-secondary" style={{ height: 44, padding: '0 20px', borderRadius: 12, fontWeight: 700 }} onClick={() => window.location.assign('/')}>
            대시보드로 돌아가기
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <StatCard label="총 신청" value={`${totals.total}명`} />
          <StatCard label="입금 완료" value={`${totals.paid}명`} color="var(--emerald-600)" />
          <StatCard label="현장 입장" value={`${totals.entered}명`} color="var(--blue-600)" />
        </div>

        <div className="card card-pad" style={{ display: 'grid', gap: 18, borderRadius: 20, border: '1px solid var(--slate-100)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 16 }}>🔎</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예매자명 또는 연락처 검색"
                className="search-input"
                style={{ width: '100%', paddingLeft: 42, height: 48, boxSizing: 'border-box', borderRadius: 14, fontSize: 15 }}
              />
            </div>
            <button type="button" className="btn-secondary" style={{ height: 48, padding: '0 18px', borderRadius: 14, fontWeight: 700 }} onClick={exportCsv}>CSV 내보내기</button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              ['전체 보기', 'all'],
              ['입금대기자만 보기', 'deposit-wait'],
              ['미입장자만 보기', 'attend-wait'],
            ].map(([label, value]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                style={{
                  height: 38,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: '1.5px solid',
                  borderColor: filter === value ? '#111827' : 'var(--slate-200)',
                  background: filter === value ? '#111827' : '#fff',
                  color: filter === value ? '#fff' : 'var(--slate-700)',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {visibleOrders.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 15, fontWeight: 500 }}>표시할 예매 정보가 없습니다.</div>
          ) : (
            <div style={{ overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--slate-50)', borderBottom: '2px solid var(--slate-100)' }}>
                    {['예매자명', '신청 매수', '입금 확인', '뒤풀이 참여 여부', '뒤풀이 참여자 수', '입장 처리', '신청 시간'].map((h) => (
                      <th key={h} style={{ padding: '14px 12px', textAlign: 'left', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((o) => {
                    const isPaid = o.depositStatus === DEPOSIT_DONE;
                    const isEntered = o.attendanceStatus === ATTEND_DONE;
                    return (
                      <tr key={o.id} style={{ borderBottom: '1px solid var(--slate-100)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '16px 12px', fontWeight: 800, color: 'var(--slate-900)', fontSize: 15 }}>{o.audienceName}</td>
                        <td style={{ padding: '16px 12px', fontWeight: 700, color: 'var(--slate-700)' }}>{o.ticketCount}매</td>
                        <td style={{ padding: '16px 12px' }}>
                          <button
                            type="button"
                            onClick={() => toggleDeposit(o)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 10,
                              border: `1.5px solid ${isPaid ? '#10b981' : 'var(--slate-200)'}`,
                              background: isPaid ? '#10b981' : '#fff',
                              color: isPaid ? '#fff' : '#64748b',
                              fontSize: 13,
                              fontWeight: 800,
                              cursor: isAdmin ? 'pointer' : 'default',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.2s'
                            }}
                          >
                            {isPaid ? '입금 완료' : '입금 대기'}
                          </button>
                        </td>
                        <td style={{ padding: '16px 12px', fontWeight: 600, color: o.isAfterParty ? 'var(--blue-600)' : 'var(--slate-500)' }}>{o.isAfterParty ? '참여' : '미참여'}</td>
                        <td style={{ padding: '16px 12px', fontWeight: 600 }}>{o.isAfterParty ? `${o.afterPartyCount || 1}명` : '0명'}</td>
                        <td style={{ padding: '16px 12px' }}>
                          <button
                            type="button"
                            onClick={() => toggleAttendance(o)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 10,
                              border: `1.5px solid ${isEntered ? '#3b82f6' : 'var(--slate-200)'}`,
                              background: isEntered ? '#3b82f6' : '#fff',
                              color: isEntered ? '#fff' : '#64748b',
                              fontSize: 13,
                              fontWeight: 800,
                              cursor: isAdmin ? 'pointer' : 'default',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.2s'
                            }}
                          >
                            {isEntered ? '입장 완료' : '미입장'}
                          </button>
                        </td>
                        <td style={{ padding: '16px 12px', color: 'var(--slate-500)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {o.createdAt ? new Date(o.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontWeight: 500 }}>
          관리자만 상태 토글이 가능합니다. 모든 데이터는 브라우저 로컬 스토리지에 안전하게 보관됩니다.
        </div>
      </div>
    </div>
  );
}
