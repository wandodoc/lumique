import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import './PageStyles.css';

const LS_ORDERS = 'lumique_ticket_orders';
const SUPPORT_ACCOUNT = '토스뱅크 1001-7629-3105 강맥';
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

const badgeStyle = (tone) => {
  if (tone === 'green') return { bg: '#ecfdf5', color: '#15803d', border: '#bbf7d0' };
  if (tone === 'blue') return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
  if (tone === 'amber') return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
  return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
};

function Badge({ label, tone }) {
  const style = badgeStyle(tone);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800, background: style.bg, color: style.color, border: `1px solid ${style.border}`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card card-pad" style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--slate-900)' }}>{value}</div>
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
      const matchesSearch = !q || String(order.audienceName || '').toLowerCase().includes(q) || String(order.phone || '').includes(q);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'deposit-wait' && order.depositStatus !== DEPOSIT_DONE) ||
        (filter === 'attend-wait' && order.attendanceStatus !== ATTEND_DONE) ||
        (filter === 'after-party' && Boolean(order.isAfterParty));
      return matchesSearch && matchesFilter;
    });
  }, [orders, query, filter]);

  const totals = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter((order) => order.depositStatus === DEPOSIT_DONE).length;
    const entered = orders.filter((order) => order.attendanceStatus === ATTEND_DONE).length;
    return { total, paid, entered };
  }, [orders]);

  const exportCsv = () => {
    const headers = ['예매자명', '신청 매수', '입금 확인', '뒤풀이 참여 여부', '뒤풀이 참여자 수', '입장 처리', '신청 시간'];
    const rows = [
      headers,
      ...visibleOrders.map((order) => [
        order.audienceName || '',
        order.ticketCount || 0,
        order.depositStatus === DEPOSIT_DONE ? '입금완료' : '입금대기',
        order.isAfterParty ? '참여' : '미참여',
        order.isAfterParty ? order.afterPartyCount || 1 : '-',
        order.attendanceStatus === ATTEND_DONE ? '입장완료' : '미입장',
        order.createdAt ? new Date(order.createdAt).toLocaleString('ko-KR') : '',
      ]),
    ];
    downloadCsv('lumique_reservations.csv', rows);
  };

  const updateOrder = (orderId, patch) => setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...patch } : order)));

  return (
    <div className="page-shell">
      <div className="page-container" style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: 'var(--slate-900)' }}>🎟️ 티켓 신청 및 입장 관리</h2>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>입금 확인과 현장 입장 상태를 한 화면에서 관리합니다.</p>
          </div>
          <button type="button" className="btn-secondary" style={{ height: 40, padding: '0 16px' }} onClick={() => window.location.assign('/')}>
            대시보드로 돌아가기
          </button>
        </div>

        <div className="grid-layout" style={{ gap: 14 }}>
          <StatCard label="총 신청" value={`${totals.total}명`} />
          <StatCard label="입금 완료" value={`${totals.paid}명`} />
          <StatCard label="현장 입장" value={`${totals.entered}명`} />
        </div>

        <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>🔎</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="예매자명 또는 연락처 검색"
                className="search-input"
                style={{ width: '100%', paddingLeft: 40, height: 44, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" style={{ height: 40, padding: '0 14px' }} onClick={exportCsv}>엑셀 다운로드</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['전체 보기', 'all'],
              ['입금대기자만 보기', 'deposit-wait'],
              ['미입장자만 보기', 'attend-wait'],
              ['뒤풀이 참여만 보기', 'after-party'],
            ].map(([label, value]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className="btn-secondary"
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderColor: filter === value ? '#111827' : 'var(--slate-200)',
                  background: filter === value ? '#111827' : '#fff',
                  color: filter === value ? '#fff' : 'var(--slate-700)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {visibleOrders.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)' }}>표시할 예매 정보가 없습니다.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--slate-50)', borderBottom: '2px solid var(--slate-100)' }}>
                    {['예매자명', '신청 매수', '입금 확인', '뒤풀이 참여 여부', '뒤풀이 참여자 수', '입장 처리', '신청 시간', '관리'].map((header) => (
                      <th key={header} style={{ padding: '12px', textAlign: 'left', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((order) => {
                    const depositDone = order.depositStatus === DEPOSIT_DONE;
                    const attendDone = order.attendanceStatus === ATTEND_DONE;
                    return (
                      <tr key={order.id} style={{ borderBottom: '1px solid var(--slate-100)' }}>
                        <td style={{ padding: '12px', fontWeight: 800, color: 'var(--slate-900)' }}>{order.audienceName}</td>
                        <td style={{ padding: '12px', fontWeight: 700 }}>{order.ticketCount}매</td>
                        <td style={{ padding: '12px' }}>
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => updateOrder(order.id, { depositStatus: depositDone ? DEPOSIT_WAIT : DEPOSIT_DONE })}
                              style={{
                                padding: '7px 12px',
                                borderRadius: 10,
                                border: `1px solid ${depositDone ? '#bbf7d0' : '#fde68a'}`,
                                background: depositDone ? '#ecfdf5' : '#fffbeb',
                                color: depositDone ? '#15803d' : '#b45309',
                                fontSize: 12,
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              {depositDone ? '입금 완료' : '입금 대기'}
                            </button>
                          ) : (
                            <Badge label={depositDone ? '입금 완료' : '입금 대기'} tone={depositDone ? 'green' : 'amber'} />
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>{order.isAfterParty ? '참여' : '미참여'}</td>
                        <td style={{ padding: '12px' }}>{order.isAfterParty ? `${order.afterPartyCount || 1}명` : '-'}</td>
                        <td style={{ padding: '12px' }}>
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => updateOrder(order.id, { attendanceStatus: attendDone ? ATTEND_WAIT : ATTEND_DONE })}
                              style={{
                                padding: '7px 12px',
                                borderRadius: 10,
                                border: `1px solid ${attendDone ? '#bfdbfe' : '#e2e8f0'}`,
                                background: attendDone ? '#eff6ff' : '#f8fafc',
                                color: attendDone ? '#1d4ed8' : '#475569',
                                fontSize: 12,
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              {attendDone ? '입장 완료' : '미입장'}
                            </button>
                          ) : (
                            <Badge label={attendDone ? '입장 완료' : '미입장'} tone={attendDone ? 'blue' : 'slate'} />
                          )}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--slate-600)' }}>{order.createdAt ? new Date(order.createdAt).toLocaleString('ko-KR') : '-'}</td>
                        <td style={{ padding: '12px' }}>{order.comment ? order.comment : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>관리자만 토글 편집이 가능합니다. 데이터는 localStorage에 저장됩니다.</div>
      </div>
    </div>
  );
}
