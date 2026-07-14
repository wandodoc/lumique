import { useState, useEffect } from 'react';
import './PageStyles.css';

/**
 * Data Schemas
 * Concert: { id, title, date, location, price, description, supportAccount, status }
 * TicketRequest: { id, concertId, audienceName, phone, ticketCount, supportAmount, totalPrice, depositStatus, attendanceStatus }
 */

export default function PerformancePage() {
  // ---------- Performances ----------
  const [performances, setPerformances] = useState(() => {
    const saved = localStorage.getItem('lumique_performances');
    return saved ? JSON.parse(saved) : [];
  });

  // ---------- Ticket Orders ----------
  const [orders, setOrders] = useState(() => {
    const saved = localStorage.getItem('lumique_ticket_orders');
    return saved ? JSON.parse(saved) : [];
  });

  // UI state
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newPrice, setNewPrice] = useState(5000);
  const [newDesc, setNewDesc] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState(null);
  const [copySuccessId, setCopySuccessId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ---------- Persistence Helpers ----------
  const savePerformances = (list) => {
    setPerformances(list);
    localStorage.setItem('lumique_performances', JSON.stringify(list));
  };
  const saveOrders = (list) => {
    setOrders(list);
    localStorage.setItem('lumique_ticket_orders', JSON.stringify(list));
  };

  // ---------- Performance CRUD ----------
  const handleAddShow = (e) => {
    e.preventDefault();
    if (!newTitle || !newDate || !newLocation) return alert('필수 항목을 입력해 주세요.');
    const newShow = {
      id: `show-${Date.now()}`,
      title: newTitle,
      date: newDate,
      location: newLocation,
      price: Number(newPrice),
      description: newDesc,
      supportAccount: '토스뱅크 1001-7629-3105 강맥',
      status: '예매중'
    };
    const updated = [...performances, newShow].sort((a, b) => a.date.localeCompare(b.date));
    savePerformances(updated);
    setSelectedShowId(newShow.id);
    // reset form
    setNewTitle('');
    setNewDate('');
    setNewLocation('');
    setNewPrice(5000);
    setNewDesc('');
    setShowAddModal(false);
  };

  const handleDeleteShow = (id) => {
    if (!window.confirm('공연과 연결된 모든 예매 내역이 삭제됩니다. 진행하시겠습니까?')) return;
    const updatedShows = performances.filter(p => p.id !== id);
    const updatedOrders = orders.filter(o => o.concertId !== id);
    savePerformances(updatedShows);
    saveOrders(updatedOrders);
    if (selectedShowId === id) setSelectedShowId(updatedShows[0]?.id || null);
  };

  // ---------- Order CRUD ----------
  const handleUpdateOrder = (orderId, changes) => {
    const updated = orders.map(o => (o.id === orderId ? { ...o, ...changes } : o));
    saveOrders(updated);
  };

  const handleDeleteOrder = (orderId) => {
    if (!window.confirm('예매 내역을 정말 삭제하시겠습니까?')) return;
    const updated = orders.filter(o => o.id !== orderId);
    saveOrders(updated);
  };

  // ---------- Copy Link ----------
  const handleCopyLink = (showId) => {
    const link = `${window.location.origin}/form/${showId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopySuccessId(showId);
      setTimeout(() => setCopySuccessId(null), 2000);
    });
  };

  // ---------- Revenue Closing ----------
  const handleCloseRevenue = (concertId) => {
    const targetOrders = orders.filter(o => o.concertId === concertId && o.depositStatus === '입금완료');
    const total = targetOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    if (total === 0) return alert('입금완료된 티켓이 없습니다.');
    const revenueEntry = {
      id: `rev-${Date.now()}`,
      category: '사업수익',
      amount: total,
      note: `${concertId} 공연 티켓 및 후원금 수입 마감`
    };
    const saved = localStorage.getItem('lumique_revenue');
    const revList = saved ? JSON.parse(saved) : [];
    revList.push(revenueEntry);
    localStorage.setItem('lumique_revenue', JSON.stringify(revList));
    alert(`총 ${total.toLocaleString()}원이 매출 장부에 기록되었습니다.`);
  };

  // ---------- Derived Data ----------
  const selectedShow = performances.find(p => p.id === selectedShowId);
  const showOrders = orders.filter(o => o.concertId === selectedShowId);

  const filteredOrders = showOrders.filter(o => {
    const term = searchTerm.toLowerCase();
    return (
      o.audienceName?.toLowerCase().includes(term) ||
      o.phone?.toLowerCase().includes(term)
    );
  });

  // ---------- Effect: set initial selection ----------
  useEffect(() => {
    if (!selectedShowId && performances.length > 0) setSelectedShowId(performances[0].id);
  }, [performances, selectedShowId]);

  return (
    <div className="page fade-in">
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🎭 공연 및 관객 티켓 신청 관리</h2>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>+ 신규 공연 추가</button>
      </div>

      {/* 공연 리스트 & 상세 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>
        {/* 공연 목록 */}
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="card-title" style={{ fontSize: 16 }}>등록된 공연 목록</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {performances.map(p => (
              <button key={p.id}
                onClick={() => setSelectedShowId(p.id)}
                style={{
                  textAlign: 'left',
                  padding: 12,
                  borderRadius: 10,
                  border: selectedShowId === p.id ? '2px solid var(--blue-500)' : '1px solid var(--slate-100)',
                  background: selectedShowId === p.id ? '#f0f9ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--slate-800)', marginBottom: 4 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>📅 {p.date} | 📍 {p.location}</div>
                <div style={{ fontSize: 12, marginTop: 4, color: p.status === '예매중' ? 'var(--green-600)' : 'var(--red-600)' }}>{p.status}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 선택된 공연 상세 */}
        {selectedShow && (
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="flex-between" style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 12, background: 'var(--blue-50)', color: 'var(--blue-600)', padding: '4px 10px', borderRadius: 8, fontWeight: 700 }}>상세 정보</span>
                <button className="btn-sm" onClick={() => handleDeleteShow(selectedShow.id)} style={{ background: '#fef2f2', color: 'var(--red-500)', border: 'none' }}>공연 삭제</button>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px 0', color: 'var(--slate-800)' }}>{selectedShow.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--slate-600)', margin: '0 0 16px 0', lineHeight: 1.4 }}>{selectedShow.description || '공연 세부 설명이 없습니다.'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--slate-600)' }}>
                <span>📅 <strong>일시:</strong> {selectedShow.date}</span>
                <span>📍 <strong>장소:</strong> {selectedShow.location}</span>
                <span>🪙 <strong>티켓가:</strong> {(selectedShow.price ?? 0).toLocaleString()}원</span>
                <span>🏦 <strong>계좌:</strong> {selectedShow.supportAccount}</span>
                <span>🔔 <strong>상태:</strong> {selectedShow.status}</span>
              </div>
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--slate-100)' }}>
              <div style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, marginBottom: 8 }}>외부 관객 예매 신청 폼 링크</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" readOnly value={`${window.location.origin}/form/${selectedShow.id}`}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--slate-200)', borderRadius: 8, fontSize: 12, background: '#f8fafc', color: 'var(--slate-600)' }} />
                <button className="btn-primary" onClick={() => handleCopyLink(selectedShow.id)} style={{ padding: '8px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {copySuccessId === selectedShow.id ? '복사 완료! ✅' : '링크 복사'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 주문 리스트 */}
      {selectedShow && (
        <div className="card card-pad">
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <span className="card-title" style={{ fontSize: 16, margin: 0 }}>🎟️ 관객 신청 명단 ({showOrders.reduce((sum, o) => sum + o.ticketCount, 0)}매 신청됨)</span>
            <button className="btn-sm" onClick={() => handleCloseRevenue(selectedShow.id)} style={{ background: '#e0f7fa', color: '#006064' }}>💰 매출 장부 마감</button>
          </div>
          {/* 검색 */}
          <div style={{ marginBottom: 12 }}>
            <input type="text" placeholder="이름·전화 검색" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="search-input"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--slate-200)', borderRadius: 8, fontSize: 13 }} />
          </div>
          {filteredOrders.length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>예매 신청자가 없습니다. 위 링크를 관객들에게 공유해보세요!</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
                <thead>
                  <tr key="header" style={{ borderBottom: '2px solid var(--slate-200)', color: 'var(--slate-500)', fontWeight: 700, textAlign: 'left' }}>
                    <th style={{ padding: 12 }}>신청자</th>
                    <th style={{ padding: 12 }}>연락처</th>
                    <th style={{ padding: 12 }}>매수</th>
                    <th style={{ padding: 12 }}>후원금</th>
                    <th style={{ padding: 12 }}>총 금액</th>
                    <th style={{ padding: 12 }}>입금 상태</th>
                    <th style={{ padding: 12 }}>입장 상태</th>
                    <th style={{ padding: 12, textAlign: 'right' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--slate-100)' }}>
                      <td style={{ padding: 12, fontWeight: 700, color: 'var(--slate-800)' }}>{o.audienceName}</td>
                      <td style={{ padding: 12, color: 'var(--slate-600)' }}>{o.phone}</td>
                      <td style={{ padding: 12, fontWeight: 700 }}>{o.ticketCount}매</td>
                      <td style={{ padding: 12, color: 'var(--slate-700)' }}>{o.supportAmount?.toLocaleString() || 0}원</td>
                      <td style={{ padding: 12, color: 'var(--slate-700)' }}>{o.totalPrice?.toLocaleString() || 0}원</td>
                      <td style={{ padding: 12 }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          backgroundColor: o.depositStatus === '입금완료' ? '#f0fdf4' : '#fff4e5',
                          color: o.depositStatus === '입금완료' ? '#16a34a' : '#d97706'
                        }}>{o.depositStatus}</span>
                      </td>
                      <td style={{ padding: 12 }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          backgroundColor: o.attendanceStatus === '입장완료' ? '#e0f2fe' : '#fff7ed',
                          color: o.attendanceStatus === '입장완료' ? '#0284c7' : '#d97706'
                        }}>{o.attendanceStatus}</span>
                      </td>
                      <td style={{ padding: 12, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {o.depositStatus !== '입금완료' && (
                            <button className="btn-sm" onClick={() => handleUpdateOrder(o.id, { depositStatus: '입금완료' })}
                              style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '4px 8px' }}>입금확인</button>
                          )}
                          {o.attendanceStatus !== '입장완료' && (
                            <button className="btn-sm" onClick={() => handleUpdateOrder(o.id, { attendanceStatus: '입장완료' })}
                              style={{ background: '#e0f2fe', color: '#0284c7', border: '1px solid #bfdbfe', padding: '4px 8px' }}>입장체크</button>
                          )}
                          <button onClick={() => handleDeleteOrder(o.id)} style={{ background: 'none', border: 'none', color: 'var(--slate-400)', cursor: 'pointer', fontSize: 16 }}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 공연 추가 모달 */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-sheet" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>🎭 신규 공연 일정 등록</h3>
            <form onSubmit={handleAddShow} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>공연 타이틀</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="예: 7월 여름 정기 대공연" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>공연 날짜</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>장소</label>
                <input type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="예: 홍대 상상마당" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>티켓 1매당 가격 (원)</label>
                <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>공연 소개/설명</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3} placeholder="공연 설명 및 관객 예매 유의사항 기재" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddModal(false)}>취소</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }}>공연 등록</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
