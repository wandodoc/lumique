import { useState } from 'react';
import './PageStyles.css';

export default function PerformancePage() {
  const [performances, setPerformances] = useState(() => {
    const saved = localStorage.getItem('lumique_performances');
    return saved ? JSON.parse(saved) : [
      { id: 'show-2026-07', title: '7월 정기 쇼케이스 [LUMINESCENCE]', date: '2026-07-25', venue: '합정 드림홀', ticketPrice: 5000, desc: '루미크 7월 여름 정기 보컬/댄스 쇼케이스' },
      { id: 'show-2026-09', title: '9월 홍대 클럽 연합 밴드전', date: '2026-09-12', venue: '클럽 프리버드', ticketPrice: 10000, desc: '대학 연합 인디 라이브 밴드 경연 무대' }
    ];
  });

  const [orders, setOrders] = useState(() => {
    const saved = localStorage.getItem('lumique_ticket_orders');
    return saved ? JSON.parse(saved) : [
      { id: 'ord-1', showId: 'show-2026-07', name: '홍석주', phone: '010-1234-5678', quantity: 2, status: '확인', timestamp: '2026-07-12 12:30' },
      { id: 'ord-2', showId: 'show-2026-07', name: '김윤서', phone: '010-9876-5432', quantity: 1, status: '대기', timestamp: '2026-07-13 09:15' }
    ];
  });

  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newVenue, setNewVenue] = useState('');
  const [newPrice, setNewPrice] = useState(5000);
  const [newDesc, setNewDesc] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState('show-2026-07');
  const [copySuccessId, setCopySuccessId] = useState(null);

  const savePerformances = (list) => {
    setPerformances(list);
    localStorage.setItem('lumique_performances', JSON.stringify(list));
  };

  const handleAddShow = (e) => {
    e.preventDefault();
    if (!newTitle || !newDate || !newVenue) return alert('필수 항목을 입력해 주세요.');
    const newShow = {
      id: `show-${Date.now()}`,
      title: newTitle,
      date: newDate,
      venue: newVenue,
      ticketPrice: Number(newPrice),
      desc: newDesc
    };
    const updated = [...performances, newShow].sort((a, b) => a.date.localeCompare(b.date));
    savePerformances(updated);
    setSelectedShowId(newShow.id);
    setNewTitle('');
    setNewDate('');
    setNewVenue('');
    setNewPrice(5000);
    setNewDesc('');
    setShowAddModal(false);
  };

  const handleDeleteShow = (id) => {
    if (!window.confirm('해당 공연을 삭제하시겠습니까? 관련 예매 내역은 그대로 유지됩니다.')) return;
    const updated = performances.filter(p => p.id !== id);
    savePerformances(updated);
    if (selectedShowId === id && updated.length > 0) {
      setSelectedShowId(updated[0].id);
    }
  };

  const handleUpdateOrderStatus = (orderId, newStatus) => {
    const updated = orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o);
    setOrders(updated);
    localStorage.setItem('lumique_ticket_orders', JSON.stringify(updated));
  };

  const handleDeleteOrder = (orderId) => {
    if (!window.confirm('예매 내역을 정말 삭제하시겠습니까?')) return;
    const updated = orders.filter(o => o.id !== orderId);
    setOrders(updated);
    localStorage.setItem('lumique_ticket_orders', JSON.stringify(updated));
  };

  const handleCopyLink = (showId) => {
    const link = `${window.location.origin}/form/${showId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopySuccessId(showId);
      setTimeout(() => setCopySuccessId(null), 2000);
    });
  };

  const selectedShow = performances.find(p => p.id === selectedShowId);
  const showOrders = orders.filter(o => o.showId === selectedShowId);

  return (
    <div className="page fade-in">
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🎭 공연 및 관객 티켓 신청 관리</h2>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          + 신규 공연 추가
        </button>
      </div>

      {/* 공연 선택 및 정보 탭 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>
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
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--slate-800)', marginBottom: 4 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>📅 {p.date} | 📍 {p.venue}</div>
              </button>
            ))}
          </div>
        </div>

        {selectedShow && (
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="flex-between" style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 12, background: 'var(--blue-50)', color: 'var(--blue-600)', padding: '4px 10px', borderRadius: 8, fontWeight: 700 }}>
                  상세 정보
                </span>
                <button className="btn-sm" onClick={() => handleDeleteShow(selectedShow.id)} style={{ background: '#fef2f2', color: 'var(--red-500)', border: 'none' }}>
                  공연 삭제
                </button>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px 0', color: 'var(--slate-800)' }}>{selectedShow.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--slate-600)', margin: '0 0 16px 0', lineHeight: 1.4 }}>{selectedShow.desc || '공연 세부 설명이 없습니다.'}</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--slate-600)' }}>
                <span>📅 <strong>일시:</strong> {selectedShow.date}</span>
                <span>📍 <strong>장소:</strong> {selectedShow.venue}</span>
                <span>🪙 <strong>티켓가:</strong> {selectedShow.ticketPrice.toLocaleString()}원</span>
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

      {/* 티켓 예매자 명단 */}
      {selectedShow && (
        <div className="card card-pad">
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <span className="card-title" style={{ fontSize: 16, margin: 0 }}>
              🎟️ 관객 신청 명단 ({showOrders.reduce((sum, o) => sum + o.quantity, 0)}매 신청됨)
            </span>
          </div>

          {showOrders.length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>예매 신청자가 없습니다. 위 링크를 관객들에게 공유해보세요!</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 500 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--slate-200)', color: 'var(--slate-500)', fontWeight: 700, textAlign: 'left' }}>
                    <th style={{ padding: 12 }}>신청자</th>
                    <th style={{ padding: 12 }}>연락처</th>
                    <th style={{ padding: 12 }}>신청 매수</th>
                    <th style={{ padding: 12 }}>예매 금액</th>
                    <th style={{ padding: 12 }}>접수 시간</th>
                    <th style={{ padding: 12 }}>상태</th>
                    <th style={{ padding: 12, textAlign: 'right' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {showOrders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--slate-100)' }}>
                      <td style={{ padding: 12, fontWeight: 700, color: 'var(--slate-800)' }}>{o.name}</td>
                      <td style={{ padding: 12, color: 'var(--slate-600)' }}>{o.phone}</td>
                      <td style={{ padding: 12, fontWeight: 700 }}>{o.quantity}매</td>
                      <td style={{ padding: 12, color: 'var(--slate-700)' }}>{(o.quantity * selectedShow.ticketPrice).toLocaleString()}원</td>
                      <td style={{ padding: 12, fontSize: 12, color: 'var(--slate-400)' }}>{o.timestamp}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          backgroundColor: o.status === '확인' ? '#f0fdf4' : (o.status === '취소' ? '#fef2f2' : '#fffbeb'),
                          color: o.status === '확인' ? '#16a34a' : (o.status === '취소' ? '#dc2626' : '#d97706')
                        }}>{o.status}</span>
                      </td>
                      <td style={{ padding: 12, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn-sm" onClick={() => handleUpdateOrderStatus(o.id, '확인')} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '4px 8px' }}>확정</button>
                          <button className="btn-sm" onClick={() => handleUpdateOrderStatus(o.id, '취소')} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 8px' }}>취소</button>
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
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>공연 장소</label>
                <input type="text" value={newVenue} onChange={e => setNewVenue(e.target.value)} placeholder="예: 홍대 상상마당 라이브홀" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
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
