import { useEffect, useState } from 'react';
import './PageStyles.css';

const LS_SHOWS = 'lumique_concerts';
const LS_SHOWS_LEGACY = 'lumique_performances';
const LS_ORDERS = 'lumique_ticket_orders';
const SUPPORT_ACCOUNT = '토스뱅크 1001-7629-3105 강맥';
const PRICE = 5000;
const DEFAULT_TIME = '19:00';
const FIELD_STYLE = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' };

const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : []; } catch { return []; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
const migrate = (v) => { const n = Array.isArray(v) ? v : []; lsSet(LS_SHOWS, n); try { localStorage.removeItem(LS_SHOWS_LEGACY); } catch { } return n; };

const section = (s = {}) => ({
  id: String(s.id || '').trim(),
  type: s.type || 'text',
  title: String(s.title || '').trim(),
  content: String(s.content || '').trim(),
  options: Array.isArray(s.options) ? s.options.map(v => String(v || '').trim()).filter(Boolean) : [],
  min: Number.isFinite(Number(s.min)) ? Number(s.min) : 1,
  max: Number.isFinite(Number(s.max)) ? Number(s.max) : 10,
  required: Boolean(s.required)
});

const fmtDT = (d, t = DEFAULT_TIME) => {
  if (!d) return '-';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return `${d} ${t}`.trim();
  const w = ['일', '월', '화', '수', '목', '금', '토'];
  const [y, m, day] = d.split('-');
  return `${y}.${Number(m)}.${Number(day)} (${w[x.getDay()]}) ${t}`;
};

const formatPhone = (val) => {
  const raw = val.replace(/[^0-9]/g, '');
  if (raw.length <= 3) return raw;
  if (raw.length <= 7) return `${raw.slice(0,3)}-${raw.slice(3)}`;
  return `${raw.slice(0,3)}-${raw.slice(3,7)}-${raw.slice(7,11)}`;
};

// TextSections is removed as we will render everything inline.

function RenderSections({ sections = [], values, setValues, fixed }) {
  const set = (id, v) => setValues(p => ({ ...p, [id]: v }));
  return sections.filter(s => s.active !== false).map(s => {
    if (s.type === 'text') return (
      <div key={s.id} style={{ padding: '14px 16px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>{s.title}</h3>
        <p style={{ fontSize: 14, color: '#4b5563', margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s.content}</p>
      </div>
    );
    
    const label = <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 7 }}>{s.title}{s.required ? ' *' : ''}</label>;
    
    if (s.type === 'fixed_name') return (
      <div key={s.id}>
        {label}
        <input value={fixed.name} onChange={e => fixed.setName(e.target.value)} style={FIELD_STYLE} placeholder="실명을 입력해주세요" />
      </div>
    );

    if (s.type === 'fixed_phone') return (
      <div key={s.id}>
        {label}
        <input value={fixed.phone} onChange={e => fixed.setPhone(formatPhone(e.target.value))} style={FIELD_STYLE} placeholder="010-0000-0000" maxLength={13} />
      </div>
    );

    if (s.type === 'fixed_qty') return (
      <div key={s.id}>
        {label}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => fixed.setQty(Math.max(1, fixed.qty - 1))} style={{ width: 44, height: 44, borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 20, cursor: 'pointer' }}>-</button>
          <div style={{ fontSize: 16, fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{fixed.qty}매</div>
          <button type="button" onClick={() => fixed.setQty(Math.min(10, fixed.qty + 1))} style={{ width: 44, height: 44, borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 20, cursor: 'pointer' }}>+</button>
          <span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>x {Number(fixed.price || 0).toLocaleString()}원</span>
        </div>
      </div>
    );

    if (s.type === 'fixed_afterparty') return (
      <div key={s.id} style={{ padding: '20px', borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={fixed.isAfterParty} onChange={e => fixed.setIsAfterParty(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{s.title}</span>
        </label>
        {fixed.isAfterParty && (
          <div style={{ marginTop: 16, pt: 16, borderTop: '1px dotted #e2e8f0' }}>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 8 }}>뒤풀이 참여 인원 (본인 포함)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" onClick={() => fixed.setAfterPartyCount(Math.max(1, fixed.afterPartyCount - 1))} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>-</button>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{fixed.afterPartyCount}명</span>
              <button type="button" onClick={() => fixed.setAfterPartyCount(fixed.afterPartyCount + 1)} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>+</button>
            </div>
          </div>
        )}
      </div>
    );

    if (s.type === 'input_text') return <div key={s.id}>{label}<input type="text" value={values[s.id] || ''} onChange={(e) => set(s.id, e.target.value)} style={FIELD_STYLE} placeholder={s.content || '답변을 입력해주세요.'} /></div>;
    if (s.type === 'input_textarea') return <div key={s.id}>{label}<textarea rows={4} value={values[s.id] || ''} onChange={(e) => set(s.id, e.target.value)} style={FIELD_STYLE} placeholder={s.content || '답변을 입력해주세요.'} /></div>;
    
    if (s.type === 'input_number') {
      const min = s.min ?? 1;
      const max = s.max ?? 10;
      const val = Number(values[s.id] ?? min);
      return (
        <div key={s.id}>
          {label}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={() => set(s.id, Math.max(min, val - 1))} style={{ width: 40, height: 40, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 18, cursor: 'pointer' }}>-</button>
            <div style={{ fontSize: 16, fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{val}</div>
            <button type="button" onClick={() => set(s.id, Math.min(max, val + 1))} style={{ width: 40, height: 40, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 18, cursor: 'pointer' }}>+</button>
          </div>
        </div>
      );
    }
    
    if (s.type === 'input_radio' || s.type === 'input_checkbox') {
      const isMulti = s.type === 'input_checkbox';
      const cur = isMulti ? (values[s.id] || []) : values[s.id];
      return (
        <div key={s.id}>
          {label}
          <div style={{ display: 'grid', gap: 8 }}>
            {(s.options || []).map(opt => {
              const active = isMulti ? cur.includes(opt) : cur === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    if (isMulti) {
                      set(s.id, active ? cur.filter(v => v !== opt) : [...cur, opt]);
                    } else {
                      set(s.id, opt);
                    }
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1.5px solid ${active ? '#111827' : '#e2e8f0'}`,
                    background: active ? '#111827' : '#fff',
                    color: active ? '#fff' : '#4b5563',
                    textAlign: 'left',
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  });
}

const toast = (msg) => window.alert(msg);

export default function TicketOrderForm({ showId }) {
  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [isAfterParty, setIsAfterParty] = useState(false);
  const [afterPartyCount, setAfterPartyCount] = useState(1);
  const [comment, setComment] = useState('');
  const [customResponses, setCustomResponses] = useState({});

  useEffect(() => {
    document.title = 'Lumique 공연 신청 폼';
    const primary = lsGet(LS_SHOWS);
    const shows = primary.length ? primary : migrate(lsGet(LS_SHOWS_LEGACY));
    const found = shows.find(s => s.id === showId);
    if (found) {
      setShow({ ...found, customSections: (found.customSections || []).map(section) });
    }
    setLoading(false);
  }, [showId]);

  // UI Polishing: Quantity selection UI
  // Reliability: Use optional chaining when accessing show data
  const price = show?.price ?? PRICE;
  const total = qty * price;

  const copyAccount = () => {
    navigator.clipboard.writeText(SUPPORT_ACCOUNT);
    toast('계좌 번호가 복사되었습니다.');
  };

  const submit = (e) => {
    e.preventDefault();
    // Validate required fields explicitly if they are active
    const activeFixedName = show?.customSections?.find(s => s.type === 'fixed_name' && s.active !== false);
    const activeFixedPhone = show?.customSections?.find(s => s.type === 'fixed_phone' && s.active !== false);
    const activeFixedQty = show?.customSections?.find(s => s.type === 'fixed_qty' && s.active !== false);

    if (activeFixedName && activeFixedName.required && !name.trim()) return toast(`${activeFixedName.title}을(를) 입력해주세요.`);
    if (activeFixedPhone && activeFixedPhone.required && !phone.trim()) return toast(`${activeFixedPhone.title}을(를) 입력해주세요.`);
    if (activeFixedQty && activeFixedQty.required && qty < 1) return toast(`${activeFixedQty.title}은(는) 1매 이상이어야 합니다.`);
    
    // Validate custom sections using optional chaining
    for (const s of (show?.customSections || [])) {
      if (s.type === 'text' || s.type.startsWith('fixed_') || s.active === false) continue;
      const v = customResponses[s.id];
      if (s.required) {
        if (s.type === 'input_checkbox' && (!v || v.length === 0)) return toast(`${s.title}을(를) 선택해주세요.`);
        if (!v || String(v).trim() === '') return toast(`${s.title}을(를) 입력해주세요.`);
      }
    }

    const orders = lsGet(LS_ORDERS);
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
      createdAt: new Date().toISOString()
    };
    
    lsSet(LS_ORDERS, [...orders, newOrder]);
    setDone(true);
    window.scrollTo(0, 0);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh' }}>불러오는 중...</div>;
  if (!show) return <div style={{ textAlign: 'center', padding: 50 }}>공연 정보를 찾을 수 없습니다.</div>;

  if (done) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: '#f8fafc', padding: 20 }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 24, padding: 40, boxShadow: '0 10px 40px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
        <div style={{ fontSize: 50, marginBottom: 20 }}>🎉</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 10px' }}>예매 신청 완료!</h2>
        <p style={{ color: '#64748b', fontSize: 14, mb: 30 }}>입금 확인 후 최종 확정됩니다.</p>
        <div style={{ background: '#111827', borderRadius: 20, padding: 24, margin: '24px 0' }}>
          <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>입금 계좌 정보</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{SUPPORT_ACCOUNT}</span>
            <button onClick={copyAccount} style={{ background: '#374151', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>복사</button>
          </div>
          <div style={{ marginTop: 16, pt: 16, borderTop: '1px solid #374151', color: '#fff', fontSize: 15 }}>
            입금 금액: <strong>{total.toLocaleString()}원</strong>
          </div>
        </div>
        <button onClick={() => window.location.reload()} className="btn-secondary" style={{ width: '100%' }}>새로 신청하기</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: '100dvh', background: '#f8fafc', padding: '40px 16px' }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {show.imageUrl && <img src={show.imageUrl} style={{ width: '100%', display: 'block' }} />}
        <div style={{ padding: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 950, margin: '0 0 16px' }}>{show.title}</h1>
          <div style={{ background: '#f8fafc', borderRadius: 16, padding: 16, display: 'grid', gap: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 14 }}><span style={{ color: '#64748b', minWidth: 60 }}>일시</span><span style={{ fontWeight: 700 }}>{fmtDT(show.date, show.time)}</span></div>
            <div style={{ display: 'flex', gap: 10, fontSize: 14 }}><span style={{ color: '#64748b', minWidth: 60 }}>장소</span><span style={{ fontWeight: 700 }}>{show.location}</span></div>
            <div style={{ display: 'flex', gap: 10, fontSize: 14 }}><span style={{ color: '#64748b', minWidth: 60 }}>티켓 금액</span><span style={{ fontWeight: 700 }}>{price.toLocaleString()}원 / 1매</span></div>
          </div>

          <form onSubmit={submit} style={{ marginTop: 32 }}>
            <div style={{ display: 'grid', gap: 24 }}>
              {show.description && (
                <div style={{ fontSize: 14, color: '#4b5563', whiteSpace: 'pre-wrap', lineHeight: 1.6, paddingBottom: 16 }}>
                  {show.description}
                </div>
              )}

              <RenderSections 
                sections={show.customSections} 
                values={customResponses} 
                setValues={setCustomResponses} 
                fixed={{ name, setName, phone, setPhone, qty, setQty, isAfterParty, setIsAfterParty, afterPartyCount, setAfterPartyCount, price }} 
              />

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>기타 남기실 말씀</label>
                <textarea value={comment} onChange={e => setComment(e.target.value)} style={{ ...FIELD_STYLE, height: 80 }} placeholder="추가 문의사항이 있다면 적어주세요" />
              </div>

              <div style={{ marginTop: 20, padding: 24, background: '#111827', borderRadius: 20, color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, color: '#9ca3af' }}>총 결제 금액</span>
                  <span style={{ fontSize: 22, fontWeight: 950 }}>{total.toLocaleString()}원</span>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
                  무통장 입금: {SUPPORT_ACCOUNT} <br />
                  * 신청 후 24시간 이내 입금 부탁드립니다.
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ height: 56, fontSize: 16, fontWeight: 800 }}>신청 완료하기</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
