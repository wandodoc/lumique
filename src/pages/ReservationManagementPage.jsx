import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import './PageStyles.css';

const LS_SHOWS = 'lumique_concerts';

const LS_ORDERS = 'lumique_ticket_orders';
const DEPOSIT_WAIT = '입금대기';
const DEPOSIT_DONE = '입금완료';
const ATTEND_WAIT = '미입장';
const ATTEND_DONE = '입장완료';

import { firebaseStorage } from '../utils/firebaseStorage';

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
  const { id: concertId } = useParams();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [shows, setShows] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const currentShow = useMemo(() => shows.find(s => s.id === concertId), [shows, concertId]);

  useEffect(() => {
    document.title = '🎟️ 티켓 신청 및 입장 관리';
    async function loadData() {
      let fbConcerts = await firebaseStorage.loadConcerts();
      let fbOrders = await firebaseStorage.loadOrders();

      if (fbConcerts.length === 0 && loadLS(LS_SHOWS).length > 0) {
        fbConcerts = loadLS(LS_SHOWS);
      }
      if (fbOrders.length === 0 && loadLS(LS_ORDERS).length > 0) {
        fbOrders = loadLS(LS_ORDERS);
      }

      setShows(fbConcerts);
      setOrders(fbOrders);
      setLoading(false);
    }
    loadData();
  }, []);

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      // Filter by current concert
      if (concertId && order.concertId !== concertId) return false;

      const matchesSearch = !q || 
        String(order.audienceName || '').toLowerCase().includes(q) || 
        String(order.phone || '').includes(q);
      
      const matchesFilter =
        filter === 'all' ||
        (filter === 'deposit-wait' && order.depositStatus !== DEPOSIT_DONE) ||
        (filter === 'attend-wait' && order.attendanceStatus !== ATTEND_DONE);
      
      return matchesSearch && matchesFilter;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, query, filter, concertId]);

  const totals = useMemo(() => {
    return {
      tickets: visibleOrders.reduce((sum, o) => sum + (Number(o.ticketCount) || 0), 0),
      enteredTotal: visibleOrders.reduce((sum, o) => sum + (Number(o.enteredCount) || 0), 0),
      paidTickets: visibleOrders.reduce((sum, o) => sum + (o.depositStatus === DEPOSIT_DONE ? (Number(o.ticketCount) || 0) : 0), 0),
      afterParties: visibleOrders.reduce((sum, o) => sum + (o.isAfterParty ? (Number(o.afterPartyCount) || 1) : 0), 0),
    };
  }, [visibleOrders]);

  const exportCsv = () => {
    const headers = ['예매자명', '신청 매수', '뒤풀이 참여자 수', '초대자', '남기신 말씀', '신청 시간', '입금 여부', '입장 여부'];
    const rows = [
      headers,
      ...visibleOrders.map((o) => [
        o.audienceName || '',
        o.ticketCount || 0,
        o.isAfterParty ? o.afterPartyCount || 1 : 0,
        o.isAfterParty ? (o.inviterName || '') : '',
        o.comment || '',
        o.createdAt ? formatDate(o.createdAt) : '',
        o.depositStatus === DEPOSIT_DONE ? '입금 완료' : '입금 대기',
        o.attendanceStatus === ATTEND_DONE ? '입장 완료' : '미입장',
      ]),
    ];
    downloadCsv(`lumique_reservations_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const formatDate = (isoStr) => {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const updateOrder = async (id, patch) => {
    const nextOrders = orders.map((o) => (o.id === id ? { ...o, ...patch } : o));
    setOrders(nextOrders);
    await firebaseStorage.saveOrders(nextOrders);
  };

  const toggleDeposit = (order) => {
    if (!isAdmin) return;
    const isDone = order.depositStatus === DEPOSIT_DONE;
    updateOrder(order.id, { depositStatus: isDone ? DEPOSIT_WAIT : DEPOSIT_DONE });
  };

  const toggleAttendance = (order) => {
    if (!isAdmin) return;
    const totalTickets = Number(order.ticketCount) || 0;
    const currentEntered = Number(order.enteredCount) || 0;
    
    let newEntered = currentEntered + 1;
    let newStatus = ATTEND_WAIT;
    
    if (newEntered === totalTickets) {
      newStatus = ATTEND_DONE;
    } else if (newEntered > totalTickets || currentEntered === totalTickets) {
      newEntered = 0;
      newStatus = ATTEND_WAIT;
    }
    
    updateOrder(order.id, { 
      enteredCount: newEntered,
      attendanceStatus: newStatus 
    });
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh' }}>데이터를 불러오는 중입니다...</div>;
  }

  return (
    <div className="page fade-in" style={{ background: '#f8fafc', minHeight: '100dvh' }}>
      <div className="page-container" style={{ display: 'grid', gap: 20, padding: '32px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.5px' }}>🎟️ 티켓 관리</h1>
            {currentShow ? (
              <p className="caption" style={{ margin: '8px 0 0', fontWeight: 600, color: 'var(--slate-600)', fontSize: 14 }}>
                <strong style={{ color: 'var(--slate-900)' }}>{currentShow.title}</strong> · {currentShow.date} · {currentShow.location}
              </p>
            ) : (
              <p className="caption" style={{ margin: '6px 0 0', fontWeight: 500 }}>전체 공연의 예매 데이터를 조회 중입니다.</p>
            )}
          </div>
          <button type="button" className="btn-secondary" style={{ height: 44, padding: '0 20px', borderRadius: 12, fontWeight: 700 }} onClick={() => navigate('/concerts')}>
            공연 목록으로 돌아가기
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <StatCard label="총 신청 매수" value={`${totals.tickets}매`} color="var(--indigo-600)" />
          <StatCard label="총 입장 인원" value={`${totals.enteredTotal}명`} color="var(--blue-600)" />
          <StatCard label="입금 완료" value={`${totals.paidTickets}명`} color="var(--emerald-600)" />
          <StatCard label="뒤풀이 인원" value={`${totals.afterParties}명`} color="var(--slate-600)" />
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
            <div style={{ overflowX: 'auto', margin: '0 -24px' }}>
              <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 14, minWidth: 700 }}>
                <thead>
                  <tr style={{ background: 'var(--slate-50)', borderBottom: '2px solid var(--slate-100)' }}>
                    <th style={{ width: '120px', padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>예매자명</th>
                    <th style={{ width: '90px', padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>신청 매수</th>
                    <th style={{ width: '130px', padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>뒤풀이 참여자 수</th>
                    <th style={{ width: 'auto', padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>남기신 말씀</th>
                    <th style={{ width: '140px', padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>신청 시간</th>
                    <th style={{ width: '110px', padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>입금 여부</th>
                    <th style={{ width: '110px', padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>입장 여부</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((o) => {
                    const isPaid = o.depositStatus === DEPOSIT_DONE;
                    const totalTickets = Number(o.ticketCount) || 0;
                    const currentEntered = Number(o.enteredCount) || 0;
                    const isEntered = currentEntered === totalTickets;
                    
                    return (
                      <tr key={o.id} style={{ borderBottom: '1px solid var(--slate-100)', transition: 'background 0.2s', textAlign: 'center' }}>
                        <td style={{ padding: '16px 12px', fontWeight: 800, color: 'var(--slate-900)', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.audienceName}</td>
                        <td style={{ padding: '16px 12px', fontWeight: 700, color: 'var(--slate-700)' }}>{o.ticketCount}매</td>
                        <td style={{ padding: '16px 12px' }}>
                          <div style={{ fontWeight: 600 }}>{o.isAfterParty ? `${o.afterPartyCount || 1}명` : '0명'}</div>
                          {o.isAfterParty && o.inviterName && (
                            <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 4 }}>초대자: {o.inviterName}</div>
                          )}
                        </td>
                        <td style={{ padding: '16px 12px', color: 'var(--slate-500)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.comment || '-'}</td>
                        <td style={{ padding: '16px 12px', color: 'var(--slate-500)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.createdAt ? formatDate(o.createdAt) : '-'}
                        </td>
                        <td style={{ padding: '16px 12px' }}>
                          <button
                            type="button"
                            onClick={() => toggleDeposit(o)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
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
                        <td style={{ padding: '16px 12px' }}>
                          <button
                            type="button"
                            onClick={() => toggleAttendance(o)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
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
                            {isEntered ? '입장 완료' : `${currentEntered}/${totalTickets} 입장`}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--slate-100)', fontWeight: 800, borderTop: '2px solid var(--slate-200)' }}>
                    <td style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--slate-700)' }}>합계</td>
                    <td style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--indigo-600)' }}>{totals.tickets}매</td>
                    <td style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--blue-600)' }}>{totals.afterParties}명</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontWeight: 500 }}>
          관리자만 상태 토글이 가능합니다. 모든 데이터는 클라우드(Firebase)에 실시간으로 안전하게 보관됩니다.
        </div>
      </div>
    </div>
  );
}
