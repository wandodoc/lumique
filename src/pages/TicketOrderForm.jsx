import { useState, useEffect } from 'react';

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

export default function TicketOrderForm({ showId }) {
  const [showInfo, setShowInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [support, setSupport] = useState('');

  useEffect(() => {
    const shows = loadLS(LS_SHOWS);
    const found = shows.find(s => s.id === showId);
    setShowInfo(found || null);
    setLoading(false);
  }, [showId]);

  const ticketPrice = showInfo?.price ?? TICKET_PRICE;
  const supportNum = Number(support) || 0;
  const total = qty * ticketPrice + supportNum;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return alert('성함을 입력해 주세요.');
    if (!phone.trim()) return alert('연락처를 입력해 주세요.');
    if (qty < 1) return alert('최소 1매 이상 신청하셔야 합니다.');

    const orders = loadLS(LS_ORDERS);
    const newOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      concertId: showId,
      audienceName: name.trim(),
      phone: phone.trim(),
      ticketCount: Number(qty),
      supportAmount: supportNum,
      totalPrice: total,
      depositStatus: '입금대기',
      attendanceStatus: '미입장',
    };
    saveLS(LS_ORDERS, [...orders, newOrder]);
    setSubmitted(true);
  };

  const inputStyle = {
    width: '100%',
    padding: '13px 16px',
    borderRadius: 12,
    border: '1.5px solid #e2e8f0',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    background: '#fff',
    transition: 'border-color 0.15s',
  };
  const focusHandler = e => e.target.style.borderColor = '#3b82f6';
  const blurHandler = e => e.target.style.borderColor = '#e2e8f0';

  /* ── 로딩 ── */
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', background: '#f8fafc' }}>
        <div style={{ fontSize: 15, color: '#94a3b8', fontWeight: 600 }}>불러오는 중...</div>
      </div>
    );
  }

  /* ── 공연 없음 ── */
  if (!showInfo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100dvh', background: '#f8fafc', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>공연 정보를 찾을 수 없습니다</h2>
        <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>링크가 만료되었거나 잘못된 주소입니다.</p>
      </div>
    );
  }

  /* ── 신청 완료 ── */
  if (submitted) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: '#f8fafc', padding: '24px 16px' }}>
        <div style={{
          maxWidth: 460, width: '100%', background: '#fff',
          borderRadius: 24, padding: '40px 28px',
          boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1e293b', margin: '0 0 10px' }}>예매 신청 완료!</h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: '0 0 24px' }}>
            신청이 접수되었습니다.<br />아래 계좌로 입금 후 운영진이 확인하면 완료됩니다.
          </p>

          {/* 입금 안내 박스 */}
          <div style={{
            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
            borderRadius: 16, padding: '20px', marginBottom: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, marginBottom: 6 }}>무통장 입금 계좌</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>{SUPPORT_ACCOUNT}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 8 }}>
              입금 금액: <strong>{total.toLocaleString()}원</strong>
            </div>
          </div>

          {/* 신청 요약 */}
          <div style={{ background: '#f8fafc', borderRadius: 14, padding: '16px', textAlign: 'left', marginBottom: 24 }}>
            {[
              ['공연', showInfo.title],
              ['신청자', name],
              ['매수', `${qty}매`],
              ['자율 후원금', `${supportNum.toLocaleString()}원`],
              ['총 입금 금액', `${total.toLocaleString()}원`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>{k}</span>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>문의: 동아리 루미크 운영진</p>
        </div>
      </div>
    );
  }

  /* ── 메인 폼 ── */
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: '100dvh', background: '#f1f5f9', padding: '24px 16px 60px' }}>
      <div style={{
        maxWidth: 460, width: '100%', background: '#fff',
        borderRadius: 24, overflow: 'hidden',
        boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)',
      }}>
        {/* 헤더 배너 */}
        <div style={{
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
          padding: '28px 24px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <img src="/logo.png" alt="Lumique" style={{ height: 18, width: 'auto', opacity: 0.9 }} onError={e => e.target.style.display = 'none'} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 }}>LUMIQUE</span>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 5px' }}>{showInfo.title}</h1>
          {showInfo.description && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px', lineHeight: 1.5 }}>{showInfo.description}</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: 20 }}>📅 {showInfo.date}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: 20 }}>📍 {showInfo.location}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: 20 }}>🪙 {ticketPrice.toLocaleString()}원/매</span>
          </div>
        </div>

        {/* 폼 영역 */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>성함 *</label>
            <input
              type="text" required placeholder="홍길동"
              value={name} onChange={e => setName(e.target.value)}
              style={inputStyle} onFocus={focusHandler} onBlur={blurHandler}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>연락처 *</label>
            <input
              type="tel" required placeholder="010-0000-0000"
              value={phone} onChange={e => setPhone(e.target.value)}
              style={inputStyle} onFocus={focusHandler} onBlur={blurHandler}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>신청 매수</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                type="button"
                onClick={() => setQty(q => Math.max(1, q - 1))}
                style={{
                  width: 44, height: 44, borderRadius: 12, border: '1.5px solid #e2e8f0',
                  background: '#f8fafc', fontSize: 22, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', flexShrink: 0,
                }}>−</button>
              <span style={{ fontSize: 22, fontWeight: 900, minWidth: 60, textAlign: 'center', color: '#1e293b' }}>{qty}매</span>
              <button
                type="button"
                onClick={() => setQty(q => q + 1)}
                style={{
                  width: 44, height: 44, borderRadius: 12, border: '1.5px solid #e2e8f0',
                  background: '#f8fafc', fontSize: 22, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', flexShrink: 0,
                }}>+</button>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>× {ticketPrice.toLocaleString()}원</span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
              💸 자율 후원금 <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>(선택)</span>
            </label>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 7px' }}>루미크 후원을 원하신다면 추가 금액을 입력해 주세요 🙏</p>
            <div style={{ position: 'relative' }}>
              <input
                type="number" min="0" step="1000" placeholder="0"
                value={support} onChange={e => setSupport(e.target.value)}
                style={{ ...inputStyle, paddingRight: 36 }}
                onFocus={focusHandler} onBlur={blurHandler}
              />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94a3b8', pointerEvents: 'none' }}>원</span>
            </div>
          </div>

          {/* 무통장 입금 안내 박스 */}
          <div style={{
            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
            borderRadius: 16, padding: '18px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, marginBottom: 5 }}>무통장 입금 계좌</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', letterSpacing: 0.3, marginBottom: 8 }}>{SUPPORT_ACCOUNT}</div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
              <span>티켓 ({qty}매)</span>
              <span>{(qty * ticketPrice).toLocaleString()}원</span>
            </div>
            {supportNum > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                <span>자율 후원금</span>
                <span>+{supportNum.toLocaleString()}원</span>
              </div>
            )}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.25)', marginTop: 8, paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontWeight: 900 }}>
                <span style={{ fontSize: 14 }}>총 입금 예정 금액</span>
                <span style={{ fontSize: 22 }}>{total.toLocaleString()}원</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            style={{
              width: '100%', padding: '15px', borderRadius: 14,
              border: 'none', background: '#2563eb', color: '#fff',
              fontWeight: 900, fontSize: 16, cursor: 'pointer',
              marginTop: 4,
              boxShadow: '0 4px 16px rgba(37, 99, 235, 0.35)',
              transition: 'transform 0.1s',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            예매 신청하기 →
          </button>
          <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', margin: '-4px 0 0' }}>신청 후 위 계좌로 입금하시면 접수가 완료됩니다.</p>
        </form>
      </div>
    </div>
  );
}
