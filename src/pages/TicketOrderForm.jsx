import { useState, useEffect } from 'react';
import './PageStyles.css';

export default function TicketOrderForm({ showId }) {
  const [showInfo, setShowInfo] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // LocalStorage에서 공연 정보 로드
    const shows = localStorage.getItem('lumique_performances');
    const showList = shows ? JSON.parse(shows) : [
      { id: 'show-2026-07', title: '7월 정기 쇼케이스 [LUMINESCENCE]', date: '2026-07-25', venue: '합정 드림홀', ticketPrice: 5000, desc: '루미크 7월 여름 정기 보컬/댄스 쇼케이스' },
      { id: 'show-2026-09', title: '9월 홍대 클럽 연합 밴드전', date: '2026-09-12', venue: '클럽 프리버드', ticketPrice: 10000, desc: '대학 연합 인디 라이브 밴드 경연 무대' }
    ];

    const found = showList.find(s => s.id === showId);
    setShowInfo(found || null);
    setLoading(false);
  }, [showId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return alert('성함을 입력해 주세요.');
    if (!phone.trim()) return alert('연락처를 입력해 주세요.');
    if (quantity < 1) return alert('최소 1매 이상 신청하셔야 합니다.');

    // LocalStorage에 오더 저장
    const savedOrders = localStorage.getItem('lumique_ticket_orders');
    const orderList = savedOrders ? JSON.parse(savedOrders) : [
      { id: 'ord-1', showId: 'show-2026-07', name: '홍석주', phone: '010-1234-5678', quantity: 2, status: '확인', timestamp: '2026-07-12 12:30' },
      { id: 'ord-2', showId: 'show-2026-07', name: '김윤서', phone: '010-9876-5432', quantity: 1, status: '대기', timestamp: '2026-07-13 09:15' }
    ];

    const now = new Date();
    const timestampStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newOrder = {
      id: `ord-${Date.now()}`,
      showId,
      name: name.trim(),
      phone: phone.trim(),
      quantity: Number(quantity),
      status: '대기',
      timestamp: timestampStr
    };

    const updated = [...orderList, newOrder];
    localStorage.setItem('lumique_ticket_orders', JSON.stringify(updated));
    setSubmitted(true);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ fontSize: 16, color: 'var(--slate-500)', fontWeight: 600 }}>공연 티켓 신청 폼 로딩 중...</div>
      </div>
    );
  }

  if (!showInfo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--slate-800)', marginBottom: 8 }}>공연 정보를 찾을 수 없습니다</h2>
        <p style={{ fontSize: 14, color: 'var(--slate-500)' }}>공연 링크가 만료되었거나 올바르지 않은 주소입니다.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: 16 }}>
        <div style={{
          maxWidth: '460px',
          width: '100%',
          background: '#ffffff',
          borderRadius: 24,
          padding: '40px 24px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--slate-800)', marginBottom: 12 }}>티켓 신청 완료!</h2>
          <p style={{ fontSize: 15, color: 'var(--slate-600)', marginBottom: 24, lineHeight: 1.6 }}>
            성공적으로 접수되었습니다.<br />
            현장에서 확인 후 입금 안내 등이 문자로 전송됩니다.
          </p>
          <div style={{ background: 'var(--slate-50)', padding: 16, borderRadius: 16, textAlign: 'left', marginBottom: 24, fontSize: 14 }}>
            <div style={{ marginBottom: 8 }}>🎭 <strong>공연:</strong> {showInfo.title}</div>
            <div style={{ marginBottom: 8 }}>👤 <strong>신청자:</strong> {name}</div>
            <div style={{ marginBottom: 8 }}>🎟️ <strong>수량:</strong> {quantity}매</div>
            <div>🪙 <strong>총 금액:</strong> {(quantity * showInfo.ticketPrice).toLocaleString()}원</div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--slate-400)' }}>문의사항은 동아리 루미크 운영진에게 연락 바랍니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: '24px 16px' }}>
      <div style={{
        maxWidth: '460px',
        width: '100%',
        background: '#ffffff',
        borderRadius: 24,
        padding: '32px 24px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)'
      }}>
        {/* 상단 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <img src="/logo.png" alt="Lumique" style={{ height: 16, width: 'auto' }} />
            <span style={{ fontFamily: '"Outfit", sans-serif', fontSize: 15, fontWeight: 800, color: '#475569' }}>Lumique</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '0 0 8px 0' }}>공연 티켓 예매 신청</h2>
          <p style={{ fontSize: 13, color: 'var(--slate-500)', margin: 0 }}>아래 폼을 입력하여 간편하게 예매 신청을 접수할 수 있습니다.</p>
        </div>

        {/* 공연 정보 요약 카드 */}
        <div style={{ background: '#f0f9ff', border: '1px solid #e0f2fe', padding: 16, borderRadius: 16, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0369a1', margin: '0 0 6px 0' }}>{showInfo.title}</h3>
          <p style={{ fontSize: 13, color: '#0284c7', margin: '0 0 12px 0', lineHeight: 1.4 }}>{showInfo.desc}</p>
          <div style={{ fontSize: 13, color: '#0369a1', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>📅 <strong>일시:</strong> {showInfo.date}</span>
            <span>📍 <strong>장소:</strong> {showInfo.venue}</span>
            <span>🪙 <strong>티켓가:</strong> {showInfo.ticketPrice.toLocaleString()}원 / 1매</span>
          </div>
        </div>

        {/* 예매 신청 폼 */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--slate-700)', fontWeight: 700, display: 'block', marginBottom: 6 }}>신청자 성함</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="홍길동"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--slate-200)', fontSize: 15 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--slate-700)', fontWeight: 700, display: 'block', marginBottom: 6 }}>연락처</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--slate-200)', fontSize: 15 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--slate-700)', fontWeight: 700, display: 'block', marginBottom: 6 }}>신청 매수</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: '1px solid var(--slate-200)',
                  background: '#ffffff',
                  fontSize: 20,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >-</button>
              <span style={{ fontSize: 18, fontWeight: 800, minWidth: 40, textAlign: 'center' }}>{quantity}매</span>
              <button
                type="button"
                onClick={() => setQuantity(q => q + 1)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: '1px solid var(--slate-200)',
                  background: '#ffffff',
                  fontSize: 20,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >+</button>
            </div>
          </div>

          <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--slate-100)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--slate-500)', fontWeight: 600 }}>총 결제 예정 금액</span>
              <strong style={{ fontSize: 20, fontWeight: 900, color: 'var(--slate-800)' }}>
                {(quantity * showInfo.ticketPrice).toLocaleString()}원
              </strong>
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', borderRadius: 12, fontSize: 16, fontWeight: 800 }}>
              예매 신청하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
