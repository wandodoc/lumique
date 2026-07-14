import { useEffect, useMemo, useState } from 'react';

const LS_SHOWS = 'lumique_concerts';
const LS_SHOWS_LEGACY = 'lumique_performances';
const LS_ORDERS = 'lumique_ticket_orders';
const TICKET_PRICE = 5000;
const SUPPORT_ACCOUNT = '국민은행 1001-7629-3105 김민결';

const FIELD_STYLE = {
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

const loadLS = (key) => {
  try {
    const value = localStorage.getItem(key);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatPhoneNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const migrateShows = (value) => {
  const next = Array.isArray(value) ? value : [];
  try {
    localStorage.setItem(LS_SHOWS, JSON.stringify(next));
    localStorage.removeItem(LS_SHOWS_LEGACY);
  } catch {}
  return next;
};

const formatDateTime = (dateStr, timeStr) => {
  if (!dateStr) return '';
  const dateObj = new Date(dateStr);
  if (Number.isNaN(dateObj.getTime())) return `${dateStr} ${timeStr || ''}`.trim();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const [year, month, day] = dateStr.split('-');
  return `${year}.${Number(month)}.${Number(day)} (${days[dateObj.getDay()]}) ${timeStr || '00:00'}`;
};

function SectionList({ sections = [] }) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  return sections
    .filter((section) => section.type === 'text')
    .map((section) => (
      <div key={section.id} style={{ marginTop: 20, padding: '14px 16px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>{section.title}</h3>
        <p style={{ fontSize: 14, color: '#4b5563', margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{section.content}</p>
      </div>
    ));
}

function CustomSectionsRenderer({ sections = [], values, setValues }) {
  const updateValue = (sectionId, nextValue) => setValues((prev) => ({ ...prev, [sectionId]: nextValue }));

  return sections.map((section) => {
    if (section.type === 'text') return null;

    if (section.type === 'input_text') {
      return (
        <div key={section.id} style={{ marginTop: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>
            {section.title}{section.required ? ' *' : ''}
          </label>
          <input type="text" value={values[section.id] || ''} onChange={(event) => updateValue(section.id, event.target.value)} style={FIELD_STYLE} placeholder={section.content || '답변을 입력해 주세요'} />
        </div>
      );
    }

    if (section.type === 'input_textarea') {
      return (
        <div key={section.id} style={{ marginTop: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>
            {section.title}{section.required ? ' *' : ''}
          </label>
          <textarea rows={4} value={values[section.id] || ''} onChange={(event) => updateValue(section.id, event.target.value)} style={FIELD_STYLE} placeholder={section.content || '답변을 입력해 주세요'} />
        </div>
      );
    }

    if (section.type === 'input_number') {
      const min = Number.isFinite(Number(section.min)) ? Number(section.min) : 1;
      const max = Number.isFinite(Number(section.max)) ? Number(section.max) : 10;
      const current = Number(values[section.id] ?? min);
      const safeValue = Number.isFinite(current) ? current : min;
      return (
        <div key={section.id} style={{ marginTop: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>
            {section.title}{section.required ? ' *' : ''}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={() => updateValue(section.id, Math.max(min, safeValue - 1))} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>-</button>
            <input
              type="number"
              min={min}
              max={max}
              value={Number.isFinite(safeValue) ? safeValue : ''}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isNaN(next)) return updateValue(section.id, '');
                updateValue(section.id, Math.min(Math.max(next, min), max));
              }}
              style={{ ...FIELD_STYLE, width: 110, textAlign: 'center' }}
            />
            <button type="button" onClick={() => updateValue(section.id, Math.min(max, safeValue + 1))} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>+</button>
          </div>
        </div>
      );
    }

    if (section.type === 'input_radio') {
      return (
        <div key={section.id} style={{ marginTop: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>
            {section.title}{section.required ? ' *' : ''}
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            {(section.options || []).map((option) => (
              <label key={option} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}>
                <input type="radio" checked={values[section.id] === option} onChange={() => updateValue(section.id, option)} />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (section.type === 'input_checkbox') {
      const selected = Array.isArray(values[section.id]) ? values[section.id] : [];
      return (
        <div key={section.id} style={{ marginTop: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>
            {section.title}{section.required ? ' *' : ''}
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            {(section.options || []).map((option) => {
              const checked = selected.includes(option);
              return (
                <label key={option} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => updateValue(section.id, checked ? selected.filter((item) => item !== option) : [...selected, option])}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  });
}

export default function TicketOrderForm({ showId }) {
  const [showInfo, setShowInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [isAfterParty, setIsAfterParty] = useState(false);
  const [afterPartyCount, setAfterPartyCount] = useState(1);
  const [comment, setComment] = useState('');
  const [customResponses, setCustomResponses] = useState({});

  useEffect(() => {
    document.title = 'Lumique 공연 신청 폼';
  }, []);

  useEffect(() => {
    const primary = loadLS(LS_SHOWS);
    const shows = primary.length > 0 ? primary : migrateShows(loadLS(LS_SHOWS_LEGACY));
    setShowInfo(shows.find((show) => show.id === showId) || null);
    setLoading(false);
  }, [showId]);

  const ticketPrice = showInfo?.price ?? TICKET_PRICE;
  const total = qty * ticketPrice;

  const validateCustomResponses = () => {
    const sections = Array.isArray(showInfo?.customSections) ? showInfo.customSections : [];
    for (const section of sections) {
      if (section.type === 'text') continue;
      const value = customResponses[section.id];
      if (section.required) {
        if (section.type === 'input_checkbox' && (!Array.isArray(value) || value.length === 0)) return `${section.title}을(를) 입력해 주세요.`;
        if ((section.type === 'input_text' || section.type === 'input_textarea' || section.type === 'input_radio') && !String(value || '').trim()) return `${section.title}을(를) 입력해 주세요.`;
        if (section.type === 'input_number') {
          const num = Number(value);
          if (Number.isNaN(num)) return `${section.title}은(는) 숫자로 입력해 주세요.`;
          if (num < Number(section.min ?? 1) || num > Number(section.max ?? 10)) return `${section.title}은(는) ${section.min ?? 1}~${section.max ?? 10} 범위여야 합니다.`;
        }
      }
      if (section.type === 'input_number' && String(value ?? '') !== '') {
        const num = Number(value);
        if (Number.isNaN(num) || num < Number(section.min ?? 1) || num > Number(section.max ?? 10)) return `${section.title}은(는) ${section.min ?? 1}~${section.max ?? 10} 범위여야 합니다.`;
      }
    }
    return null;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) return alert('성함을 입력해 주세요.');
    if (!phone.trim()) return alert('연락처를 입력해 주세요.');
    if (qty < 1) return alert('최소 1매 이상 예매해 주세요.');
    if (isAfterParty && afterPartyCount < 1) return alert('뒤풀이 참여 인원은 1명 이상이어야 합니다.');
    const customError = validateCustomResponses();
    if (customError) return alert(customError);

    const orders = loadLS(LS_ORDERS);
    const newOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      concertId: showId,
      audienceName: name.trim(),
      phone: phone.trim(),
      ticketCount: Number(qty),
      totalPrice: total,
      depositStatus: '입금대기',
      attendanceStatus: '미입장',
      isAfterParty,
      afterPartyCount: isAfterParty ? Number(afterPartyCount) : 0,
      comment: comment.trim(),
      customResponses,
    };

    try {
      localStorage.setItem(LS_ORDERS, JSON.stringify([...orders, newOrder]));
      setSubmitted(true);
    } catch {
      alert('예매 저장에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  const focusHandler = (event) => {
    event.target.style.borderColor = '#111827';
  };
  const blurHandler = (event) => {
    event.target.style.borderColor = '#e2e8f0';
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', background: '#f8fafc' }}><div style={{ fontSize: 15, color: '#94a3b8', fontWeight: 600 }}>불러오는 중...</div></div>;
  if (!showInfo) return <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100dvh', background: '#f8fafc', padding: 24, textAlign: 'center' }}><div style={{ fontSize: 52, marginBottom: 16 }}>🎭</div><h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>공연 정보를 찾을 수 없습니다</h2><p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>링크가 만료되었거나 잘못되었습니다.</p></div>;

  if (submitted) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: '#f8fafc', padding: '24px 16px' }}>
        <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 24, padding: '40px 28px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: '0 0 10px' }}>예매 신청 완료!</h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: '0 0 24px' }}>입금 확인 후 최종 확정됩니다.</p>
          <div style={{ background: '#111827', borderRadius: 16, padding: '20px', marginBottom: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>무통장 입금 계좌</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>{SUPPORT_ACCOUNT}</div>
            <div style={{ fontSize: 14, color: '#e5e7eb', marginTop: 8 }}>예매 금액: <strong>{total.toLocaleString()}원</strong></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: '100dvh', background: '#f8fafc', padding: '36px 16px 80px' }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
        {showInfo.imageUrl ? <div style={{ width: '100%', borderBottom: '1px solid #e2e8f0', background: '#fff', padding: 16 }}><img src={showInfo.imageUrl} alt={showInfo.title} style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} /></div> : null}
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#111827', letterSpacing: 1.5, background: '#f1f5f9', padding: '3px 8px', borderRadius: 4 }}>LUMIQUE TICKET</span></div>
          <h1 style={{ fontSize: 22, fontWeight: 950, color: '#111827', margin: '0 0 12px', lineHeight: 1.3 }}>Lumique 공연 신청 폼</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px' }}>
            <div style={{ display: 'flex', gap: 8, fontSize: 14 }}><span style={{ color: '#9ca3af' }}>일시</span><span style={{ fontWeight: 700, color: '#111827' }}>{formatDateTime(showInfo.date, showInfo.time)}</span></div>
            <div style={{ display: 'flex', gap: 8, fontSize: 14 }}><span style={{ color: '#9ca3af' }}>장소</span><span style={{ fontWeight: 700, color: '#111827' }}>{showInfo.location}</span></div>
            <div style={{ display: 'flex', gap: 8, fontSize: 14 }}><span style={{ color: '#9ca3af' }}>예매 가격</span><span style={{ fontWeight: 700, color: '#111827' }}>{ticketPrice.toLocaleString()}원 / 1매</span></div>
          </div>
          {showInfo.description ? <div style={{ marginTop: 20 }}><h3 style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>공연 소개</h3><p style={{ fontSize: 14, color: '#4b5563', margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{showInfo.description}</p></div> : null}
          <SectionList sections={showInfo.customSections} />
          <CustomSectionsRenderer sections={showInfo.customSections} values={customResponses} setValues={setCustomResponses} />
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div><label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>성함 *</label><input type="text" required placeholder="예) 김루미" value={name} onChange={(event) => setName(event.target.value)} style={FIELD_STYLE} onFocus={focusHandler} onBlur={blurHandler} /></div>
          <div><label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>연락처 *</label><input type="tel" required placeholder="예) 010-1234-5678" value={phone} onChange={(event) => setPhone(formatPhoneNumber(event.target.value))} inputMode="numeric" autoComplete="tel" style={FIELD_STYLE} onFocus={focusHandler} onBlur={blurHandler} /></div>
          <div><label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>예매 매수</label><div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><button type="button" onClick={() => setQty((value) => Math.max(1, value - 1))} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>-</button><span style={{ fontSize: 16, fontWeight: 500, minWidth: 52, textAlign: 'center', color: '#111827' }}>{qty}매</span><button type="button" onClick={() => setQty((value) => value + 1)} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>+</button><span style={{ fontSize: 13, color: '#94a3b8' }}>× {ticketPrice.toLocaleString()}원</span></div></div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>🍻 공연 후 뒤풀이에 참여하시겠습니까?</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setIsAfterParty(true); setAfterPartyCount((value) => Math.max(1, Number(value) || 1)); }} style={{ flex: 1, minWidth: 120, padding: '12px 14px', borderRadius: 12, border: isAfterParty ? '1.5px solid #111827' : '1px solid #e2e8f0', background: isAfterParty ? '#111827' : '#fff', color: isAfterParty ? '#fff' : '#475569', fontWeight: 800, cursor: 'pointer' }}>참여</button>
              <button type="button" onClick={() => setIsAfterParty(false)} style={{ flex: 1, minWidth: 120, padding: '12px 14px', borderRadius: 12, border: !isAfterParty ? '1.5px solid #111827' : '1px solid #e2e8f0', background: !isAfterParty ? '#111827' : '#fff', color: !isAfterParty ? '#fff' : '#475569', fontWeight: 800, cursor: 'pointer' }}>미참여</button>
            </div>
          </div>

          {isAfterParty ? (
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>뒤풀이 참여 인원은 몇 명인가요?</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button type="button" onClick={() => setAfterPartyCount((value) => Math.max(1, Number(value) - 1))} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>-</button>
                <span style={{ fontSize: 16, fontWeight: 500, minWidth: 52, textAlign: 'center', color: '#111827' }}>{afterPartyCount}명</span>
                <button type="button" onClick={() => setAfterPartyCount((value) => Number(value) + 1)} style={{ width: 42, height: 42, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>+</button>
              </div>
            </div>
          ) : null}

          <div><label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>하고 싶은 말 (선택)</label><textarea rows={3} placeholder="루미크 부원들에게 하고 싶은 말이나 응원 메시지를 자유롭게 남겨주세요! (선택)" value={comment} onChange={(event) => setComment(event.target.value)} style={FIELD_STYLE} /></div>

          <div style={{ background: '#111827', borderRadius: 16, padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 5 }}>무통장 입금 계좌</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', letterSpacing: 0.3, marginBottom: 8 }}>{SUPPORT_ACCOUNT}</div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 8, paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontWeight: 900 }}>
                <span style={{ fontSize: 14 }}>예매 금액</span>
                <span style={{ fontSize: 20 }}>{total.toLocaleString()}원</span>
              </div>
            </div>
          </div>

          <button type="submit" style={{ width: '100%', padding: '15px', borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer', marginTop: 4, boxShadow: '0 4px 12px rgba(17, 24, 39, 0.25)', transition: 'transform 0.1s' }}>
            예매 신청하기
          </button>
        </form>
      </div>
    </div>
  );
}
