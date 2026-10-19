import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import './PageStyles.css';

const LS_SHOWS = 'lumique_concerts';
const LS_ORDERS = 'lumique_ticket_orders';
const DEPOSIT_WAIT = '입금대기';
const DEPOSIT_DONE = '입금완료';
const ATTEND_WAIT = '미입장';
const ATTEND_DONE = '입장완료';

import { firebaseStorage } from '../utils/firebaseStorage';
import { countSoldByTier, resolveActivePrice, cleanPriceTier, formatTierUntil, regularPriceOf } from '../utils/pricing';
import { sortByPartAndName } from '../utils/calculations';

const genTierId = () => `tier-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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

// 하이픈 제거 함수 (연락처 하이픈 무관 검색용)
const stripHyphens = (s) => String(s || '').replace(/-/g, '');

function StatCard({ label, value, color = '#111827' }) {
  return (
    <div className="card card-pad" style={{ display: 'grid', gap: 6, background: '#fff', border: '1px solid var(--slate-100)' }}>
      <div className="caption" style={{ fontWeight: 700, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 950, color }}>{value}</div>
    </div>
  );
}

// ── 컬럼 고정 너비 정의 (레이아웃 흔들림 완벽 방지) ──
const ALL_COLUMNS = [
  { id: 'depositStatus', label: '입금 상태', width: 110, required: false },
  { id: 'audienceName',  label: '예매자명',  width: 120, required: false },
  { id: 'phone',         label: '연락처',    width: 140, required: false },
  { id: 'ticketCount',   label: '티켓 매수', width: 90,  required: false },
  { id: 'priceTier',     label: '가격 구간/금액', width: 130, required: false },
  { id: 'duesDeduction', label: '결제 방식(회비 충당)', width: 190, required: false },
  { id: 'inviterName',   label: '초대자',    width: 110, required: false },
  { id: 'afterParty',    label: '뒤풀이 참여', width: 90,  required: false },
  { id: 'comment',       label: '추가 입력 정보', width: 180, required: false },
  { id: 'createdAt',     label: '신청 시간', width: 140, required: false },
  { id: 'attendStatus',  label: '입장 여부', width: 130, required: false },
];

const DEFAULT_COLUMN_ORDER = ALL_COLUMNS.map(c => c.id);
const LS_COL_CONFIG = 'lumique_col_config';

function loadColConfig() {
  try {
    const raw = localStorage.getItem(LS_COL_CONFIG);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveColConfig(cfg) {
  localStorage.setItem(LS_COL_CONFIG, JSON.stringify(cfg));
}

// ── 컬럼 설정 모달 ──
function ColumnSettingsPanel({ colOrder, setColOrder, hiddenCols, setHiddenCols, onClose }) {
  const dragIndex = useRef(null);
  const dragOverIndex = useRef(null);

  const handleDragStart = (i) => { dragIndex.current = i; };
  const handleDragOver = (e, i) => {
    e.preventDefault();
    dragOverIndex.current = i;
  };
  const handleDrop = () => {
    const from = dragIndex.current;
    const to = dragOverIndex.current;
    if (from === null || to === null || from === to) return;
    const next = [...colOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setColOrder(next);
    saveColConfig({ order: next, hidden: [...hiddenCols] });
    dragIndex.current = null;
    dragOverIndex.current = null;
  };

  const moveCol = (i, dir) => {
    const next = [...colOrder];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setColOrder(next);
    saveColConfig({ order: next, hidden: [...hiddenCols] });
  };

  const toggleHide = (id) => {
    const next = hiddenCols.includes(id)
      ? hiddenCols.filter(c => c !== id)
      : [...hiddenCols, id];
    setHiddenCols(next);
    saveColConfig({ order: [...colOrder], hidden: next });
  };

  const colMap = Object.fromEntries(ALL_COLUMNS.map(c => [c.id, c]));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div
        style={{ background: '#fff', borderRadius: 20, padding: 28, width: 380, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: '#0f172a' }}>테이블 컬럼 커스텀 설정</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14, fontWeight: 600 }}>
          드래그 또는 화살표 버튼으로 순서를 변경하고, 표시/숨기기를 토글하세요.
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {colOrder.map((id, i) => {
            const col = colMap[id];
            if (!col) return null;
            const isHidden = hiddenCols.includes(id);
            return (
              <div
                key={id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={handleDrop}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#f8fafc',
                  cursor: 'grab', opacity: isHidden ? 0.45 : 1, transition: 'opacity 0.2s'
                }}
              >
                <span style={{ color: '#94a3b8', fontSize: 16, cursor: 'grab' }}>⠿</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{col.label}</span>
                <button type="button" onClick={() => moveCol(i, -1)} disabled={i === 0}
                  style={{ background: 'none', border: 'none', fontSize: 13, cursor: i === 0 ? 'not-allowed' : 'pointer', color: '#64748b', padding: '0 2px' }}>▲</button>
                <button type="button" onClick={() => moveCol(i, 1)} disabled={i === colOrder.length - 1}
                  style={{ background: 'none', border: 'none', fontSize: 13, cursor: i === colOrder.length - 1 ? 'not-allowed' : 'pointer', color: '#64748b', padding: '0 2px' }}>▼</button>
                <button
                  type="button"
                  onClick={() => toggleHide(id)}
                  style={{
                    padding: '4px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                    background: isHidden ? '#e2e8f0' : '#111827', color: isHidden ? '#64748b' : '#fff',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s'
                  }}
                >{isHidden ? '표시' : '숨기기'}</button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            setColOrder(DEFAULT_COLUMN_ORDER);
            setHiddenCols([]);
            saveColConfig({ order: DEFAULT_COLUMN_ORDER, hidden: [] });
          }}
          style={{ marginTop: 18, width: '100%', padding: '11px 0', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >기본 순서로 초기화</button>
      </div>
    </div>
  );
}

// ── 가격 구간(기간별/한정 수량) 조회 및 관리 패널 ──
function PriceTierSection({ show, isAdmin, soldByTier, activeTier, onSave }) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({ pricingMode: 'fixed', price: 5000, priceTiers: [] });
  const [saving, setSaving] = useState(false);

  const resetDraft = useCallback(() => {
    if (!show) return;
    setDraft({
      pricingMode: show.pricingMode === 'tiered' ? 'tiered' : 'fixed',
      price: Number(show.price) || 5000,
      priceTiers: Array.isArray(show.priceTiers) ? show.priceTiers.map(t => ({ ...t })) : [],
    });
  }, [show]);

  useEffect(() => { resetDraft(); }, [show?.id]);

  if (!show) return null;

  const isTiered = show.pricingMode === 'tiered' && Array.isArray(show.priceTiers) && show.priceTiers.length > 0;
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', background: '#fff' };

  const toggleMode = (checked) => setDraft(p => ({
    ...p,
    pricingMode: checked ? 'tiered' : 'fixed',
    priceTiers: checked && p.priceTiers.length === 0
      ? [
          { id: genTierId(), label: '얼리버드', price: p.price, until: '', quantityLimit: null },
          { id: genTierId(), label: '일반', price: p.price, until: '', quantityLimit: null },
        ]
      : p.priceTiers,
  }));
  const updateTier = (tierId, patch) => setDraft(p => ({ ...p, priceTiers: p.priceTiers.map(t => t.id === tierId ? { ...t, ...patch } : t) }));
  const addTier = () => setDraft(p => ({ ...p, priceTiers: [...p.priceTiers, { id: genTierId(), label: '', price: p.price, until: '', quantityLimit: null }] }));
  const removeTier = (tierId) => setDraft(p => ({ ...p, priceTiers: p.priceTiers.filter(t => t.id !== tierId) }));
  const moveTier = (idx, dir) => setDraft(p => {
    const copy = [...p.priceTiers];
    if (idx + dir < 0 || idx + dir >= copy.length) return p;
    [copy[idx], copy[idx + dir]] = [copy[idx + dir], copy[idx]];
    return { ...p, priceTiers: copy };
  });

  const cancel = () => {
    resetDraft();
    setEditMode(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        pricingMode: draft.pricingMode,
        priceTiers: draft.priceTiers.map(cleanPriceTier),
      });
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card card-pad" style={{ display: 'grid', gap: 14, borderRadius: 20, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>가격 구간 관리</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {isTiered ? '기간별/한정 수량 가격이 적용 중입니다.' : '고정 가격이 적용 중입니다.'}
          </div>
        </div>
        {isAdmin && !editMode && (
          <button type="button" onClick={() => setEditMode(true)} className="btn-secondary" style={{ height: 36, padding: '0 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {isTiered ? '구간 수정' : '구간별 가격 설정'}
          </button>
        )}
      </div>

      {!editMode && isTiered && (
        <div style={{ display: 'grid', gap: 8 }}>
          {show.priceTiers.map((t) => {
            const sold = soldByTier[t.id] || 0;
            const limit = Number(t.quantityLimit) || 0;
            const hasQuantity = limit > 0;
            const hasDate = Boolean(t.until);
            const remaining = hasQuantity ? Math.max(0, limit - sold) : null;
            const quantityClosed = hasQuantity && sold >= limit;
            const dateClosed = hasDate && new Date() >= new Date(t.until);
            const closed = quantityClosed || dateClosed;
            const isActive = activeTier?.id === t.id;
            return (
              <div key={t.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '10px 14px', borderRadius: 12,
                border: isActive ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                background: isActive ? '#ecfdf5' : '#fff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{t.label || '(이름없음)'}</span>
                  {isActive && <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: 20 }}>현재 적용중</span>}
                  {closed && <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 20 }}>마감</span>}
                </div>
                <div style={{ fontSize: 13, color: '#475569', fontWeight: 700, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{Number(t.price || 0).toLocaleString()}원</span>
                  {hasQuantity && (
                    <span style={{ color: remaining != null && remaining <= 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>
                      판매 {sold}매 / {limit}매 (잔여 {remaining}매)
                    </span>
                  )}
                  {hasDate && (
                    <span style={{ color: '#64748b', fontWeight: 600 }}>
                      {formatTierUntil(t.until)} 마감
                    </span>
                  )}
                  {!hasQuantity && !hasDate && (
                    <span style={{ color: '#64748b', fontWeight: 600 }}>기한 없음</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!editMode && !isTiered && (
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
          {Number(show.price || 0).toLocaleString()}원 (전체 동일 가격)
        </div>
      )}

      {editMode && (
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#374151' }}>
            <input type="checkbox" checked={draft.pricingMode === 'tiered'} onChange={(e) => toggleMode(e.target.checked)} style={{ width: 16, height: 16 }} />
            기간별/한정 수량 가격 사용
          </label>

          {draft.pricingMode === 'tiered' && (
            <div style={{ display: 'grid', gap: 10 }}>
              {draft.priceTiers.map((t, idx) => {
                const isLast = idx === draft.priceTiers.length - 1;
                const hasDate = t.until !== null && t.until !== undefined;
                const hasQuantity = t.quantityLimit !== null && t.quantityLimit !== undefined;
                const sold = soldByTier[t.id] || 0;
                return (
                  <div key={t.id} style={{ display: 'grid', gap: 8, padding: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 100px' }}>
                        <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>구간 이름</label>
                        <input value={t.label} onChange={e => updateTier(t.id, { label: e.target.value })} placeholder="예: 얼리버드" style={inputStyle} />
                      </div>
                      <div style={{ flex: '1 1 100px' }}>
                        <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>가격 (원)</label>
                        <input type="number" value={t.price} onChange={e => updateTier(t.id, { price: e.target.value })} style={inputStyle} />
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" onClick={() => moveTier(idx, -1)} disabled={idx === 0} style={{ background: '#e2e8f0', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1 }}>⬆️</button>
                        <button type="button" onClick={() => moveTier(idx, 1)} disabled={isLast} style={{ background: '#e2e8f0', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: isLast ? 'not-allowed' : 'pointer', opacity: isLast ? 0.4 : 1 }}>⬇️</button>
                        {draft.priceTiers.length > 1 && (
                          <button type="button" onClick={() => removeTier(t.id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '0 6px' }}>삭제</button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px dashed #e2e8f0' }}>
                      <label style={{ fontSize: 11, color: '#94a3b8' }}>마감 조건 (기간/수량을 각각 켜고 끌 수 있으며, 둘 다 켜면 먼저 도달한 쪽에서 마감됩니다)</label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#374151' }}>
                        <input type="checkbox" checked={hasDate} onChange={e => updateTier(t.id, { until: e.target.checked ? (t.until || '') : null })} style={{ width: 14, height: 14 }} />
                        기간 제한 사용
                      </label>
                      {hasDate && (
                        <div style={{ flex: '1 1 180px' }}>
                          <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                            {isLast ? '마감 시각 (비워두면 계속 적용)' : '이 가격 마감 시각'}
                          </label>
                          <input type="datetime-local" value={t.until || ''} onChange={e => updateTier(t.id, { until: e.target.value })} style={inputStyle} />
                        </div>
                      )}

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#374151' }}>
                        <input type="checkbox" checked={hasQuantity} onChange={e => updateTier(t.id, { quantityLimit: e.target.checked ? (t.quantityLimit || '') : null })} style={{ width: 14, height: 14 }} />
                        수량 제한 사용
                      </label>
                      {hasQuantity && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 160px' }}>
                            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>한정 수량 (매)</label>
                            <input type="number" min="1" value={t.quantityLimit ?? ''} onChange={e => updateTier(t.id, { quantityLimit: e.target.value })} placeholder="예: 30" style={inputStyle} />
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                            현재 판매 {sold}매
                            {Number(t.quantityLimit) > 0 && (
                              <span style={{ color: sold >= Number(t.quantityLimit) ? '#ef4444' : '#64748b' }}>
                                {' '}· 잔여 {Math.max(0, Number(t.quantityLimit) - sold)}매
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {!hasDate && !hasQuantity && (
                        <div style={{ fontSize: 11, color: '#cbd5e1' }}>마감 조건 없음 — 이 가격이 계속 적용됩니다.</div>
                      )}
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={addTier} className="btn-sm" style={{ alignSelf: 'flex-start' }}>+ 가격 구간 추가</button>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                구간은 위에서부터 순서대로 적용됩니다. 기간/수량 조건 중 먼저 도달한 쪽에서 마감되어 다음 구간으로 자동 전환되며, 마지막 구간을 조건 없이 두면 그 가격이 계속 적용됩니다.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={cancel} disabled={saving} style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>취소</button>
            <button type="button" onClick={save} disabled={saving} style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: saving ? '#9ca3af' : '#111827', color: '#fff', fontWeight: 800, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReservationManagementPage() {
  const { isAdmin } = useAuth();
  const { id: concertId } = useParams();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [shows, setShows] = useState([]);
  const [members, setMembers] = useState([]);
  const [duesSavingId, setDuesSavingId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // 건별 후원금 폼 입력값 및 아코디언 토글 상태
  const [donorName, setDonorName] = useState('');
  const [donationAmount, setDonationAmount] = useState('');
  const [donationDate, setDonationDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingDonation, setSavingDonation] = useState(false);
  const [showDonationAccordion, setShowDonationAccordion] = useState(false);

  // 당일 현장 입장 관리 모드
  const [checkinMode, setCheckinMode] = useState(false);

  // 컬럼 커스텀 상태
  const [colOrder, setColOrder] = useState(DEFAULT_COLUMN_ORDER);
  const [hiddenCols, setHiddenCols] = useState([]);
  const [showColSettings, setShowColSettings] = useState(false);

  // 초대자별 예매자 상세 목록 토글 상태
  const [expandedInviters, setExpandedInviters] = useState({});

  const currentShow = useMemo(() => shows.find(s => s.id === concertId), [shows, concertId]);

  useEffect(() => {
    document.title = '티켓 신청 및 입장 관리';
    const saved = loadColConfig();
    if (saved) {
      if (Array.isArray(saved.order) && saved.order.length > 0) {
        // 이후 추가된 컬럼(예: 가격 구간)은 기존에 저장된 순서에 없으므로 뒤에 보충한다.
        const missing = DEFAULT_COLUMN_ORDER.filter(id => !saved.order.includes(id));
        setColOrder([...saved.order, ...missing]);
      }
      if (Array.isArray(saved.hidden)) setHiddenCols(saved.hidden);
    }
    async function loadData() {
      let fbConcerts = await firebaseStorage.loadConcerts();
      let fbOrders = await firebaseStorage.loadOrders();
      if (fbConcerts.length === 0 && loadLS(LS_SHOWS).length > 0) fbConcerts = loadLS(LS_SHOWS);
      if (fbOrders.length === 0 && loadLS(LS_ORDERS).length > 0) fbOrders = loadLS(LS_ORDERS);
      setShows(fbConcerts);
      setOrders(fbOrders);
      const fbData = await firebaseStorage.loadData();
      setMembers(fbData?.members || []);
      setLoading(false);
    }
    loadData();
  }, []);

  // 건별 후원금 리스트 계산 (날짜 내림차순 최신순 자동 정렬)
  const donationList = useMemo(() => {
    let list = [];
    if (Array.isArray(currentShow?.extraDonationList)) {
      list = [...currentShow.extraDonationList];
    } else if (Number(currentShow?.extraDonation || 0) > 0) {
      list = [{
        id: 'legacy-1',
        donorName: '기타 후원',
        amount: Number(currentShow.extraDonation),
        date: currentShow.date || new Date().toISOString().slice(0, 10)
      }];
    }
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [currentShow]);

  const extraDonationSum = useMemo(() => {
    return donationList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [donationList]);

  // 당일 모드 활성화 시 [입장 여부 / 예매자명 / 티켓 매수 / 연락처] 4개 핵심 컬럼만 집중 표시
  const visibleColOrder = useMemo(() => {
    if (checkinMode) {
      return ['attendStatus', 'audienceName', 'ticketCount', 'phone'];
    }
    return colOrder.filter(id => !hiddenCols.includes(id));
  }, [colOrder, hiddenCols, checkinMode]);

  // 연락처 하이픈 무관 검색 필터링 & 입장 완료 건 자동 하단 정렬
  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qStripped = stripHyphens(q);
    return orders.filter((order) => {
      if (concertId && order.concertId !== concertId) return false;
      
      const nameMatch = String(order.audienceName || '').toLowerCase().includes(q);
      const phoneMatch = qStripped.length > 0 && stripHyphens(order.phone).includes(qStripped);
      
      const matchesSearch = !q || nameMatch || phoneMatch;
      const matchesFilter =
        filter === 'all' ||
        (filter === 'deposit-wait' && order.depositStatus !== DEPOSIT_DONE) ||
        (filter === 'attend-wait' && order.attendanceStatus !== ATTEND_DONE);
      return matchesSearch && matchesFilter;
    }).sort((a, b) => {
      const aTotal = Number(a.ticketCount) || 0;
      const aEntered = Number(a.enteredCount) || 0;
      const aIsDone = a.attendanceStatus === ATTEND_DONE || (aTotal > 0 && aEntered >= aTotal);

      const bTotal = Number(b.ticketCount) || 0;
      const bEntered = Number(b.enteredCount) || 0;
      const bIsDone = b.attendanceStatus === ATTEND_DONE || (bTotal > 0 && bEntered >= bTotal);

      // 입장 완료 건은 아래로, 미입장 건은 상단으로 우선 배치
      if (aIsDone !== bIsDone) {
        return aIsDone ? 1 : -1;
      }
      // 동일 그룹 내에서는 최신 신청 순서로 정렬
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [orders, query, filter, concertId]);

  // 공연별 가격 구간(기간별/한정 수량) 정보 — 신청 매수 집계 및 조회/관리 패널에 사용.
  const showsById = useMemo(() => Object.fromEntries(shows.map(s => [s.id, s])), [shows]);
  const currentPriceTiers = useMemo(() => (Array.isArray(currentShow?.priceTiers) ? currentShow.priceTiers : []), [currentShow]);
  const isTiered = currentShow?.pricingMode === 'tiered' && currentPriceTiers.length > 0;
  const soldByTier = useMemo(
    () => (concertId ? countSoldByTier(orders, concertId, currentPriceTiers) : {}),
    [orders, concertId, currentPriceTiers]
  );
  const activeTier = useMemo(
    () => (currentShow ? resolveActivePrice(currentShow, new Date(), soldByTier).tier : null),
    [currentShow, soldByTier]
  );

  const savePriceTiers = async (patch) => {
    if (!currentShow || !concertId) return;
    const concerts = await firebaseStorage.loadConcerts();
    const updated = concerts.map(c => c.id === concertId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c);
    await firebaseStorage.saveConcerts(updated);
    setShows(updated);
  };

  // 신청 당시 적용된 단가(unitPrice)가 있으면 그대로 쓰고, 없는 과거 데이터는 해당 공연의 현재 가격으로 추정한다.
  const unitPriceFor = useCallback((o) => {
    if (Number(o.unitPrice) > 0) return Number(o.unitPrice);
    const s = concertId ? currentShow : showsById[o.concertId];
    return Number(s?.price) || 5000;
  }, [concertId, currentShow, showsById]);

  // 입금 확인 시 신청자가 보낸 금액과 맞춰볼 수 있도록 매수까지 반영한 결제 총액.
  const totalPriceFor = useCallback((o) => {
    if (Number(o.totalPrice) > 0) return Number(o.totalPrice);
    return unitPriceFor(o) * (Number(o.ticketCount) || 0);
  }, [unitPriceFor]);

  const totals = useMemo(() => {
    const allConcertOrders = concertId ? orders.filter(o => o.concertId === concertId) : orders;
    const ticketPrice = currentShow?.price ?? 5000;
    const paidRevenue = allConcertOrders.reduce((sum, o) => sum + (o.depositStatus === DEPOSIT_DONE ? totalPriceFor(o) : 0), 0);
    // 회비에서 충당된 것으로 표시된 예매 건의 합계. 총 모금액(실 티켓 수익)과는 별도로,
    // 공연 정산 시 "회비 쪽에서 메꾼 금액"을 따로 확인할 수 있도록 집계한다.
    const duesCoveredSum = allConcertOrders.reduce((sum, o) => sum + (o.duesMemberId ? (Number(o.duesCoveredAmount) || 0) : 0), 0);
    const duesCoveredCount = allConcertOrders.filter(o => o.duesMemberId).length;
    return {
      tickets: visibleOrders.reduce((sum, o) => sum + (Number(o.ticketCount) || 0), 0),
      enteredTotal: visibleOrders.reduce((sum, o) => sum + (Number(o.enteredCount) || 0), 0),
      paidTickets: visibleOrders.reduce((sum, o) => sum + (o.depositStatus === DEPOSIT_DONE ? (Number(o.ticketCount) || 0) : 0), 0),
      afterParties: visibleOrders.reduce((sum, o) => sum + (o.isAfterParty ? (Number(o.afterPartyCount) || 1) : 0), 0),
      totalFund: paidRevenue + extraDonationSum,
      extraDonation: extraDonationSum,
      duesCoveredSum,
      duesCoveredCount,
      ticketPrice,
    };
  }, [visibleOrders, orders, concertId, currentShow, extraDonationSum, totalPriceFor]);

  // 초대자 텍스트에 쓰인 이름이 활동 회원 이름과 정확히 일치하면 자동으로 그 회원을 매핑한다.
  // 두 명 이상 적었으면(쉼표 구분) 맨 처음 적은 이름을 기준으로 매칭한다.
  const autoMatchInviterMember = (inviterNameText) => {
    if (!inviterNameText || inviterNameText === '없음') return null;
    const firstName = inviterNameText.split(',')[0]?.trim();
    if (!firstName) return null;
    const matches = members.filter(m => m.status === 'active' && m.name === firstName);
    return matches.length === 1 ? matches[0] : null;
  };

  // 관리자가 수동으로 지정한 매핑이 있으면 그것을 우선하고, 없으면 자동 매칭 결과를 사용한다.
  const resolveInviterMember = (o) => {
    if (o.inviterMemberId) return members.find(m => m.id === o.inviterMemberId) || null;
    return autoMatchInviterMember(o.inviterName);
  };

  // 뒤풀이 참여자 전체 명단 (초대자 기재 여부와 무관하게 참여 체크한 모든 신청자를 집계)
  const afterPartyRoster = useMemo(() => {
    const src = concertId ? orders.filter(o => o.concertId === concertId) : orders;
    const list = src
      .filter(o => o.isAfterParty)
      .map(o => {
        const resolvedMember = resolveInviterMember(o);
        return {
          orderId: o.id,
          name: o.audienceName || '(이름없음)',
          phone: o.phone || '',
          count: Number(o.afterPartyCount) || 1,
          inviterName: (o.inviterName && o.inviterName !== '없음') ? o.inviterName : '',
          inviterMemberId: o.inviterMemberId || '',
          resolvedInviterMemberId: resolvedMember?.id || '',
          isAutoMatched: !o.inviterMemberId && !!resolvedMember,
          depositStatus: o.depositStatus,
          attendanceStatus: o.attendanceStatus,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const total = list.reduce((sum, item) => sum + item.count, 0);
    return { list, total };
  }, [orders, concertId, members]);

  // 초대자 텍스트를 실제 공연자(회원)와 수동으로 매핑 저장 (자동 매칭 결과를 덮어씀)
  const setInviterMapping = async (orderId, memberId) => {
    if (!isAdmin) return;
    await updateOrder(orderId, { inviterMemberId: memberId || null });
  };

  // 초대자별 뒤풀이 집계 (공연자 매핑이 되어 있으면 매핑된 회원 이름으로, 없으면 입력 텍스트로 집계)
  const inviterStats = useMemo(() => {
    const src = concertId ? orders.filter(o => o.concertId === concertId) : orders;
    const map = {};
    for (const o of src) {
      if (!o.isAfterParty) continue;
      const resolvedMember = resolveInviterMember(o);
      let names;
      if (resolvedMember) {
        names = [resolvedMember.name];
      } else {
        if (!o.inviterName) continue;
        names = o.inviterName.split(',').map(n => n.trim()).filter(Boolean);
      }
      if (names.length === 0) continue;
      const perInviter = (Number(o.afterPartyCount) || 1) / names.length;
      for (const name of names) {
        if (!map[name]) map[name] = { count: 0, orders: 0, attendees: [] };
        map[name].count += perInviter;
        map[name].orders += 1;
        map[name].attendees.push({
          name: o.audienceName || '(이름없음)',
          phone: o.phone || '',
          isAfterParty: true,
          afterPartyCount: Number(o.afterPartyCount) || 1,
          depositStatus: o.depositStatus,
          attendanceStatus: o.attendanceStatus,
        });
      }
    }
    return Object.entries(map)
      .map(([name, v]) => [name, { count: Math.round(v.count), orders: v.orders, attendees: v.attendees }])
      .sort((a, b) => b[1].count - a[1].count);
  }, [orders, concertId, members]);

  const exportCsv = () => {
    const headers = ['예매자명', '연락처', '신청 매수', '가격 구간', '결제 금액', '결제 방식', '뒤풀이 참여자 수', '초대자', '남기신 말씀', '신청 시간', '입금 여부', '입장 여부'];
    const rows = [
      headers,
      ...visibleOrders.map((o) => {
        const duesMember = o.duesMemberId ? members.find(m => m.id === o.duesMemberId) : null;
        return [
          o.audienceName || '',
          o.phone || '',
          o.ticketCount || 0,
          o.priceTierLabel || '-',
          totalPriceFor(o),
          duesMember ? `회비 충당 (${duesMember.name}, ${(Number(o.duesCoveredAmount) || 0).toLocaleString()}원)` : '일반 결제',
          o.isAfterParty ? o.afterPartyCount || 1 : 0,
          o.isAfterParty ? (o.inviterName || '') : '',
          o.comment || '',
          o.createdAt ? formatDate(o.createdAt) : '',
          o.depositStatus === DEPOSIT_DONE ? '입금 완료' : '입금 대기',
          o.attendanceStatus === ATTEND_DONE ? '입장 완료' : '미입장',
        ];
      }),
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

  // 예매 내역 삭제 (관리자 전용) — 테스트 신청이나 취소 요청 등을 되돌릴 수 없이 완전히 제거한다.
  const deleteOrder = async (order) => {
    if (!isAdmin) return;
    if (!window.confirm(`${order.audienceName || '이름없음'}님의 예매 내역(${order.ticketCount}매)을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const nextOrders = orders.filter((o) => o.id !== order.id);
    setOrders(nextOrders);
    await firebaseStorage.saveOrders(nextOrders);
  };

  // 회비 충당 처리용 활동 회원 목록 (파트 > 이름 순)
  const activeMembersSorted = useMemo(() => sortByPartAndName(members.filter(m => m.status === 'active')), [members]);

  // 부원 본인 티켓 1매를, 회원 개인의 회비 납부 여부와는 무관하게 "공연 정산 시 회비에서
  // 충당된 금액"으로만 표시해 둔다. 회원별 회비 납부 내역(MemberDuesPage)에는 영향을 주지 않으며,
  // 공연이 끝난 뒤 회계 정산을 할 때 참고할 금액만 예매 건에 기록한다.
  // 할인가(얼리버드 등)를 적용받으면 안 되므로 항상 "일반(상시 적용)" 가격 1매분으로 고정하고,
  // 한 번에 여러 매를 신청했어도 금액은 늘어나지 않는다.
  const setDuesCoverage = async (order, memberId) => {
    if (!isAdmin) return;
    setDuesSavingId(order.id);
    try {
      if (!memberId) {
        await updateOrder(order.id, { duesMemberId: null, duesCoveredAmount: null });
        return;
      }
      const member = members.find(m => m.id === memberId);
      if (!member) return;
      const show = showsById[order.concertId];
      const amount = regularPriceOf(show);
      await updateOrder(order.id, { duesMemberId: member.id, duesCoveredAmount: amount, depositStatus: DEPOSIT_DONE });
    } finally {
      setDuesSavingId(null);
    }
  };

  // 건별 후원금 항목 추가 처리
  const addDonationItem = async () => {
    if (!currentShow || !concertId) return;
    const amount = Number(String(donationAmount).replace(/[^0-9]/g, ''));
    if (isNaN(amount) || amount <= 0) return alert('올바른 후원 금액을 입력해 주세요.');
    const donor = donorName.trim() || '익명';
    const newItem = {
      id: 'don_' + Date.now(),
      donorName: donor,
      amount: amount,
      date: donationDate || new Date().toISOString().slice(0, 10)
    };
    const nextList = [...donationList, newItem];
    const nextSum = nextList.reduce((sum, item) => sum + item.amount, 0);

    setSavingDonation(true);
    try {
      const concerts = await firebaseStorage.loadConcerts();
      const updated = concerts.map(c => c.id === concertId ? { ...c, extraDonationList: nextList, extraDonation: nextSum } : c);
      await firebaseStorage.saveConcerts(updated);
      setShows(updated);
      setDonorName('');
      setDonationAmount('');
    } finally {
      setSavingDonation(false);
    }
  };

  // 건별 후원금 항목 삭제 처리
  const deleteDonationItem = async (itemId) => {
    if (!currentShow || !concertId) return;
    const nextList = donationList.filter(d => d.id !== itemId);
    const nextSum = nextList.reduce((sum, item) => sum + item.amount, 0);

    setSavingDonation(true);
    try {
      const concerts = await firebaseStorage.loadConcerts();
      const updated = concerts.map(c => c.id === concertId ? { ...c, extraDonationList: nextList, extraDonation: nextSum } : c);
      await firebaseStorage.saveConcerts(updated);
      setShows(updated);
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
    updateOrder(order.id, { enteredCount: newEntered, attendanceStatus: newStatus });
  };

  const toggleInviterExpand = (name) => {
    setExpandedInviters(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const colMap = Object.fromEntries(ALL_COLUMNS.map(c => [c.id, c]));

  // 셀 렌더링 함수 (고정 너비 및 border-box 적용으로 상태 변경 시 컬럼 흔들림 방지)
  const renderCell = useCallback((o, colId) => {
    const isPaid = o.depositStatus === DEPOSIT_DONE;
    const totalTickets = Number(o.ticketCount) || 0;
    const currentEntered = Number(o.enteredCount) || 0;
    const isEntered = currentEntered === totalTickets && totalTickets > 0;
    const colDef = colMap[colId];
    const cellWidth = colDef?.width ? `${colDef.width}px` : undefined;

    switch (colId) {
      case 'depositStatus':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', width: cellWidth, boxSizing: 'border-box' }}>
            <button
              type="button"
              onClick={() => toggleDeposit(o)}
              style={{
                width: '100%', padding: '7px 8px', borderRadius: 9,
                border: `1.5px solid ${isPaid ? '#10b981' : 'var(--slate-200)'}`,
                background: isPaid ? '#10b981' : '#fff',
                color: isPaid ? '#fff' : '#64748b',
                fontSize: 12, fontWeight: 800, cursor: isAdmin ? 'pointer' : 'default',
                whiteSpace: 'nowrap', transition: 'all 0.2s', boxSizing: 'border-box',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
              }}
            >{isPaid ? '✓ 입금 완료' : '입금 대기'}</button>
          </td>
        );
      case 'audienceName':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', fontWeight: 800, color: 'var(--slate-900)', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: cellWidth, boxSizing: 'border-box' }}>
            {o.audienceName}
          </td>
        );
      case 'phone':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', color: '#475569', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', width: cellWidth, boxSizing: 'border-box' }}>
            {o.phone || '-'}
          </td>
        );
      case 'ticketCount':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--slate-800)', whiteSpace: 'nowrap', width: cellWidth, boxSizing: 'border-box' }}>
            {o.ticketCount}
          </td>
        );
      case 'priceTier':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', width: cellWidth, boxSizing: 'border-box' }}>
            <div style={{ display: 'grid', gap: 2 }}>
              {o.priceTierLabel && (
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.priceTierLabel}
                </span>
              )}
              <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 800, whiteSpace: 'nowrap' }}>
                {totalPriceFor(o).toLocaleString()}원
              </span>
            </div>
          </td>
        );
      case 'duesDeduction': {
        const linkedMember = o.duesMemberId ? members.find(m => m.id === o.duesMemberId) : null;
        const coveredAmount = Number(o.duesCoveredAmount) || 0;
        const saving = duesSavingId === o.id;
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', width: cellWidth, boxSizing: 'border-box' }}>
            {isAdmin ? (
              <div style={{ display: 'grid', gap: 3 }}>
                <select
                  value={o.duesMemberId || ''}
                  disabled={saving}
                  onChange={(e) => setDuesCoverage(o, e.target.value)}
                  style={{
                    width: '100%', padding: '6px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: `1.5px solid ${linkedMember ? '#10b981' : '#e2e8f0'}`,
                    background: linkedMember ? '#ecfdf5' : '#fff',
                    color: linkedMember ? '#059669' : '#475569',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">일반 결제</option>
                  {activeMembersSorted.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.part}) 회비 충당</option>
                  ))}
                </select>
                {linkedMember && (
                  <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>{coveredAmount.toLocaleString()}원 충당</span>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: linkedMember ? '#059669' : '#94a3b8' }}>
                {linkedMember ? `${linkedMember.name} 회비 충당` : '-'}
              </span>
            )}
          </td>
        );
      }
      case 'inviterName':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', fontSize: 13, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: cellWidth, boxSizing: 'border-box' }}>
            {o.inviterName || '-'}
          </td>
        );
      case 'afterParty':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', width: cellWidth, boxSizing: 'border-box' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: o.isAfterParty ? '#111827' : '#94a3b8' }}>
              {o.isAfterParty ? (o.afterPartyCount || 1) : 0}
            </div>
          </td>
        );
      case 'comment':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--slate-500)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: cellWidth, boxSizing: 'border-box' }}>
            {o.comment || '-'}
          </td>
        );
      case 'createdAt':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--slate-500)', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', width: cellWidth, boxSizing: 'border-box' }}>
            {o.createdAt ? formatDate(o.createdAt) : '-'}
          </td>
        );
      case 'attendStatus':
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', width: cellWidth, boxSizing: 'border-box' }}>
            <button
              type="button"
              onClick={() => toggleAttendance(o)}
              style={{
                width: '100%', padding: '7px 8px', borderRadius: 9,
                border: `1.5px solid ${isEntered ? '#10b981' : currentEntered > 0 ? '#f59e0b' : 'var(--slate-200)'}`,
                background: isEntered ? '#10b981' : currentEntered > 0 ? '#fef3c7' : '#fff',
                color: isEntered ? '#fff' : currentEntered > 0 ? '#92400e' : '#64748b',
                fontSize: 12, fontWeight: 800, cursor: isAdmin ? 'pointer' : 'default',
                whiteSpace: 'nowrap', transition: 'all 0.2s', boxSizing: 'border-box',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              {isEntered ? '✓ 입장 완료' : `${currentEntered}/${totalTickets} 입장`}
            </button>
          </td>
        );
      default:
        return <td key={colId} style={{ width: cellWidth, boxSizing: 'border-box' }} />;
    }
  }, [isAdmin, checkinMode, orders, colMap, totalPriceFor, members, activeMembersSorted, duesSavingId]);

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
      {showColSettings && (
        <ColumnSettingsPanel
          colOrder={colOrder}
          setColOrder={setColOrder}
          hiddenCols={hiddenCols}
          setHiddenCols={setHiddenCols}
          onClose={() => setShowColSettings(false)}
        />
      )}

      <div className="page-container" style={{ display: 'grid', gap: 20, padding: '32px 16px' }}>
        {/* ── 페이지 헤더 ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase' }}>티켓 관리</span>
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

        {/* ── [섹션 1] 상단 요약 카드 및 '입장 관리 모드(당일 모드)' 토글 + 예매자 관리 내역(테이블) ── */}
        
        {/* 1-1. 상단 통계 요약 카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <StatCard label="총 신청 매수" value={`${totals.tickets}매`} color="#111827" />
          <StatCard label="총 입장 인원" value={`${totals.enteredTotal}명`} color="#111827" />
          <StatCard label="입금 완료" value={`${totals.paidTickets}매`} color="#059669" />
          <StatCard label="뒤풀이 인원" value={`${totals.afterParties}명`} color="#64748b" />
        </div>

        {/* 1-1-1. 가격 구간(기간별/한정 수량) 조회 및 관리 */}
        {currentShow && (
          <PriceTierSection
            show={currentShow}
            isAdmin={isAdmin}
            soldByTier={soldByTier}
            activeTier={activeTier}
            onSave={savePriceTiers}
          />
        )}

        {/* 1-2. 예매자 관리 내역 (테이블) 카드 */}
        <div className="card card-pad" style={{ display: 'grid', gap: 14, borderRadius: 20, border: '1px solid #e2e8f0' }}>

          {/* 입장 관리 모드 (당일 모드) 토글 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '14px 18px', borderRadius: 14,
            background: checkinMode ? '#111827' : '#f8fafc',
            border: checkinMode ? '1.5px solid #374151' : '1.5px solid #e2e8f0',
            transition: 'all 0.25s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>🚪</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: checkinMode ? '#f8fafc' : '#0f172a' }}>
                  입장 관리 모드 (당일 모드)
                </div>
                <div style={{ fontSize: 12, color: checkinMode ? '#94a3b8' : '#64748b', marginTop: 2, fontWeight: 600 }}>
                  {checkinMode
                    ? '활성화됨 — 입장 여부, 예매자명, 티켓 매수, 연락처 4개 핵심 컬럼만 노출됩니다.'
                    : '활성화 시 당일 체크인에 필요한 핵심 4개 컬럼(입장 여부/이름/매수/전화번호)만 노출됩니다.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCheckinMode(v => !v)}
              style={{
                position: 'relative', width: 52, height: 28, borderRadius: 14, border: 'none',
                background: checkinMode ? '#10b981' : '#cbd5e1', cursor: 'pointer', flexShrink: 0,
                transition: 'background 0.25s ease'
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: checkinMode ? 26 : 3,
                width: 22, height: 22, borderRadius: 11, background: '#fff',
                boxShadow: '0 2px 5px rgba(0,0,0,0.18)', transition: 'left 0.25s ease', display: 'block'
              }} />
            </button>
          </div>

          {/* 검색창 & 액션 버튼들 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 15, color: '#94a3b8' }}>🔎</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예매자명 또는 연락처 검색 (하이픈 없이 입력 가능)"
                className="search-input"
                style={{ width: '100%', paddingLeft: 38, height: 42, boxSizing: 'border-box', borderRadius: 12, fontSize: 14 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {isAdmin && !checkinMode && (
                <button
                  type="button"
                  onClick={() => setShowColSettings(true)}
                  style={{ height: 42, padding: '0 14px', borderRadius: 12, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', transition: 'all 0.2s' }}
                >⚙️ 컬럼 설정</button>
              )}
              <button type="button" className="btn-secondary" style={{ height: 42, padding: '0 14px', borderRadius: 12, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={exportCsv}>CSV 내보내기</button>
            </div>
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
                  height: 34, padding: '0 14px', borderRadius: 8, border: '1.5px solid',
                  borderColor: filter === value ? '#111827' : '#e2e8f0',
                  background: filter === value ? '#111827' : '#fff',
                  color: filter === value ? '#fff' : '#475569',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                }}
              >{label}</button>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 13, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              총 {visibleOrders.length}건
            </div>
          </div>

          {visibleOrders.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 15, fontWeight: 500 }}>표시할 예매 정보가 없습니다.</div>
          ) : (
            <div style={{ overflowX: 'auto', margin: '0 -24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'fixed', minWidth: checkinMode ? 480 : 720 }}>
                <thead>
                  <tr style={{ background: checkinMode ? '#1e293b' : 'var(--slate-50)', borderBottom: '2px solid var(--slate-100)' }}>
                    {visibleColOrder.map(id => {
                      const col = colMap[id];
                      if (!col) return null;
                      return (
                        <th
                          key={id}
                          style={{
                            padding: '14px 8px', textAlign: 'center', fontSize: 13, fontWeight: 800,
                            color: checkinMode ? '#f8fafc' : 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            width: col.width ? `${col.width}px` : undefined,
                            boxSizing: 'border-box'
                          }}
                        >
                          {col.label}
                        </th>
                      );
                    })}
                    {isAdmin && !checkinMode && (
                      <th style={{ padding: '14px 8px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap', width: 64, boxSizing: 'border-box' }}>삭제</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((o) => (
                    <tr
                      key={o.id}
                      style={{
                        borderBottom: '1px solid var(--slate-100)',
                        transition: 'background 0.2s',
                        background: o.attendanceStatus === ATTEND_DONE && checkinMode ? '#f0fdf4' : undefined,
                      }}
                    >
                      {visibleColOrder.map(id => renderCell(o, id))}
                      {isAdmin && !checkinMode && (
                        <td style={{ padding: '14px 8px', textAlign: 'center', width: 64, boxSizing: 'border-box' }}>
                          <button
                            type="button"
                            onClick={() => deleteOrder(o)}
                            title="예매 내역 삭제"
                            style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 15, cursor: 'pointer', padding: '4px 8px', fontWeight: 800 }}
                          >✕</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--slate-100)', fontWeight: 800, borderTop: '2px solid var(--slate-200)' }}>
                    {visibleColOrder.map((id, i) => {
                      const col = colMap[id];
                      const cellWidth = col?.width ? `${col.width}px` : undefined;
                      if (i === 0) return <td key={id} style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--slate-700)', width: cellWidth, boxSizing: 'border-box' }}>합계</td>;
                      if (id === 'ticketCount') return <td key={id} style={{ padding: '14px 8px', textAlign: 'center', color: '#111827', width: cellWidth, boxSizing: 'border-box' }}>{totals.tickets}매</td>;
                      if (id === 'afterParty') return <td key={id} style={{ padding: '14px 8px', textAlign: 'center', color: '#475569', width: cellWidth, boxSizing: 'border-box' }}>{totals.afterParties}명</td>;
                      if (id === 'attendStatus') return <td key={id} style={{ padding: '14px 8px', textAlign: 'center', color: '#059669', width: cellWidth, boxSizing: 'border-box' }}>{totals.enteredTotal}명 입장</td>;
                      return <td key={id} style={{ width: cellWidth, boxSizing: 'border-box' }} />;
                    })}
                    {isAdmin && !checkinMode && <td style={{ width: 64, boxSizing: 'border-box' }} />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>


        {/* ── [섹션 2] 후원금 관리 섹션 (개별 내역 아코디언/토글 UI) ── */}
        <div style={{ background: '#111827', borderRadius: 20, padding: '20px 24px', color: '#fff', display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>후원금 관리</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                총 모금액 {totals.totalFund.toLocaleString()}원
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, lineHeight: 1.5 }}>
                {isTiered
                  ? `입금완료 ${totals.paidTickets}매 (가격 구간별 단가 적용)`
                  : `입금완료 ${totals.paidTickets}매 × ${totals.ticketPrice.toLocaleString()}원`}
                {totals.extraDonation > 0 && <span style={{ color: '#10b981' }}> + 후원금 총 {totals.extraDonation.toLocaleString()}원 ({donationList.length}건)</span>}
              </div>
              {totals.duesCoveredSum > 0 && (
                <div style={{ fontSize: 12, color: '#60a5fa', marginTop: 2, lineHeight: 1.5 }}>
                  (이 중 회비로 충당된 금액 {totals.duesCoveredSum.toLocaleString()}원, {totals.duesCoveredCount}건 — 정산 시 참고용, 회원 개인 회비 납부 내역에는 반영되지 않음)
                </div>
              )}
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowDonationAccordion(prev => !prev)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 16px', borderRadius: 12, border: '1px solid #374151',
                  background: showDonationAccordion ? '#1f2937' : 'transparent',
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                <span>{showDonationAccordion ? '▲ 내역 접기' : '▼ 후원금 내역 관리'}</span>
                <span style={{ padding: '2px 8px', borderRadius: 10, background: '#374151', fontSize: 12, color: '#10b981', fontWeight: 800 }}>
                  {donationList.length}건
                </span>
              </button>
            )}
          </div>

          {/* 접기/펼치기 (Accordion) 입력 및 내역 영역 */}
          {isAdmin && showDonationAccordion && (
            <div style={{ borderTop: '1px solid #374151', paddingTop: 16, display: 'grid', gap: 14 }} className="fade-in">
              <div style={{ fontSize: 13, color: '#f3f4f6', fontWeight: 800 }}>
                건별 후원금 기록 추가 및 삭제 (날짜 최신순 정렬)
              </div>

              {/* 후원금 입력 폼 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                <input
                  type="text"
                  value={donorName}
                  onChange={e => setDonorName(e.target.value)}
                  placeholder="후원자명 (예: 홍길동)"
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #374151', background: '#1f2937', color: '#fff', fontSize: 13, fontWeight: 600, outline: 'none' }}
                />
                <input
                  type="number"
                  value={donationAmount}
                  onChange={e => setDonationAmount(e.target.value)}
                  placeholder="금액 (예: 50000)"
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #374151', background: '#1f2937', color: '#fff', fontSize: 13, fontWeight: 600, outline: 'none' }}
                />
                <input
                  type="date"
                  value={donationDate}
                  onChange={e => setDonationDate(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #374151', background: '#1f2937', color: '#fff', fontSize: 13, fontWeight: 600, outline: 'none' }}
                />
                <button
                  type="button"
                  onClick={addDonationItem}
                  disabled={savingDonation}
                  style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: savingDonation ? '#374151' : '#10b981', color: '#fff', fontWeight: 800, fontSize: 13, cursor: savingDonation ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', transition: 'background 0.2s' }}
                >
                  {savingDonation ? '저장 중...' : '+ 후원금 기록'}
                </button>
              </div>

              {/* 입력된 후원 내역 목록 (날짜 최신순 정렬) */}
              {donationList.length > 0 ? (
                <div style={{ display: 'grid', gap: 6, marginTop: 4, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                  {donationList.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: '#1f2937', border: '1px solid #374151' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                        <span style={{ fontWeight: 800, color: '#fff' }}>{item.donorName}</span>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>{Number(item.amount).toLocaleString()}원</span>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>({item.date || '-'})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteDonationItem(item.id)}
                        disabled={savingDonation}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer', padding: '2px 8px', fontWeight: 800 }}
                        title="삭제"
                      >✕</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>
                  등록된 개별 후원 내역이 없습니다. 위에서 입력하여 추가하세요.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── [섹션 2-1] 뒤풀이 참여자 전체 명단 (초대자 기재 여부와 무관하게 전원 표시) ── */}
        {afterPartyRoster.list.length > 0 && (
          <div className="card card-pad" style={{ borderRadius: 20, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>뒤풀이 참여자 전체 명단</div>
              <span style={{ padding: '5px 14px', borderRadius: 20, background: '#111827', color: '#fff', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>
                총 {afterPartyRoster.total}명
              </span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {afterPartyRoster.list.map((a, idx) => {
                const mappedMember = a.resolvedInviterMemberId ? members.find(m => m.id === a.resolvedInviterMemberId) : null;
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #f1f5f9', gap: 10, flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                      {a.phone && <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>({a.phone})</span>}
                      {a.inviterName && (
                        <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>입력된 초대자: {a.inviterName}</span>
                      )}
                      {a.isAutoMatched && (
                        <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, whiteSpace: 'nowrap' }}>자동 매칭</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {isAdmin ? (
                        <select
                          value={a.inviterMemberId || (a.isAutoMatched ? a.resolvedInviterMemberId : '')}
                          onChange={(e) => setInviterMapping(a.orderId, e.target.value)}
                          style={{
                            padding: '5px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            border: `1.5px solid ${mappedMember ? '#10b981' : '#e2e8f0'}`,
                            background: mappedMember ? '#ecfdf5' : '#fff',
                            color: mappedMember ? '#059669' : '#475569',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">공연자 매핑 안 됨</option>
                          {activeMembersSorted.map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.part})</option>
                          ))}
                        </select>
                      ) : (
                        mappedMember && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>{mappedMember.name}</span>
                        )
                      )}
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', border: '1px solid #e2e8f0',
                        color: '#0f172a', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap'
                      }}>
                        {a.count}명
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── [섹션 3] 초대자별 뒤풀이 현황 섹션 ── */}
        {inviterStats.length > 0 && (
          <div className="card card-pad" style={{ borderRadius: 20, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 14 }}>초대자별 뒤풀이 현황</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {inviterStats.map(([name, stat]) => {
                const isExpanded = !!expandedInviters[name];
                return (
                  <div key={name} style={{ borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => toggleInviterExpand(name)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', background: '#f8fafc', border: 'none', cursor: 'pointer',
                        transition: 'background 0.2s', textAlign: 'left', gap: 10
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14, color: '#64748b', transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{stat.orders}건 예매 연결</div>
                        </div>
                      </div>
                      <span style={{ padding: '5px 14px', borderRadius: 20, background: '#111827', color: '#fff', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {stat.count}명
                      </span>
                    </button>
                    {isExpanded && (
                      <div style={{ padding: '4px 16px 12px', background: '#fff', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600, paddingTop: 8 }}>유입된 예매자 목록</div>
                        <div style={{ display: 'grid', gap: 6 }}>
                          {stat.attendees.map((a, idx) => (
                            <div key={idx} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '8px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #f1f5f9'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{a.name}</span>
                                {a.phone && <span style={{ fontSize: 12, color: '#64748b' }}>({a.phone})</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                  padding: '3px 10px', borderRadius: 20,
                                  background: a.isAfterParty ? '#f1f5f9' : '#ffffff',
                                  border: '1px solid #e2e8f0',
                                  color: a.isAfterParty ? '#0f172a' : '#64748b',
                                  fontSize: 12, fontWeight: 700
                                }}>
                                  {a.isAfterParty ? `뒤풀이 ${a.afterPartyCount}명` : '미참여'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6, fontSize: 13, color: '#64748b', fontWeight: 700 }}>
                합계: {inviterStats.reduce((s, [, v]) => s + v.count, 0)}명
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontWeight: 500 }}>
          관리자만 상태 토글이 가능합니다. 모든 데이터는 브라우저 로컬 스토리지 및 데이터베이스에 안전하게 보관됩니다.
        </div>
      </div>
    </div>
  );
}
