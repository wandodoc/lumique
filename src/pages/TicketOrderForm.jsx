import { useEffect, useRef, useState } from 'react';
import './PageStyles.css';

const SUPPORT_ACCOUNT = '토스뱅크 1001-7629-3105 강맥';
const PRICE = 5000;
const DEFAULT_TIME = '19:00';
const FIELD_STYLE = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' };


import { firebaseStorage } from '../utils/firebaseStorage';
import { resolveActivePrice, formatCountdown, countSoldByTier, openTiersWithAvailability } from '../utils/pricing';
import { resolveShowByFormId } from '../utils/performances';

const section = (s = {}) => ({
  id: String(s.id || '').trim(),
  type: s.type || 'text',
  title: String(s.title || '').trim(),
  content: String(s.content || '').trim(),
  options: Array.isArray(s.options) ? s.options.map(v => String(v || '').trim()).filter(Boolean) : [],
  min: Number.isFinite(Number(s.min)) ? Number(s.min) : 1,
  max: Number.isFinite(Number(s.max)) ? Number(s.max) : 10,
  required: Boolean(s.required),
  active: s.active !== false,
  placement: s.placement === 'inline' ? 'inline' : 'popup'
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

    if (s.type === 'fixed_qty') {
      // 기간별/한정 수량 가격이 설정된 공연: 구간별로 매수를 따로 선택한다.
      // (예: 얼리버드 잔여 1매뿐이어도, 얼리버드 1매 + 일반 1매처럼 둘 다 선택 가능)
      if (Array.isArray(fixed.tiers) && fixed.tiers.length > 0) {
        return (
          <div key={s.id}>
            {label}
            <div style={{ display: 'grid', gap: 8 }}>
              {fixed.tiers.map(t => {
                const count = fixed.tierQty[t.id] || 0;
                const max = t.max;
                const closed = max <= 0;
                return (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '10px 12px', borderRadius: 12, border: '1px solid #e2e8f0',
                    background: closed ? '#f8fafc' : '#fff'
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: closed ? '#94a3b8' : '#111827' }}>
                        {t.label || '일반'} <span style={{ fontWeight: 700, color: '#64748b' }}>· {Number(t.price || 0).toLocaleString()}원</span>
                      </div>
                      {t.remainingQty != null && (
                        <div style={{ fontSize: 11, color: closed ? '#ef4444' : '#94a3b8', marginTop: 2 }}>
                          {closed ? '마감' : `잔여 ${t.remainingQty}매`}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => fixed.setTierQty(t.id, Math.max(0, count - 1))}
                        disabled={count <= 0}
                        style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 18, cursor: count <= 0 ? 'not-allowed' : 'pointer', opacity: count <= 0 ? 0.4 : 1 }}
                      >-</button>
                      <span style={{ fontSize: 15, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{count}</span>
                      <button
                        type="button"
                        onClick={() => fixed.setTierQty(t.id, Math.min(max, count + 1))}
                        disabled={count >= max}
                        style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 18, cursor: count >= max ? 'not-allowed' : 'pointer', opacity: count >= max ? 0.4 : 1 }}
                      >+</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', textAlign: 'right' }}>총 {fixed.qty}매</div>
          </div>
        );
      }

      // 기간별 가격이 없는 일반 공연: 단일 매수 스테퍼.
      return (
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
    }

    if (s.type === 'fixed_afterparty') return (
      <div key={s.id} style={{ padding: '20px', borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          공연 종료 후 참여자들과 함께하는 뒤풀이 자리가 마련될 예정입니다.{'\n'}참여를 원하시는 분은 예매 신청 시 뒤풀이 참여 여부를 선택해 주세요.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={fixed.isAfterParty} onChange={e => fixed.setIsAfterParty(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{s.title}</span>
        </label>
        {fixed.isAfterParty && (
          <div style={{ marginTop: 16, borderTop: '1px dotted #e2e8f0', paddingTop: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 8 }}>
                뒤풀이 참여 인원 (본인 포함) &nbsp;
                <span style={{ color: '#94a3b8' }}>티켓 {fixed.qty}매 기준 최대 {fixed.qty}명</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" onClick={() => fixed.setAfterPartyCount(Math.max(1, fixed.afterPartyCount - 1))} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 18 }}>-</button>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{fixed.afterPartyCount}명</span>
                <button
                  type="button"
                  onClick={() => {
                    if (fixed.afterPartyCount >= fixed.qty) {
                      window.alert(`뒤풀이 인원은 티켓 매수(${fixed.qty}매)를 초과할 수 없습니다.`);
                      return;
                    }
                    fixed.setAfterPartyCount(fixed.afterPartyCount + 1);
                  }}
                  style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 18 }}
                >+</button>
                {fixed.afterPartyCount >= fixed.qty && (
                  <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>매수 제한 도달</span>
                )}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: '#64748b' }}>초대자 이름 (테이블 배치를 위해 필요합니다)</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={fixed.noInviter} onChange={e => { fixed.setNoInviter(e.target.checked); if (e.target.checked) fixed.setInviterName(''); }} style={{ width: 16, height: 16 }} />
                  없음
                </label>
              </div>
              {!fixed.noInviter && (() => {
                const names = fixed.inviterName ? fixed.inviterName.split(',') : [''];
                const updateNames = (arr) => fixed.setInviterName(arr.join(','));
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {names.map((name, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="text"
                          value={name}
                          onChange={e => {
                            const next = [...names];
                            next[idx] = e.target.value;
                            updateNames(next);
                          }}
                          style={{ ...FIELD_STYLE, flex: 1 }}
                          placeholder={`초대자 이름 ${idx + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (names.length <= 1) return;
                            const next = names.filter((_, i) => i !== idx);
                            updateNames(next);
                          }}
                          disabled={names.length <= 1}
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            border: '1px solid #cbd5e1', background: '#f1f5f9',
                            color: '#64748b', cursor: names.length <= 1 ? 'not-allowed' : 'pointer',
                            fontSize: 14, fontWeight: 700, lineHeight: 1,
                            opacity: names.length <= 1 ? 0.4 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}
                          title="삭제"
                        >×</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateNames([...names, ''])}
                      style={{
                        width: '100%', padding: '7px 0', borderRadius: 8,
                        border: '1.5px dashed #cbd5e1', background: 'transparent',
                        color: '#94a3b8', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      }}
                    >+ 초대자 추가</button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );

    if (s.type === 'fixed_comment') return (
      <div key={s.id}>
        {label}
        <textarea value={fixed.comment} onChange={e => fixed.setComment(e.target.value)} style={{ ...FIELD_STYLE, height: 80 }} placeholder={s.content || "추가 문의사항이 있다면 적어주세요"} />
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

// ── Bottom Sheet ──────────────────────────────────────────────────────────────
function AccountCard({ account }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(account).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{ background: '#111827', borderRadius: 16, padding: '16px 18px', color: '#fff' }}>
      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>입금 계좌</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 900, color: '#fff', letterSpacing: '-0.01em' }}>{account}</span>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            flexShrink: 0,
            padding: '6px 14px',
            borderRadius: 10,
            border: 'none',
            background: copied ? '#10b981' : '#374151',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.2s',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {copied ? '✓ 복사됨' : '복사'}
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
        * 신청 후 24시간 이내 입금 부탁드립니다.
      </div>
    </div>
  );
}

function BottomSheet({ isOpen, onClose, show, price, total, qty, setQty, tiers, tierQty, setTierQty, priceItems, soldOut,
  name, setName, phone, setPhone,
  isAfterParty, setIsAfterParty, afterPartyCount, setAfterPartyCount,
  inviterName, setInviterName, noInviter, setNoInviter,
  comment, setComment, customResponses, setCustomResponses,
  submitting, onSubmit }) {

  const sheetRef = useRef(null);

  // 키보드 활성화 시 스크롤 보정
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => {
      if (sheetRef.current) sheetRef.current.scrollTop = 0;
    };
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, [isOpen]);

  // body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'rgba(0,0,0,0.5)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 901,
          background: '#fff',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
          maxHeight: '82dvh',
          overflowY: 'auto',
          transform: isOpen ? 'translateY(0)' : 'translateY(105%)',
          transition: 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        }}
      >
        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#d1d5db' }} />
        </div>

        {/* Sheet header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 16px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0, color: '#111827' }}>예매 신청</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#f1f5f9', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
          >✕</button>
        </div>

        {/* Form body */}
        <form onSubmit={onSubmit}>
          <div style={{ padding: '0 20px', display: 'grid', gap: 20 }}>
            <RenderSections
              sections={(show?.customSections || []).filter(s => s.placement !== 'inline')}
              values={customResponses}
              setValues={setCustomResponses}
              fixed={{ name, setName, phone, setPhone, qty, setQty, tiers, tierQty, setTierQty, isAfterParty, setIsAfterParty, afterPartyCount, setAfterPartyCount, inviterName, setInviterName, noInviter, setNoInviter, price, comment, setComment }}
            />

            {/* 결제 요약 */}
            <div style={{ background: '#111827', borderRadius: 20, padding: '20px', color: '#fff', marginTop: 4, display: 'grid', gap: 14 }}>
              {priceItems && priceItems.length > 1 && (
                <div style={{ display: 'grid', gap: 6, paddingBottom: 10, borderBottom: '1px solid #374151' }}>
                  {priceItems.map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#d1d5db' }}>
                      <span>{it.label || '일반'} {it.qty}매 × {it.price.toLocaleString()}원</span>
                      <span>{(it.price * it.qty).toLocaleString()}원</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#9ca3af' }}>총 결제 금액</span>
                <span style={{ fontSize: 22, fontWeight: 950 }}>{total.toLocaleString()}원</span>
              </div>
              <AccountCard account={SUPPORT_ACCOUNT} />
            </div>

            {/* 제출 버튼 */}
            <button
              type="submit"
              disabled={submitting || soldOut || qty < 1}
              style={{
                width: '100%', height: 56, borderRadius: 16,
                background: (submitting || soldOut || qty < 1) ? '#4b5563' : '#111827',
                color: '#fff', fontSize: 16, fontWeight: 800,
                border: 'none', cursor: (submitting || soldOut || qty < 1) ? 'not-allowed' : 'pointer',
                marginBottom: 8,
                transition: 'background 0.2s, opacity 0.2s',
                opacity: (submitting || soldOut || qty < 1) ? 0.7 : 1,
              }}
            >
              {soldOut ? '매진되었습니다' : submitting ? '처리 중...' : '예매하기'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TicketOrderForm({ showId }) {
  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [posterIdx, setPosterIdx] = useState(0);
  const posterScrollRef = useRef(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1); // 기간별 가격이 없는 공연용 단일 매수
  const [tierQty, setTierQtyState] = useState({}); // 기간별 가격 공연용: { [tierId]: 매수 }
  const [isAfterParty, setIsAfterParty] = useState(false);
  const [afterPartyCount, setAfterPartyCount] = useState(1);
  const [inviterName, setInviterName] = useState('');
  const [noInviter, setNoInviter] = useState(false);
  const [comment, setComment] = useState('');
  const [customResponses, setCustomResponses] = useState({});

  const [now, setNow] = useState(() => new Date());
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    document.title = 'Lumique 공연 예매';
    async function fetchShow() {
      const shows = (await firebaseStorage.loadConcerts()) || [];
      // 자동 생성 id(show-legacy-YYYY-MM-DD)로 공유된 링크는 같은 날짜의 공연으로 연결한다.
      // (2026-10-27 데이터 복구 과정에서 잠시 그 id로 예매 링크가 나간 적이 있다)
      const legacyDate = showId?.startsWith('show-legacy-') ? showId.slice('show-legacy-'.length) : null;
      const found = resolveShowByFormId(shows, showId)
        || (legacyDate ? shows.find(s => s.date === legacyDate && !s.deletedAt) : undefined);
      if (found) {
        setShow({ ...found, customSections: (found.customSections || []).map(section) });
      }
      setLoading(false);
    }
    fetchShow();
  }, [showId]);

  const hasQuantityLimitedTier = show?.pricingMode === 'tiered'
    && (show.priceTiers || []).some(t => Number(t.quantityLimit) > 0);

  // 한정 수량 구간이 있으면 잔여 수량을 파악하기 위해 주문 목록을 불러오고,
  // 다른 사람의 구매로 잔여량이 바뀔 수 있으므로 주기적으로 갱신한다.
  useEffect(() => {
    if (!hasQuantityLimitedTier) return;
    let cancelled = false;
    const refresh = async () => {
      const list = await firebaseStorage.loadOrders();
      if (!cancelled) setOrders(list);
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [hasQuantityLimitedTier]);

  // 기간별(얼리버드 등) 가격이 설정된 공연이면 1초마다 현재 적용 가격/카운트다운을 갱신한다.
  useEffect(() => {
    if (show?.pricingMode !== 'tiered') return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [show?.pricingMode]);

  // Legacy shared links can use a date-based ID while `show` resolves to the
  // canonical Firestore show. Count legacy orders with the canonical show too,
  // so entry points using either link display the same remaining quantity.
  const canonicalShowId = show?.id || showId;
  const legacyShowId = show?.date ? `show-legacy-${show.date}` : null;
  const soldOrders = orders
    .filter(order => [canonicalShowId, showId, legacyShowId].includes(order.concertId))
    .map(order => ({ ...order, concertId: canonicalShowId }));
  const soldByTier = countSoldByTier(soldOrders, canonicalShowId, show?.priceTiers || []);
  const { price: resolvedPrice, tier: activeTier, nextCutoff, nextTier, remainingQty, soldOut } = resolveActivePrice(show, now, soldByTier);
  const price = resolvedPrice || PRICE;

  // 기간별/한정 수량 가격 구간: 구간별로 매수를 따로 선택하게 한다(얼리버드 잔여 1매뿐이어도
  // 얼리버드 1매 + 일반 1매처럼 선택 가능). 날짜로 마감된 구간은 목록에서 제외된다.
  const openTiers = openTiersWithAvailability(show, now, soldByTier, 10);
  const isTieredShow = openTiers.length > 0;

  const setTierQty = (tierId, value) => setTierQtyState(p => ({ ...p, [tierId]: Math.max(0, value) }));

  const priceItems = isTieredShow
    ? openTiers.filter(t => (tierQty[t.id] || 0) > 0).map(t => ({ tierId: t.id, label: t.label, price: Number(t.price) || 0, qty: tierQty[t.id] }))
    : (qty > 0 ? [{ tierId: null, label: '', price, qty }] : []);
  const total = priceItems.reduce((sum, it) => sum + it.price * it.qty, 0);
  const totalQty = isTieredShow
    ? openTiers.reduce((sum, t) => sum + (tierQty[t.id] || 0), 0)
    : qty;

  const copyAccount = () => {
    navigator.clipboard.writeText(SUPPORT_ACCOUNT);
    toast('계좌 번호가 복사되었습니다.');
  };

  const submit = (e) => {
    e.preventDefault();
    const activeFixedName = show?.customSections?.find(s => s.type === 'fixed_name' && s.active !== false);
    const activeFixedPhone = show?.customSections?.find(s => s.type === 'fixed_phone' && s.active !== false);
    const activeFixedQty = show?.customSections?.find(s => s.type === 'fixed_qty' && s.active !== false);

    if (soldOut) return toast('죄송합니다. 해당 가격대가 매진되어 더 이상 신청할 수 없습니다.');
    if (totalQty < 1) return toast('신청 매수를 선택해주세요.');

    if (activeFixedName && activeFixedName.required && !name.trim()) return toast(`${activeFixedName.title}을(를) 입력해주세요.`);
    if (activeFixedPhone && activeFixedPhone.required && !phone.trim()) return toast(`${activeFixedPhone.title}을(를) 입력해주세요.`);
    if (activeFixedQty && activeFixedQty.required && totalQty < 1) return toast(`${activeFixedQty.title}은(는) 1매 이상이어야 합니다.`);

    for (const s of (show?.customSections || [])) {
      if (s.type === 'text' || s.type.startsWith('fixed_') || s.active === false) continue;
      const v = customResponses[s.id];
      if (s.required) {
        if (s.type === 'input_checkbox' && (!v || v.length === 0)) return toast(`${s.title}을(를) 선택해주세요.`);
        if (!v || String(v).trim() === '') return toast(`${s.title}을(를) 입력해주세요.`);
      }
    }

    submitOrderAsync();
  };

  const submitOrderAsync = async () => {
    setSubmitting(true);
    try {
      const combinedLabel = priceItems.length > 1
        ? priceItems.map(it => `${it.label || '일반'} ${it.qty}매`).join(' + ')
        : (priceItems[0]?.label || activeTier?.label || '');
      const newOrder = {
        id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        concertId: canonicalShowId,
        audienceName: name.trim(),
        phone: phone.trim(),
        ticketCount: Number(totalQty),
        unitPrice: priceItems.length === 1 ? priceItems[0].price : Math.round(total / Math.max(1, totalQty)),
        tierId: priceItems.length === 1 ? (priceItems[0]?.tierId || null) : null,
        priceTierLabel: combinedLabel,
        priceBreakdown: priceItems,
        totalPrice: total,
        depositStatus: '입금대기',
        attendanceStatus: '미입장',
        isAfterParty,
        afterPartyCount: isAfterParty ? Number(afterPartyCount) : 0,
        inviterName: isAfterParty ? (noInviter ? '없음' : inviterName.trim()) : '',
        comment: comment.trim(),
        customResponses,
        createdAt: new Date().toISOString()
      };

      // 서버 최신 목록에 추가(다른 신청자의 예매를 덮어쓰지 않음). 실패하면 완료 화면을 띄우지 않는다.
      const savedOrders = await firebaseStorage.appendOrder(newOrder);
      if (!Array.isArray(savedOrders)) throw new Error('order save failed');
      setOrders(savedOrders);
      // 제출 직후 재집계(soldByTier 변화)로 가격 구간이 바뀌어도 완료 화면에는
      // 실제로 신청/저장된 금액이 그대로 보이도록 스냅샷을 고정해둔다.
      setConfirmedOrder(newOrder);
      setIsSheetOpen(false);
      setDone(true);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      toast('예매 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 로딩 / 에러 / 완료 화면 ──────────────────────────────────────────────────
  if (loading) return (
    <div className="loading-container" style={{ height: '100dvh' }}>
      <div className="loading-spinner"></div>
      <div className="loading-text">공연 정보를 불러오는 중입니다...</div>
    </div>
  );

  if (!show) return <div style={{ textAlign: 'center', padding: 50 }}>공연 정보를 찾을 수 없습니다.</div>;

  if (done) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: '#f8fafc', padding: 20 }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 24, padding: 40, boxShadow: '0 10px 40px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
        <div style={{ fontSize: 50, marginBottom: 20 }}>🎟️</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 10px' }}>예매 신청 완료!</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 30 }}>입금 확인 후 최종 확정됩니다.</p>
        <div style={{ margin: '24px 0', textAlign: 'left' }}>
          <AccountCard account={SUPPORT_ACCOUNT} />
          <div style={{ marginTop: 12, padding: '12px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, color: '#374151', textAlign: 'center' }}>
            입금 금액: <strong>{(confirmedOrder?.totalPrice ?? total).toLocaleString()}원</strong>
          </div>
        </div>
        <button onClick={() => window.location.reload()} className="btn-secondary" style={{ width: '100%' }}>새로 신청하기</button>
      </div>
    </div>
  );

  // 상세 설명 하단에 표시되는 항목: 안내 텍스트는 설명과 한 박스로 묶고,
  // 입력이 필요한 질문은 별도 영역에 렌더링한다.
  const inlineSections = (show.customSections || []).filter(s => s.placement === 'inline' && s.active !== false);
  const inlineTextSections = inlineSections.filter(s => s.type === 'text');
  const inlineInputSections = inlineSections.filter(s => s.type !== 'text');

  // ── 메인 페이지 (공연 정보 표시) ──────────────────────────────────────────────
  const posterImages = Array.isArray(show.imageUrls) && show.imageUrls.length > 0
    ? show.imageUrls
    : (show.imageUrl ? [show.imageUrl] : []);

  return (
    <>
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        minHeight: '100dvh', background: '#f8fafc',
        padding: '40px clamp(8px, 4vw, 16px) 120px',
      }}>
        <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 24, boxShadow: '0 10px 40px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {posterImages.length > 0 && (
            <div style={{ position: 'relative' }}>
              <div
                ref={posterScrollRef}
                onScroll={e => {
                  const w = e.currentTarget.clientWidth;
                  if (w > 0) setPosterIdx(Math.round(e.currentTarget.scrollLeft / w));
                }}
                style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
              >
                {posterImages.map((url, idx) => (
                  <img key={idx} src={url} alt={`${show.title} ${idx + 1}`} style={{ width: '100%', flex: '0 0 100%', scrollSnapAlign: 'start', display: 'block' }} />
                ))}
              </div>
              {posterImages.length > 1 && (
                <>
                  {posterIdx > 0 && (
                    <button
                      type="button"
                      aria-label="이전 사진"
                      onClick={() => posterScrollRef.current?.scrollTo({ left: (posterIdx - 1) * posterScrollRef.current.clientWidth, behavior: 'smooth' })}
                      style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >‹</button>
                  )}
                  {posterIdx < posterImages.length - 1 && (
                    <button
                      type="button"
                      aria-label="다음 사진"
                      onClick={() => posterScrollRef.current?.scrollTo({ left: (posterIdx + 1) * posterScrollRef.current.clientWidth, behavior: 'smooth' })}
                      style={{ position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >›</button>
                  )}
                  <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
                    {posterImages.map((_, idx) => (
                      <span key={idx} style={{ width: 6, height: 6, borderRadius: '50%', background: idx === posterIdx ? '#fff' : 'rgba(255,255,255,0.5)', boxShadow: '0 0 2px rgba(0,0,0,0.4)' }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <div style={{ padding: 'clamp(16px, 6vw, 28px)' }}>
            <h1 style={{ fontSize: 24, fontWeight: 950, margin: '0 0 16px' }}>{show.title}</h1>
            <div style={{ background: '#f8fafc', borderRadius: 16, padding: 16, display: 'grid', gap: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 10, fontSize: 14 }}><span style={{ color: '#64748b', minWidth: 60, flexShrink: 0 }}>일시</span><span style={{ fontWeight: 700 }}>{fmtDT(show.date, show.time)}</span></div>
              <div style={{ display: 'flex', gap: 10, fontSize: 14 }}><span style={{ color: '#64748b', minWidth: 60, flexShrink: 0 }}>장소</span><span style={{ fontWeight: 700 }}>{show.location}</span></div>
              <div style={{ display: 'flex', gap: 10, fontSize: 14 }}>
                <span style={{ color: '#64748b', minWidth: 60, flexShrink: 0 }}>티켓 금액</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontWeight: 800,
                    color: activeTier ? '#9a3412' : '#111827',
                    background: activeTier ? 'linear-gradient(to top, #fde68a 42%, transparent 42%)' : 'transparent',
                  }}>
                    {price.toLocaleString()}원
                  </span>
                  <span style={{ fontWeight: 700 }}> / 1매</span>
                  {activeTier?.label && (
                    <span style={{ marginLeft: 6, fontSize: 12, color: '#94a3b8' }}>({activeTier.label})</span>
                  )}

                  {nextCutoff && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#ea580c', fontWeight: 700, lineHeight: 1.5 }}>
                      ⏱ {activeTier?.label || '현재'} 마감까지 <span style={{ fontFamily: 'monospace' }}>{formatCountdown(nextCutoff.getTime() - now.getTime())}</span>
                      {nextTier && !(remainingQty != null && !soldOut) && (
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                          {' '}· 이후 {Number(nextTier.price || 0).toLocaleString()}원{nextTier.label ? ` (${nextTier.label})` : ''}
                        </span>
                      )}
                    </div>
                  )}

                  {remainingQty != null && !soldOut && (
                    <div style={{ marginTop: 4, fontSize: 12, color: remainingQty <= 5 ? '#dc2626' : '#ea580c', fontWeight: 700, lineHeight: 1.5 }}>
                      🎟 {activeTier?.label || '현재'} 잔여 <span style={{ fontFamily: 'monospace' }}>{remainingQty}</span>매
                      {nextTier && (
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                          {' '}· 이후 {Number(nextTier.price || 0).toLocaleString()}원{nextTier.label ? ` (${nextTier.label})` : ''}
                        </span>
                      )}
                    </div>
                  )}

                  {soldOut && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#dc2626', fontWeight: 800 }}>
                      ⛔ 매진되었습니다
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(show.description || inlineTextSections.length > 0) && (
              <div style={{ marginTop: 20, padding: 'clamp(12px, 4vw, 16px)', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 14, color: '#4b5563', lineHeight: 1.6 }}>
                {show.description && (
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{show.description}</p>
                )}
                {inlineTextSections.map((s, idx) => (
                  <div
                    key={s.id}
                    style={(idx > 0 || show.description) ? { marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' } : undefined}
                  >
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>{s.title}</h3>
                    <p style={{ fontSize: 14, color: '#4b5563', margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s.content}</p>
                  </div>
                ))}
              </div>
            )}

            {inlineInputSections.length > 0 && (
              <div style={{ marginTop: 20, display: 'grid', gap: 20 }}>
                <RenderSections
                  sections={inlineInputSections}
                  values={customResponses}
                  setValues={setCustomResponses}
                />
              </div>
            )}

            <div style={{ marginTop: 24, padding: '14px clamp(12px, 4vw, 18px)', borderRadius: 14, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 13, color: '#1d4ed8', lineHeight: 1.7 }}>
              💡 아래 <strong>지금 예매하기</strong> 버튼을 눌러 예매를 신청하세요.
            </div>
          </div>
        </div>
      </div>

      {/* ── 고정 하단 바 ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 800,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid #e2e8f0',
        padding: '12px 20px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>티켓 금액</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>
            {price.toLocaleString()}원
            <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}> / 1매</span>
          </div>
        </div>
        <button
          id="open-reservation-sheet"
          onClick={() => !soldOut && setIsSheetOpen(true)}
          disabled={soldOut}
          style={{
            flex: 2,
            height: 52,
            borderRadius: 16,
            background: soldOut ? '#9ca3af' : '#111827',
            color: '#fff',
            fontSize: 16,
            fontWeight: 800,
            border: 'none',
            cursor: soldOut ? 'not-allowed' : 'pointer',
            boxShadow: soldOut ? 'none' : '0 4px 20px rgba(0,0,0,0.25)',
            transition: 'transform 0.15s, opacity 0.15s',
          }}
          onMouseDown={e => { if (!soldOut) e.currentTarget.style.opacity = '0.85'; }}
          onMouseUp={e => { e.currentTarget.style.opacity = ''; }}
          onTouchStart={e => { if (!soldOut) e.currentTarget.style.opacity = '0.85'; }}
          onTouchEnd={e => { e.currentTarget.style.opacity = ''; }}
        >
          {soldOut ? '매진되었습니다' : '지금 예매하기 🎟'}
        </button>
      </div>

      {/* ── Bottom Sheet ─────────────────────────────────────────────────── */}
      <BottomSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        show={show}
        price={price}
        total={total}
        qty={totalQty}
        setQty={setQty}
        tiers={openTiers}
        tierQty={tierQty}
        setTierQty={setTierQty}
        priceItems={priceItems}
        soldOut={soldOut}
        name={name} setName={setName}
        phone={phone} setPhone={setPhone}
        isAfterParty={isAfterParty} setIsAfterParty={setIsAfterParty}
        afterPartyCount={afterPartyCount} setAfterPartyCount={setAfterPartyCount}
        inviterName={inviterName} setInviterName={setInviterName}
        noInviter={noInviter} setNoInviter={setNoInviter}
        comment={comment} setComment={setComment}
        customResponses={customResponses} setCustomResponses={setCustomResponses}
        submitting={submitting}
        onSubmit={submit}
      />
    </>
  );
}
