import { useState, useEffect, useCallback } from 'react';

const LS_SHOWS = 'lumique_performances';
const LS_ORDERS = 'lumique_ticket_orders';
const TICKET_PRICE = 5000;
const SUPPORT_ACCOUNT = '토스뱅크 1001-7629-3105 강맥';

const loadLS = (key) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : []; }
  catch { return []; }
};
const saveLS = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

/* ─── 배지 컴포넌트 ─── */
function Badge({ label, color }) {
  const styles = {
    green:  { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
    amber:  { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
    blue:   { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
    red:    { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
    slate:  { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  };
  const s = styles[color] || styles.slate;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 700,
      background: s.bg,
      color: s.text,
      border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

/* ─── 통계 위젯 ─── */
function StatsRow({ orders }) {
  const confirmed = orders.filter(o => o.depositStatus === '입금완료');
  const totalAmount = confirmed.reduce((s, o) => s + (o.totalPrice || 0), 0);
  const totalTickets = orders.reduce((s, o) => s + (o.ticketCount || 0), 0);
  const entered = orders.filter(o => o.attendanceStatus === '입장완료').length;

  const items = [
    { label: '총 예매 매수', value: `${totalTickets}매`, icon: '🎟️', color: '#2563eb' },
    { label: '입금완료 총액', value: `${totalAmount.toLocaleString()}원`, icon: '💰', color: '#16a34a' },
    { label: '신청 인원', value: `${orders.length}명`, icon: '👤', color: '#7c3aed' },
    { label: '입장 완료', value: `${entered}명`, icon: '✅', color: '#d97706' },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: 12,
      marginBottom: 20,
    }}>
      {items.map((it) => (
        <div key={it.label} style={{
          background: '#fff',
          border: '1px solid #e8edf2',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <span style={{ fontSize: 20 }}>{it.icon}</span>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{it.label}</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: it.color }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── 관객 명단 테이블 ─── */
function OrderList({ orders, onUpdateOrder, onDeleteOrder }) {
  const [search, setSearch] = useState('');

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    return (o.audienceName || '').toLowerCase().includes(q) || (o.phone || '').includes(q);
  });

  return (
    <div>
      {/* 검색창 */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
        <input
          type="text"
          placeholder="이름 또는 전화번호 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px 10px 40px',
            border: '1.5px solid #e2e8f0',
            borderRadius: 12,
            fontSize: 14,
            outline: 'none',
            background: '#f8fafc',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = '#3b82f6'}
          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
          {orders.length === 0 ? '아직 예매 신청이 없습니다. 링크를 관객에게 공유해보세요!' : '검색 결과가 없습니다.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['신청자', '연락처', '매수', '후원금', '총금액', '입금', '입장', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} style={{
                  borderBottom: '1px solid #f1f5f9',
                  background: o.attendanceStatus === '입장완료' ? '#f0fdf4' : '#fff',
                  transition: 'background 0.15s',
                }}>
                  <td style={{ padding: '11px 12px', fontWeight: 700, color: '#1e293b' }}>{o.audienceName}</td>
                  <td style={{ padding: '11px 12px', color: '#475569' }}>{o.phone}</td>
                  <td style={{ padding: '11px 12px', fontWeight: 700, color: '#2563eb' }}>{o.ticketCount}매</td>
                  <td style={{ padding: '11px 12px', color: '#64748b' }}>{(o.supportAmount || 0).toLocaleString()}원</td>
                  <td style={{ padding: '11px 12px', fontWeight: 700, color: '#1e293b' }}>{(o.totalPrice || 0).toLocaleString()}원</td>
                  <td style={{ padding: '11px 12px' }}>
                    <Badge
                      label={o.depositStatus}
                      color={o.depositStatus === '입금완료' ? 'green' : 'amber'}
                    />
                  </td>
                  <td style={{ padding: '11px 12px' }}>
                    <Badge
                      label={o.attendanceStatus}
                      color={o.attendanceStatus === '입장완료' ? 'blue' : 'slate'}
                    />
                  </td>
                  <td style={{ padding: '11px 12px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                      {o.depositStatus !== '입금완료' && (
                        <button
                          onClick={() => onUpdateOrder(o.id, { depositStatus: '입금완료' })}
                          style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >입금확인</button>
                      )}
                      {o.attendanceStatus !== '입장완료' && (
                        <button
                          onClick={() => onUpdateOrder(o.id, { attendanceStatus: '입장완료' })}
                          style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >입장체크</button>
                      )}
                      <button
                        onClick={() => onDeleteOrder(o.id)}
                        style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
                      >🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── 공연 추가 모달 ─── */
function AddShowModal({ onClose, onAdd }) {
  const [form, setForm] = useState({
    title: '', date: '', location: '',
    price: TICKET_PRICE, description: '', status: '예매중',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.location.trim()) {
      return alert('공연명, 날짜, 장소는 필수 입력입니다.');
    }
    onAdd({
      id: `show-${Date.now()}`,
      supportAccount: SUPPORT_ACCOUNT,
      ...form,
      price: Number(form.price) || TICKET_PRICE,
    });
    onClose();
  };

  const fieldStyle = {
    width: '100%', padding: '10px 13px', borderRadius: 10,
    border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '28px 24px 36px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, background: '#e2e8f0', borderRadius: 9, margin: '0 auto 20px' }} />
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 20px', color: '#1e293b' }}>🎭 신규 공연 등록</h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>공연 타이틀 *</label>
            <input style={fieldStyle} value={form.title} onChange={e => set('title', e.target.value)} placeholder="예: 2026 루미크 여름 정기 공연" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>공연 날짜 *</label>
            <input type="date" style={fieldStyle} value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>장소 *</label>
            <input style={fieldStyle} value={form.location} onChange={e => set('location', e.target.value)} placeholder="예: 홍대 상상마당 라이브홀" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>티켓 가격 (원)</label>
            <input type="number" min="0" step="500" style={fieldStyle} value={form.price} onChange={e => set('price', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>공연 소개 / 안내사항</label>
            <textarea rows={3} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="공연 소개 및 유의사항을 입력해 주세요" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5 }}>상태</label>
            <select style={{ ...fieldStyle, appearance: 'none', background: '#f8fafc' }} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="예매중">예매중</option>
              <option value="종료">종료</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              취소
            </button>
            <button type="submit"
              style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              공연 등록
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── 메인 페이지 ─── */
export default function PerformancePage() {
  const [shows, setShows] = useState(() => loadLS(LS_SHOWS));
  const [orders, setOrders] = useState(() => loadLS(LS_ORDERS));
  const [selectedId, setSelectedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  // 초기 선택
  useEffect(() => {
    if (!selectedId && shows.length > 0) setSelectedId(shows[0].id);
  }, [shows, selectedId]);

  /* ── 공연 CRUD ── */
  const addShow = useCallback((show) => {
    const next = [...shows, show].sort((a, b) => a.date.localeCompare(b.date));
    setShows(next); saveLS(LS_SHOWS, next);
    setSelectedId(show.id);
  }, [shows]);

  const deleteShow = useCallback((id) => {
    if (!window.confirm('공연과 모든 예매 내역이 영구 삭제됩니다. 진행할까요?')) return;
    const nextShows = shows.filter(s => s.id !== id);
    const nextOrders = orders.filter(o => o.concertId !== id);
    setShows(nextShows); saveLS(LS_SHOWS, nextShows);
    setOrders(nextOrders); saveLS(LS_ORDERS, nextOrders);
    setSelectedId(nextShows[0]?.id || null);
  }, [shows, orders]);

  /* ── 주문 CRUD ── */
  const updateOrder = useCallback((orderId, changes) => {
    const next = orders.map(o => o.id === orderId ? { ...o, ...changes } : o);
    setOrders(next); saveLS(LS_ORDERS, next);
  }, [orders]);

  const deleteOrder = useCallback((orderId) => {
    if (!window.confirm('이 예매 내역을 삭제할까요?')) return;
    const next = orders.filter(o => o.id !== orderId);
    setOrders(next); saveLS(LS_ORDERS, next);
  }, [orders]);

  /* ── 링크 복사 ── */
  const copyLink = (showId) => {
    const url = `${window.location.origin}/form/${showId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  };

  const selectedShow = shows.find(s => s.id === selectedId);
  const showOrders = orders.filter(o => o.concertId === selectedId);

  /* ── CSS-in-JS 공통 스타일 변수 ── */
  const ctrl = {
    height: 42,
    display: 'flex', alignItems: 'center',
    borderRadius: 10,
    border: '1.5px solid #e2e8f0',
    fontSize: 14, fontWeight: 600,
    padding: '0 14px',
    background: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '20px 20px 40px', maxWidth: 1100, margin: '0 auto', fontFamily: 'inherit' }}>

      {/* ── 상단 헤더 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10, marginBottom: 22,
      }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#0f172a' }}>🎭 공연 관리</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '3px 0 0' }}>공연 등록 · 예매 신청 · 입금 확인 · 현장 입장 관리</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{ ...ctrl, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 800, padding: '0 18px', gap: 6 }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> 신규 공연 추가
        </button>
      </div>

      {/* ── 공연 없음 ── */}
      {shows.length === 0 && (
        <div style={{
          background: '#fff', border: '2px dashed #e2e8f0', borderRadius: 18,
          padding: '60px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎭</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#475569', margin: '0 0 6px' }}>등록된 공연이 없습니다</p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>위의 [신규 공연 추가] 버튼으로 첫 공연을 등록해보세요</p>
          <button onClick={() => setShowAddModal(true)}
            style={{ padding: '11px 24px', borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            첫 공연 등록하기
          </button>
        </div>
      )}

      {shows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 20, alignItems: 'start' }}>

          {/* ── 좌: 공연 목록 ── */}
          <div style={{ background: '#fff', border: '1px solid #e8edf2', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, fontSize: 14, color: '#374151' }}>
              등록된 공연 ({shows.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {shows.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  style={{
                    textAlign: 'left',
                    padding: '13px 16px',
                    border: 'none',
                    borderBottom: '1px solid #f8fafc',
                    background: selectedId === s.id ? '#eff6ff' : '#fff',
                    borderLeft: selectedId === s.id ? '3px solid #2563eb' : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>📅 {s.date}</div>
                  <div style={{ marginTop: 5 }}>
                    <Badge label={s.status} color={s.status === '예매중' ? 'green' : 'slate'} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── 우: 상세 + 명단 ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {selectedShow && (
              <>
                {/* 공연 상세 카드 */}
                <div style={{ background: '#fff', border: '1px solid #e8edf2', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <Badge label={selectedShow.status} color={selectedShow.status === '예매중' ? 'green' : 'slate'} />
                        <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '8px 0 4px' }}>{selectedShow.title}</h3>
                        {selectedShow.description && (
                          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.5 }}>{selectedShow.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteShow(selectedShow.id)}
                        style={{ padding: '7px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                      >공연 삭제</button>
                    </div>
                  </div>

                  <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, borderBottom: '1px solid #f1f5f9' }}>
                    {[
                      { icon: '📅', label: '날짜', val: selectedShow.date },
                      { icon: '📍', label: '장소', val: selectedShow.location },
                      { icon: '🪙', label: '티켓 가격', val: `${(selectedShow.price ?? TICKET_PRICE).toLocaleString()}원/매` },
                      { icon: '🏦', label: '계좌', val: selectedShow.supportAccount },
                    ].map(it => (
                      <div key={it.label}>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{it.icon} {it.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{it.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* 예매 링크 복사 */}
                  <div style={{ padding: '14px 24px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>관객 예매 링크</span>
                    <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
                      <input
                        readOnly
                        value={`${window.location.origin}/form/${selectedShow.id}`}
                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 12, background: '#f8fafc', color: '#64748b', boxSizing: 'border-box' }}
                      />
                    </div>
                    <button
                      onClick={() => copyLink(selectedShow.id)}
                      style={{ ...ctrl, height: 38, background: copyDone ? '#f0fdf4' : '#2563eb', color: copyDone ? '#16a34a' : '#fff', border: 'none', fontWeight: 800, padding: '0 16px', borderRadius: 10 }}
                    >
                      {copyDone ? '✅ 복사완료' : '🔗 링크 복사'}
                    </button>
                  </div>
                </div>

                {/* 통계 위젯 */}
                <StatsRow orders={showOrders} />

                {/* 관객 명단 */}
                <div style={{ background: '#fff', border: '1px solid #e8edf2', borderRadius: 16, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>🎟️ 관객 신청 명단</span>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>총 {showOrders.length}건</span>
                  </div>
                  <OrderList orders={showOrders} onUpdateOrder={updateOrder} onDeleteOrder={deleteOrder} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAddModal && <AddShowModal onClose={() => setShowAddModal(false)} onAdd={addShow} />}
    </div>
  );
}
