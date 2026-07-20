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
  const [donationInput, setDonationInput] = useState('');
  const [savingDonation, setSavingDonation] = useState(false);

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
    const allConcertOrders = concertId ? orders.filter(o => o.concertId === concertId) : orders;
    const paidCount = allConcertOrders.reduce((sum, o) => sum + (o.depositStatus === DEPOSIT_DONE ? (Number(o.ticketCount) || 0) : 0), 0);
    const ticketPrice = currentShow?.price ?? 5000;
    const extraDonation = Number(currentShow?.extraDonation || 0);
    return {
      tickets: visibleOrders.reduce((sum, o) => sum + (Number(o.ticketCount) || 0), 0),
      enteredTotal: visibleOrders.reduce((sum, o) => sum + (Number(o.enteredCount) || 0), 0),
      paidTickets: visibleOrders.reduce((sum, o) => sum + (o.depositStatus === DEPOSIT_DONE ? (Number(o.ticketCount) || 0) : 0), 0),
      afterParties: visibleOrders.reduce((sum, o) => sum + (o.isAfterParty ? (Number(o.afterPartyCount) || 1) : 0), 0),
      totalFund: paidCount * ticketPrice + extraDonation,
      extraDonation,
      ticketPrice,
    };
  }, [visibleOrders, orders, concertId, currentShow]);

  // 초대자별 뒤풀이 집계
  const inviterStats = useMemo(() => {
    const src = concertId ? orders.filter(o => o.concertId === concertId) : orders;
    const map = {};
    for (const o of src) {
      if (!o.isAfterParty || !o.inviterName) continue;
      const names = o.inviterName.split(',').map(n => n.trim()).filter(Boolean);
      if (names.length === 0) continue;
      const perInviter = (Number(o.afterPartyCount) || 1) / names.length;
      for (const name of names) {
        if (!map[name]) map[name] = { count: 0, orders: 0 };
        map[name].count += perInviter;
        map[name].orders += 1;
      }
    }
    return Object.entries(map)
      .map(([name, v]) => [name, { count: Math.round(v.count), orders: v.orders }])
      .sort((a, b) => b[1].count - a[1].count);
  }, [orders, concertId]);


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

  const formatShowDT = (dStr, tStr) => {
    if (!dStr) return '';
    const dateObj = new Date(dStr);
    if (isNaN(dateObj.getTime())) return `${dStr} ${tStr}`.trim();
    const w = ['일', '월', '화', '수', '목', '금', '토'];
    const [y, m, day] = dStr.split('-');
    const dayOfWeek = w[dateObj.getDay()];
    return `${y}.${Number(m)}.${Number(day)} (${dayOfWeek}) ${tStr}`.trim();
  };

  const updateOrder = async (id, patch) => {
    const nextOrders = orders.map((o) => (o.id === id ? { ...o, ...patch } : o));
    setOrders(nextOrders);
    await firebaseStorage.saveOrders(nextOrders);
  };

  const saveDonation = async () => {
    if (!currentShow || !concertId) return;
    const amount = Number(String(donationInput).replace(/[^0-9]/g, ''));
    if (isNaN(amount)) return;
    setSavingDonation(true);
    try {
      const concerts = await firebaseStorage.loadConcerts();
      const updated = concerts.map(c => c.id === concertId ? { ...c, extraDonation: amount } : c);
      await firebaseStorage.saveConcerts(updated);
      setShows(updated);
      setDonationInput('');
    } finally {
      setSavingDonation(false);
    }
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
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100dvh', gap: 16, background: '#f8fafc' }}>
        <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 4 }}></div>
        <div className="loading-text" style={{ color: 'var(--slate-500)', fontSize: 15, fontWeight: 600 }}>데이터를 불러오는 중입니다...</div>
      </div>
    );
  }

  return (
    <div className="page fade-in" style={{ background: '#f8fafc', minHeight: '100dvh' }}>
      <div className="page-container" style={{ display: 'grid', gap: 20, padding: '32px 16px' }}>
        {/* ── 페이지 헤더 ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', letterSpacing: '0.05em', textTransform: 'uppercase' }}>🎟️ 티켓 관리</span>
            {currentShow ? (
              <>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px', lineHeight: 1.3 }}>
                  {currentShow.title}
                </h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, color: '#64748b', marginTop: 2 }}>
                  <span>🗓️ {formatShowDT(currentShow.date, currentShow.time)}</span>
                  <span>📍 {currentShow.location}</span>
                </div>
              </>
            ) : (
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px', lineHeight: 1.3 }}>
                전체 공연 예매 관리
              </h1>
            )}
          </div>
          <button type="button" className="btn-secondary" style={{ height: 38, padding: '0 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => navigate('/concerts')}>
            ← 공연 목록
          </button>
        </div>

        {/* ── 통계 카드 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <StatCard label="총 신청 매수" value={`${totals.tickets}매`} color="#4f46e5" />
          <StatCard label="총 입장 인원" value={`${totals.enteredTotal}명`} color="#2563eb" />
          <StatCard label="입금 완료" value={`${totals.paidTickets}매`} color="#059669" />
          <StatCard label="뒤풀이 인원" value={`${totals.afterParties}명`} color="#64748b" />
        </div>

        {/* ── 총 모금액 카드 ── */}
        {concertId && (
          <div style={{ background: '#111827', borderRadius: 20, padding: '20px 24px', color: '#fff', display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>총 모금액</div>
                <div style={{ fontSize: 34, fontWeight: 950, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  {totals.totalFund.toLocaleString()}원
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.6 }}>
                  입금완료 {totals.paidTickets}매 × {totals.ticketPrice.toLocaleString()}원
                  {totals.extraDonation > 0 && <span style={{ color: '#10b981' }}> + 후원금 {totals.extraDonation.toLocaleString()}원</span>}
                </div>
              </div>
            </div>
            {isAdmin && (
              <div style={{ borderTop: '1px solid #374151', paddingTop: 14 }}>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, fontWeight: 600 }}>
                  추가 후원금 입력 (현재: {totals.extraDonation.toLocaleString()}원)
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    value={donationInput}
                    onChange={e => setDonationInput(e.target.value)}
                    placeholder="금액 입력 (예: 50000)"
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #374151', background: '#1f2937', color: '#fff', fontSize: 14, fontWeight: 600, outline: 'none', minWidth: 0 }}
                    onKeyDown={e => e.key === 'Enter' && saveDonation()}
                  />
                  <button
                    type="button"
                    onClick={saveDonation}
                    disabled={savingDonation}
                    style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: savingDonation ? '#374151' : '#10b981', color: '#fff', fontWeight: 800, fontSize: 14, cursor: savingDonation ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', transition: 'background 0.2s' }}
                  >
                    {savingDonation ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}


        <div className="card card-pad" style={{ display: 'grid', gap: 14, borderRadius: 20, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 15 }}>🔎</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예매자명 또는 연락처 검색"
                className="search-input"
                style={{ width: '100%', paddingLeft: 38, height: 42, boxSizing: 'border-box', borderRadius: 12, fontSize: 14 }}
              />
            </div>
            <button type="button" className="btn-secondary" style={{ height: 42, padding: '0 14px', borderRadius: 12, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={exportCsv}>CSV 내보내기</button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['전체', 'all'],
              ['입금대기', 'deposit-wait'],
              ['미입장', 'attend-wait'],
            ].map(([label, value]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                style={{
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: '1.5px solid',
                  borderColor: filter === value ? '#111827' : '#e2e8f0',
                  background: filter === value ? '#111827' : '#fff',
                  color: filter === value ? '#fff' : '#475569',
                  fontSize: 13,
                  fontWeight: 700,
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 800 }}>
                <thead>
                  <tr style={{ background: 'var(--slate-50)', borderBottom: '2px solid var(--slate-100)' }}>
                    <th style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>예매자명</th>
                    <th style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>신청 매수</th>
                    <th style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>뒤풀이 참여자 수</th>
                    <th style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>입금 여부</th>
                    <th style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>입장 여부</th>
                    <th style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>남기신 말씀</th>
                    <th style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>신청 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((o) => {
                    const isPaid = o.depositStatus === DEPOSIT_DONE;
                    const totalTickets = Number(o.ticketCount) || 0;
                    const currentEntered = Number(o.enteredCount) || 0;
                    const isEntered = currentEntered === totalTickets;
                    
                    return (
                      <tr key={o.id} style={{ borderBottom: '1px solid var(--slate-100)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '16px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--slate-900)', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{o.audienceName}</td>
                        <td style={{ padding: '16px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--slate-700)' }}>{o.ticketCount}매</td>
                        <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                          <div style={{ fontWeight: 600 }}>{o.isAfterParty ? `${o.afterPartyCount || 1}명` : '0명'}</div>
                          {o.isAfterParty && o.inviterName && (
                            <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 4 }}>초대자: {o.inviterName}</div>
                          )}
                        </td>
                        <td style={{ padding: '16px 12px', textAlign: 'center' }}>
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
                        <td style={{ padding: '16px 12px', textAlign: 'center' }}>
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
                        <td style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--slate-500)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 250 }}>{o.comment || '-'}</td>
                        <td style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--slate-500)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.createdAt ? formatDate(o.createdAt) : '-'}
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
        {/* ── 초대자별 뒤풀이 집계 ── */}
        {inviterStats.length > 0 && (
          <div className="card card-pad" style={{ borderRadius: 20, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 14 }}>🎉 초대자별 뒤풀이 현황</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {inviterStats.map(([name, stat]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{stat.orders}건 예매 연결</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ padding: '5px 14px', borderRadius: 20, background: '#111827', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                      {stat.count}명
                    </span>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6, fontSize: 13, color: '#64748b', fontWeight: 700 }}>
                합계: {inviterStats.reduce((s, [, v]) => s + v.count, 0)}명
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontWeight: 500 }}>
          관리자만 상태 토글이 가능합니다. 모든 데이터는 브라우저 로컬 스토리지에 안전하게 보관됩니다.
        </div>
      </div>
    </div>
  );
}
