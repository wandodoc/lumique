import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import './PageStyles.css';

const LS_SHOWS = 'lumique_concerts';
const LS_ORDERS = 'lumique_ticket_orders';
const LS_SHOWS_PENDING = 'lumique_concerts_pending_sync';
const LS_ORDERS_PENDING = 'lumique_ticket_orders_pending_sync';
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

// ── 뒤풀이 관리 섹션: 분류 유형별 배지 텍스트/색상, 기본 정렬 우선순위(미매핑 우선) ──
const AFTER_PARTY_TYPE_BADGE = {
  performer: { text: '✓ 공연자', color: '#059669' },
  unmapped: { text: '미매핑', color: '#b45309' },
  unassigned: { text: '미기재', color: '#64748b' },
  group: { text: '텍스트 그룹', color: '#7c3aed' },
};

// ── 뒤풀이 테이블 배치도: 고정 가상 좌표계(px 단위) — 화면 크기가 달라져도 테이블의
// 상대 위치가 항상 동일하게 유지된다. 모바일에서는 이 캔버스만 가로 스크롤을 허용한다. ──
const TABLE_CANVAS_WIDTH = 760;
const TABLE_CANVAS_HEIGHT = 460;
const TABLE_GRID_COLS = 4;
const TABLE_DEFAULT_SIZE = { rect: { width: 130, height: 80 }, circle: { width: 100, height: 100 } };
const TABLE_MIN_SIZE = { width: 60, height: 50 };
const TABLE_NUDGE_STEP = 20;

// 저장된 테이블에 좌표/크기/모양 정보가 없으면(과거 데이터 또는 새로 추가된 테이블) 그리드 기준
// 기본값을 "계산"해서 보여준다 — 실제 저장은 사용자가 처음 옮기거나 편집할 때 비로소 일어난다.
const withTableGeometry = (table, index) => {
  const shape = table.shape === 'circle' ? 'circle' : 'rect';
  const size = TABLE_DEFAULT_SIZE[shape];
  const col = index % TABLE_GRID_COLS;
  const row = Math.floor(index / TABLE_GRID_COLS);
  return {
    ...table,
    shape,
    width: Number(table.width) > 0 ? Number(table.width) : size.width,
    height: Number(table.height) > 0 ? Number(table.height) : size.height,
    x: Number.isFinite(table.x) ? table.x : 30 + col * 180,
    y: Number.isFinite(table.y) ? table.y : 30 + row * 130,
    rotation: Number.isFinite(table.rotation) ? table.rotation : 0,
  };
};

// 두 테이블(사각 바운딩 박스 기준)이 겹치는지 — 회전은 단순화를 위해 반영하지 않는다.
const tablesOverlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// 좌석 하나의 지름 + 좌석 사이 최소 여백 = 한 변에 좌석을 몇 개까지 "여유 있게" 넣을 수
// 있는지 계산하는 기준 길이. 테이블 가장자리에서 좌석 중심까지의 거리도 여기서 고정한다.
const SEAT_DOT_SIZE = 18;
const SEAT_MIN_GAP = 10;
const SEAT_EDGE_OFFSET = 20;
const createSeatId = () => `seat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 변 길이 len에 (코너 쪽 여유를 감안해) 넣을 수 있는 최대 좌석 수.
const seatCapacityForSide = (len) => Math.max(1, Math.floor((len * 0.85) / (SEAT_DOT_SIZE + SEAT_MIN_GAP)));

// 길이 [start, end] 구간에 n개의 좌석을 균등 간격으로 배치한 좌표(1차원)를 돌려준다.
const evenPositionsAlong = (n, start, end) => {
  if (n <= 0) return [];
  const positions = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : (i + 0.5) / n;
    positions.push(start + (end - start) * t);
  }
  return positions;
};

// 테이블의 실제 가로·세로 비율을 기준으로 좌석을 상/하/좌/우 가장자리에 배치한다.
// - 가로로 긴 테이블(width > height): 상/하단을 먼저 채우고, 넘치는 인원만 좌/우로 보낸다.
// - 세로로 긴 테이블(height > width): 좌/우측을 먼저 채우고, 넘치는 인원만 상/하로 보낸다.
// - 정사각형에 가까우면(폭·높이 차이가 작은 변의 15% 이하) 네 변에 고르게 나눈다.
// 좌석은 항상 테이블 가장자리에서 SEAT_EDGE_OFFSET만큼 떨어진, 그 변의 범위 안에만 생긴다
// (테이블 내부나 가장자리와 무관한 위치에는 생기지 않음). 테이블 크기/정원이 바뀌면 이 함수가
// 매번 다시 계산되므로 좌석 배치도 자동으로 따라간다.
const computeSeatSlots = (table, seatCount) => {
  if (seatCount <= 0) return [];
  const { x, y, width, height } = table;

  // 원형 테이블은 상/하/좌/우 구분이 없으니 둘레(원)를 따라 등각으로 배치한다.
  if (table.shape === 'circle') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.max(width, height) / 2 + SEAT_EDGE_OFFSET;
    const slots = [];
    for (let i = 0; i < seatCount; i++) {
      const angle = (i / seatCount) * Math.PI * 2 - Math.PI / 2;
      slots.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    return slots;
  }

  const isSquareish = Math.abs(width - height) <= Math.min(width, height) * 0.15;

  let topCount, bottomCount, leftCount, rightCount;
  if (isSquareish) {
    const horizTotal = Math.ceil(seatCount / 2);
    const vertTotal = seatCount - horizTotal;
    topCount = Math.ceil(horizTotal / 2); bottomCount = horizTotal - topCount;
    leftCount = Math.floor(vertTotal / 2); rightCount = vertTotal - leftCount;
  } else if (width > height) {
    const maxHoriz = seatCapacityForSide(width) * 2;
    const horizTotal = Math.min(seatCount, maxHoriz);
    const vertTotal = seatCount - horizTotal;
    topCount = Math.ceil(horizTotal / 2); bottomCount = horizTotal - topCount;
    leftCount = Math.floor(vertTotal / 2); rightCount = vertTotal - leftCount;
  } else {
    const maxVert = seatCapacityForSide(height) * 2;
    const vertTotal = Math.min(seatCount, maxVert);
    const horizTotal = seatCount - vertTotal;
    leftCount = Math.ceil(vertTotal / 2); rightCount = vertTotal - leftCount;
    topCount = Math.floor(horizTotal / 2); bottomCount = horizTotal - topCount;
  }

  const slots = [];
  evenPositionsAlong(topCount, x, x + width).forEach(px => slots.push({ x: px, y: y - SEAT_EDGE_OFFSET }));
  evenPositionsAlong(rightCount, y, y + height).forEach(py => slots.push({ x: x + width + SEAT_EDGE_OFFSET, y: py }));
  evenPositionsAlong(bottomCount, x, x + width).forEach(px => slots.push({ x: px, y: y + height + SEAT_EDGE_OFFSET }));
  evenPositionsAlong(leftCount, y, y + height).forEach(py => slots.push({ x: x - SEAT_EDGE_OFFSET, y: py }));
  return slots;
};

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

/* =========================================================
   초대자 매핑 선택 패널 (검색 가능한 공연자 선택 + 텍스트 그룹 지정)
   - 오버레이가 아닌 인라인 패널이라 모바일 화면 밖으로 나가지 않는다.
   ========================================================= */
function InviterMappingPicker({
  members, existingGroupLabels,
  currentMemberId, currentGroupLabel,
  onSelectPerformer, onSelectGroup, onClear,
  disabled, triggerText,
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('performer');
  const [query, setQuery] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const currentMember = currentMemberId ? members.find(m => m.id === currentMemberId) : null;

  if (disabled) {
    if (currentMember) return <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>{currentMember.name}</span>;
    if (currentGroupLabel) return <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>{currentGroupLabel}</span>;
    return null;
  }

  const label = triggerText || (currentMember ? `공연자: ${currentMember.name}` : currentGroupLabel ? `텍스트 그룹: ${currentGroupLabel}` : '매핑하기');
  const color = currentMember ? '#059669' : currentGroupLabel ? '#7c3aed' : '#475569';
  const bg = currentMember ? '#ecfdf5' : currentGroupLabel ? '#f5f3ff' : '#fff';
  const border = currentMember ? '#10b981' : currentGroupLabel ? '#c4b5fd' : '#e2e8f0';
  const filteredMembers = query.trim() ? members.filter(m => m.name.includes(query.trim())) : members;

  return (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          border: `1.5px solid ${border}`, background: bg, color, cursor: 'pointer', whiteSpace: 'nowrap'
        }}
      >
        {label} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: 6, width: 'min(280px, 100%)', border: '1px solid #e2e8f0', borderRadius: 10,
          background: '#fff', boxShadow: '0 6px 16px rgba(15,23,42,0.1)', padding: 10, boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => setTab('performer')} style={{
              flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${tab === 'performer' ? '#111827' : '#e2e8f0'}`,
              background: tab === 'performer' ? '#111827' : '#fff', color: tab === 'performer' ? '#fff' : '#64748b'
            }}>공연자</button>
            <button type="button" onClick={() => setTab('group')} style={{
              flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${tab === 'group' ? '#111827' : '#e2e8f0'}`,
              background: tab === 'group' ? '#111827' : '#fff', color: tab === 'group' ? '#fff' : '#64748b'
            }}>텍스트 그룹</button>
          </div>

          {tab === 'performer' ? (
            <>
              <input
                type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="공연자 이름 검색" autoFocus
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', marginBottom: 6 }}
              />
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 4 }}>
                {filteredMembers.length === 0 && (
                  <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>검색 결과 없음</div>
                )}
                {filteredMembers.map(m => (
                  <button key={m.id} type="button"
                    onClick={() => { onSelectPerformer(m.id); setOpen(false); setQuery(''); }}
                    style={{
                      textAlign: 'left', padding: '7px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${m.id === currentMemberId ? '#10b981' : '#f1f5f9'}`,
                      background: m.id === currentMemberId ? '#ecfdf5' : '#f8fafc',
                      color: m.id === currentMemberId ? '#059669' : '#1e293b'
                    }}
                  >
                    {m.name} ({m.part})
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="새 그룹명 입력 (예: 지인 초대)"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', minWidth: 0 }}
                />
                <button type="button"
                  onClick={() => { if (newLabel.trim()) { onSelectGroup(newLabel.trim()); setOpen(false); setNewLabel(''); } }}
                  style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#111827', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >지정</button>
              </div>
              {existingGroupLabels.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
                  {existingGroupLabels.map(l => (
                    <button key={l} type="button"
                      onClick={() => { onSelectGroup(l); setOpen(false); }}
                      style={{
                        padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: `1px solid ${l === currentGroupLabel ? '#9333ea' : '#e2e8f0'}`,
                        background: l === currentGroupLabel ? '#f5f3ff' : '#f8fafc',
                        color: l === currentGroupLabel ? '#7c3aed' : '#475569'
                      }}
                    >{l}</button>
                  ))}
                </div>
              )}
            </>
          )}

          {(currentMemberId || currentGroupLabel) && (
            <button type="button" onClick={() => { onClear(); setOpen(false); }}
              style={{ width: '100%', marginTop: 10, padding: '6px 0', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >매핑 해제</button>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   2순위 이하 공연자 추가용 검색 패널 (인라인, 모바일 안전)
   ========================================================= */
function AddPerformerPicker({ members, excludeIds = [], onAdd, triggerText = '+ 공연자 추가' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const candidates = members.filter(m => !excludeIds.includes(m.id) && (!query.trim() || m.name.includes(query.trim())));

  return (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{
        padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: '1.5px dashed #cbd5e1', background: '#fff', color: '#475569', whiteSpace: 'nowrap'
      }}>{triggerText}</button>
      {open && (
        <div style={{
          marginTop: 6, width: 'min(240px, 100%)', border: '1px solid #e2e8f0', borderRadius: 10,
          background: '#fff', boxShadow: '0 6px 16px rgba(15,23,42,0.1)', padding: 10, boxSizing: 'border-box'
        }}>
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름 검색" autoFocus
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', marginBottom: 6 }}
          />
          <div style={{ maxHeight: 160, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {candidates.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>추가할 수 있는 회원이 없습니다</div>
            )}
            {candidates.map(m => (
              <button key={m.id} type="button" onClick={() => { onAdd(m.id); setOpen(false); setQuery(''); }}
                style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1px solid #f1f5f9', background: '#f8fafc', color: '#1e293b' }}
              >{m.name} ({m.part})</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   뒤풀이 테이블 배치 선택 패널 (인라인, 모바일 안전)
   ========================================================= */
function TableAssignPicker({ tables, currentTableId, pendingCount = 1, onAssign, onUnassign, triggerText }) {
  const [open, setOpen] = useState(false);
  const currentEntry = tables.find(t => t.table.id === currentTableId);
  const label = triggerText || (currentEntry ? currentEntry.table.name : '테이블 배치');

  return (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{
        padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: `1.5px solid ${currentEntry ? '#10b981' : '#e2e8f0'}`,
        background: currentEntry ? '#ecfdf5' : '#fff', color: currentEntry ? '#059669' : '#475569', whiteSpace: 'nowrap'
      }}>{label} {open ? '▲' : '▼'}</button>
      {open && (
        <div style={{
          marginTop: 6, width: 'min(240px, 100%)', border: '1px solid #e2e8f0', borderRadius: 10,
          background: '#fff', boxShadow: '0 6px 16px rgba(15,23,42,0.1)', padding: 10, boxSizing: 'border-box'
        }}>
          {tables.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>생성된 테이블이 없습니다. 먼저 테이블을 추가해 주세요.</div>
          ) : (
            <div style={{ display: 'grid', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
              {tables.map(t => {
                const remaining = t.table.capacity - t.count;
                const willExceed = pendingCount > remaining && t.table.id !== currentTableId;
                return (
                  <button key={t.table.id} type="button" onClick={() => { onAssign(t.table.id); setOpen(false); }}
                    style={{
                      textAlign: 'left', padding: '7px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${t.table.id === currentTableId ? '#10b981' : '#f1f5f9'}`,
                      background: t.table.id === currentTableId ? '#ecfdf5' : '#f8fafc',
                      color: willExceed ? '#dc2626' : '#1e293b',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.table.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{t.count}/{t.table.capacity}{willExceed ? ' 초과' : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
          {currentTableId && (
            <button type="button" onClick={() => { onUnassign(); setOpen(false); }}
              style={{ width: '100%', marginTop: 10, padding: '6px 0', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >미배치로 이동</button>
          )}
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
  const [reservationPage, setReservationPage] = useState(0);
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


  // 뒤풀이 관리 섹션 — 검색/필터/다중 선택/매핑 저장 오류 상태
  const [mgmtQuery, setMgmtQuery] = useState('');
  const [mgmtFilter, setMgmtFilter] = useState('all');
  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState([]);
  const [mappingErrorMsg, setMappingErrorMsg] = useState('');
  const [afterPartyTab, setAfterPartyTab] = useState('participants'); // 'participants' | 'tables'
  // 참여자 관리: 한 번에 하나의 편집 대상만 연다(아코디언). 그룹 key, 또는 개별 신청 "order:<id>".
  const [activeEditKey, setActiveEditKey] = useState(null);
  const [selectedSeatingIds, setSelectedSeatingIds] = useState([]); // 테이블 배치: 미배치 참여자 다중 선택
  const [selectedTableId, setSelectedTableId] = useState(null); // 배치도: 편집 중인 테이블(위치/정원/모양 등)
  // 배치도: 드래그 중인 테이블의 "확정 전" 임시 위치(포인터를 떼는 순간에만 실제로 저장한다).
  const [dragInfo, setDragInfo] = useState(null); // { tableId, startClientX, startClientY, startX, startY, x, y }
  const [seatDragInfo, setSeatDragInfo] = useState(null);
  const [seatAssignmentSelection, setSeatAssignmentSelection] = useState('');
  const [seatCountDraft, setSeatCountDraft] = useState({});
  const [performerSearchDraft, setPerformerSearchDraft] = useState('');
  const [performerSelectionByTable, setPerformerSelectionByTable] = useState({});
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [seatingActionStatus, setSeatingActionStatus] = useState('');
  const seatDragMovedRef = useRef(false);
  const seatMigrationRef = useRef(new Set());

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
      const pendingConcerts = loadLS(LS_SHOWS_PENDING);
      const pendingOrders = loadLS(LS_ORDERS_PENDING);
      if (pendingConcerts.length) fbConcerts = pendingConcerts;
      if (pendingOrders.length) fbOrders = pendingOrders;
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
    }).map((order, originalIndex) => ({ order, originalIndex, createdAt: Date.parse(order.createdAt) }))
      .sort((a, b) => {
        const aHasDate = Number.isFinite(a.createdAt);
        const bHasDate = Number.isFinite(b.createdAt);
        if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
        if (aHasDate && a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
        return a.originalIndex - b.originalIndex;
      })
      .map(({ order }) => order);
  }, [orders, query, filter, concertId]);

  useEffect(() => setReservationPage(0), [query, filter, concertId]);
  const reservationPageCount = Math.ceil(visibleOrders.length / 10);
  const visibleReservationPage = useMemo(() => visibleOrders.slice(reservationPage * 10, reservationPage * 10 + 10), [visibleOrders, reservationPage]);

  // 공연별 가격 구간(기간별/한정 수량) 정보 — 신청 매수 집계 및 조회/관리 패널에 사용.
  const showsById = useMemo(() => Object.fromEntries(shows.map(s => [s.id, s])), [shows]);
  const ordersById = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders]);
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

  // inviterMemberId의 세 가지 상태를 구분한다 (불필요한 별도 필드를 새로 만들지 않고 값 자체로 구분):
  // - 실제 회원 id(문자열)  → 관리자가 수동으로 지정한 공연자 매핑
  // - 빈 문자열 ''          → 관리자가 "매핑 해제"를 눌러 명시적으로 미매핑 상태를 확정함
  //                           (원본 텍스트가 회원 이름과 일치해도 자동 매칭을 다시 적용하지 않음)
  // - null/undefined       → 아직 아무 조작도 하지 않은 상태 → 자동 매칭을 적용
  // 기존 데이터에는 이 필드가 아예 없어(undefined) 항상 자동 매칭 경로를 타므로 이전 동작과 호환된다.
  const resolveInviterMember = (o) => {
    if (o.inviterMemberId) return members.find(m => m.id === o.inviterMemberId) || null;
    if (o.inviterMemberId === '') return null;
    return autoMatchInviterMember(o.inviterName);
  };

  // 뒤풀이 참여 신청 한 건을 네 가지 상태 중 하나로 분류한다.
  // - performer: 실제 공연자(회원)에게 매핑됨 (자동 매칭 또는 관리자의 수동 지정)
  // - group:     관리자가 지정한 관리용 텍스트 그룹으로 분류됨 (공연자 실적 집계에서 제외)
  // - unmapped:  초대자 텍스트는 있지만 실제 공연자가 확정되지 않음 (이름 불일치 등)
  // - unassigned: 초대자를 전혀 적지 않음(또는 '없음')
  // 관리자가 지정한 텍스트 그룹이 가장 우선하고, 그다음 공연자 매핑(수동 → 자동) 순으로 판단한다.
  const classifyAfterPartyOrder = (o) => {
    if (o.inviterGroupLabel) {
      return { type: 'group', key: `group:${o.inviterGroupLabel}`, label: o.inviterGroupLabel, member: null };
    }
    const member = resolveInviterMember(o);
    if (member) {
      return { type: 'performer', key: `member:${member.id}`, label: member.name, member };
    }
    const hasText = o.inviterName && o.inviterName !== '없음';
    if (hasText) {
      const firstName = o.inviterName.split(',')[0]?.trim() || o.inviterName;
      return { type: 'unmapped', key: `text:${firstName}`, label: firstName, member: null };
    }
    return { type: 'unassigned', key: `order:${o.id}`, label: o.audienceName || '(이름없음)', member: null };
  };

  // 뒤풀이 참여자를 공연자/미매핑 텍스트/관리용 텍스트 그룹은 그룹으로 묶고,
  // 초대자 미기재 건은 서로 다른 공연자일 수 있어 개별 항목으로 따로 둔다.
  const afterPartyEntries = useMemo(() => {
    const src = concertId ? orders.filter(o => o.concertId === concertId) : orders;
    const groupMap = {};
    const individuals = [];
    for (const o of src) {
      if (!o.isAfterParty) continue;
      const c = classifyAfterPartyOrder(o);
      const count = Number(o.afterPartyCount) || 1;
      const attendee = {
        orderId: o.id,
        name: o.audienceName || '(이름없음)',
        phone: o.phone || '',
        count,
        createdAt: o.createdAt || null,
        inviterName: (o.inviterName && o.inviterName !== '없음') ? o.inviterName : '',
        depositStatus: o.depositStatus,
        attendanceStatus: o.attendanceStatus,
      };
      if (c.type === 'unassigned') {
        individuals.push(attendee);
        continue;
      }
      if (!groupMap[c.key]) {
        groupMap[c.key] = { key: c.key, type: c.type, label: c.label, memberId: c.member?.id || null, count: 0, orderIds: [], attendees: [], latestCreatedAt: null };
      }
      groupMap[c.key].count += count;
      groupMap[c.key].orderIds.push(o.id);
      groupMap[c.key].attendees.push(attendee);
      if (o.createdAt && Number.isFinite(Date.parse(o.createdAt)) && Date.parse(o.createdAt) > (Date.parse(groupMap[c.key].latestCreatedAt || '') || 0)) {
        groupMap[c.key].latestCreatedAt = o.createdAt;
      }
    }
    const groups = Object.values(groupMap);
    return { groups, individuals };
  }, [orders, concertId, members]);

  // 상단 요약: 인원 수 기준(그룹 수가 아님). 미매핑 = 전체 - 공연자 매핑 완료 - 텍스트 그룹.
  const afterPartySummary = useMemo(() => {
    const performerMapped = afterPartyEntries.groups.filter(g => g.type === 'performer').reduce((s, g) => s + g.count, 0);
    const textGroup = afterPartyEntries.groups.filter(g => g.type === 'group').reduce((s, g) => s + g.count, 0);
    const unmappedGroupCount = afterPartyEntries.groups.filter(g => g.type === 'unmapped').reduce((s, g) => s + g.count, 0);
    const unassignedCount = afterPartyEntries.individuals.reduce((s, i) => s + i.count, 0);
    const total = performerMapped + textGroup + unmappedGroupCount + unassignedCount;
    return { total, performerMapped, textGroup, unmapped: unmappedGroupCount + unassignedCount };
  }, [afterPartyEntries]);

  // 관리자가 과거에 만들어 둔 텍스트 그룹명 목록 (재사용을 위해 전체 공연 기준으로 수집)
  const existingGroupLabels = useMemo(() => {
    const set = new Set();
    orders.forEach(o => { if (o.inviterGroupLabel) set.add(o.inviterGroupLabel); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  // 뒤풀이 매핑/배치 관련 쓰기 작업의 단일 통로. orderIds에 patch를 병합해 저장하고,
  // 실패 시 배너로 보여줄 오류 메시지를 지정한다.
  const applyAfterPartyPatch = async (orderIds, patch, failMsg) => {
    if (!isAdmin || !orderIds || orderIds.length === 0) return;
    setMappingErrorMsg('');
    const idSet = new Set(orderIds);
    const nextOrders = orders.map(o => (idSet.has(o.id) ? { ...o, ...patch } : o));
    try {
      const saved = await firebaseStorage.saveOrders(nextOrders);
      if (saved) {
        try {
          localStorage.setItem(LS_ORDERS, JSON.stringify(nextOrders));
          localStorage.removeItem(LS_ORDERS_PENDING);
        } catch { }
        setOrders(nextOrders);
        return;
      }
      localStorage.setItem(LS_ORDERS, JSON.stringify(nextOrders));
      localStorage.setItem(LS_ORDERS_PENDING, JSON.stringify(nextOrders));
      setOrders(nextOrders);
      setMappingErrorMsg('Firebase 저장에 실패해 이 기기의 로컬 백업에만 저장했습니다. 연결 복구 후 동기화가 필요합니다.');
    } catch {
      setMappingErrorMsg(failMsg);
    }
  };

  // orderIds를 실제 공연자(회원)에게 한 번에 매핑한다(=1순위 지정). 기존에 지정돼 있던
  // 관리용 텍스트 그룹은 해제된다. 2순위 이하 참고용 목록(inviterExtraMemberIds)은 그대로 둔다.
  const assignPerformer = (orderIds, memberId) =>
    applyAfterPartyPatch(orderIds, { inviterMemberId: memberId || null, inviterGroupLabel: null }, '공연자 매핑 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');

  // orderIds를 관리자가 지정한 텍스트 그룹으로 분류한다. 공연자 매핑과 참고용 복수 공연자
  // 목록은 모두 해제한다 — 텍스트 그룹은 공연자 실적과 별개의 분류이기 때문이다.
  const assignGroupLabel = (orderIds, groupLabel) =>
    applyAfterPartyPatch(orderIds, { inviterGroupLabel: groupLabel, inviterMemberId: null, inviterExtraMemberIds: [] }, '텍스트 그룹 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');

  // orderIds를 "명시적 매핑 해제" 상태로 확정한다. inviterMemberId를 빈 문자열('')로 저장해,
  // 원본 텍스트가 회원 이름과 일치하더라도 자동 매칭이 다시 적용되지 않도록 한다(미매핑 유지).
  // 2순위 이하 참고용 목록은 유지한다(1순위 확정 여부와 무관한 별개의 참고 정보).
  const clearInviterClassification = (orderIds) =>
    applyAfterPartyPatch(orderIds, { inviterMemberId: '', inviterGroupLabel: null }, '매핑 해제 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');

  // ── 복수 공연자(2순위 이하) 관리 — 한 건(order) 단위로만 동작한다 ──
  // inviterExtraMemberIds: 2순위부터의 참고용 공연자 id 배열(수동 전용, 실적 집계에는 영향 없음).
  const getExtraPerformerIds = (o) => (Array.isArray(o?.inviterExtraMemberIds) ? o.inviterExtraMemberIds : []);

  // 2순위 이하 공연자를 추가한다. 이미 1순위이거나 이미 목록에 있으면(중복 등록 방지) 무시한다.
  const addExtraPerformer = (orderId, memberId) => {
    const o = orders.find(x => x.id === orderId);
    if (!o || !memberId) return;
    const primary = resolveInviterMember(o);
    if (primary && primary.id === memberId) return;
    const extras = getExtraPerformerIds(o);
    if (extras.includes(memberId)) return;
    applyAfterPartyPatch([orderId], { inviterExtraMemberIds: [...extras, memberId] }, '공연자 추가 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
  };

  // 2순위 이하 목록에서 공연자를 제거한다.
  const removeExtraPerformer = (orderId, memberId) => {
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    const extras = getExtraPerformerIds(o).filter(id => id !== memberId);
    applyAfterPartyPatch([orderId], { inviterExtraMemberIds: extras }, '공연자 삭제 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
  };

  // 2순위 이하 목록 안에서 순서를 한 칸 옮긴다(위/아래 이동 = 우선순위 변경).
  const moveExtraPerformer = (orderId, memberId, direction) => {
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    const extras = [...getExtraPerformerIds(o)];
    const idx = extras.indexOf(memberId);
    const nextIdx = idx + direction;
    if (idx < 0 || nextIdx < 0 || nextIdx >= extras.length) return;
    [extras[idx], extras[nextIdx]] = [extras[nextIdx], extras[idx]];
    applyAfterPartyPatch([orderId], { inviterExtraMemberIds: extras }, '우선순위 변경 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
  };

  // 2순위 이하의 특정 공연자를 1순위로 끌어올린다. 기존 1순위(자동/수동 매칭 결과)는
  // 실제 회원이었다면 2순위 목록 맨 앞으로 내려가고, 선택한 공연자는 목록에서 빠진다.
  const promoteExtraToPrimary = (orderId, memberId) => {
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    const oldPrimary = resolveInviterMember(o);
    const extras = getExtraPerformerIds(o).filter(id => id !== memberId);
    if (oldPrimary && oldPrimary.id !== memberId) extras.unshift(oldPrimary.id);
    applyAfterPartyPatch([orderId], { inviterMemberId: memberId, inviterGroupLabel: null, inviterExtraMemberIds: extras }, '우선순위 변경 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
  };

  const toggleUnassignedSelection = (orderId) => {
    setSelectedUnassignedIds(prev => (prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]));
  };

  // 이름표를 클릭해 그 대상의 편집 영역을 열고 닫는다. 한 번에 하나만 열리는 아코디언 —
  // 같은 대상을 다시 클릭하면 닫히고, 다른 대상을 클릭하면 그쪽으로 전환된다.
  const toggleActiveEdit = (key) => {
    setActiveEditKey(prev => (prev === key ? null : key));
  };

  // orderId 한 건의 "1순위 + 2순위 이하" 복수 공연자 관리 패널을 렌더링한다.
  // 1순위는 기존 InviterMappingPicker(자동/수동/명시적 해제/텍스트 그룹)를 그대로 쓰고,
  // 2순위부터는 inviterExtraMemberIds 배열을 수동으로만 관리한다.
  const renderPerformerPriorityPanel = (orderId) => {
    const o = ordersById[orderId];
    if (!o) return null;
    const primary = resolveInviterMember(o);
    const extraIds = getExtraPerformerIds(o);
    const extraMembers = extraIds.map(id => members.find(m => m.id === id)).filter(Boolean);
    const excludeIds = [...(primary ? [primary.id] : []), ...extraIds];
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>초대자 우선순위 (실적은 1순위에만 반영)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', width: 44, flexShrink: 0 }}>1순위</span>
          <InviterMappingPicker
            members={activeMembersSorted}
            existingGroupLabels={existingGroupLabels}
            currentMemberId={o.inviterGroupLabel ? null : (primary?.id || null)}
            currentGroupLabel={o.inviterGroupLabel || null}
            disabled={!isAdmin}
            onSelectPerformer={(memberId) => assignPerformer([orderId], memberId)}
            onSelectGroup={(groupLabel) => assignGroupLabel([orderId], groupLabel)}
            onClear={() => clearInviterClassification([orderId])}
          />
        </div>
        {extraMembers.map((m, idx) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', width: 44, flexShrink: 0 }}>{idx + 2}순위</span>
            <span style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
              {m.name} ({m.part})
            </span>
            {isAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" disabled={idx === 0} onClick={() => moveExtraPerformer(orderId, m.id, -1)} title="우선순위 올리기"
                  style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: 11, opacity: idx === 0 ? 0.4 : 1 }}
                >▲</button>
                <button type="button" disabled={idx === extraMembers.length - 1} onClick={() => moveExtraPerformer(orderId, m.id, 1)} title="우선순위 내리기"
                  style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: idx === extraMembers.length - 1 ? 'not-allowed' : 'pointer', fontSize: 11, opacity: idx === extraMembers.length - 1 ? 0.4 : 1 }}
                >▼</button>
                <button type="button" onClick={() => promoteExtraToPrimary(orderId, m.id)}
                  style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >1순위로</button>
                <button type="button" onClick={() => removeExtraPerformer(orderId, m.id)} title="삭제"
                  style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >✕</button>
              </div>
            )}
          </div>
        ))}
        {isAdmin && (
          <div>
            <AddPerformerPicker members={activeMembersSorted} excludeIds={excludeIds} onAdd={(memberId) => addExtraPerformer(orderId, memberId)} />
          </div>
        )}
      </div>
    );
  };

  // 매핑 편집 영역 하나를 렌더링한다. 체크박스 다중 선택이 있으면 그걸 최우선으로,
  // 없으면 방금 클릭한 단일 대상(그룹 또는 개별 신청 한 건)을 보여준다.
  // 폭을 제한(maxWidth)해 넓은 화면에서도 불필요한 빈 공간 없이 내용에 맞게 표시된다.
  const renderMappingEditorPanel = () => {
    const editorPanelStyle = {
      width: '100%', maxWidth: 480, boxSizing: 'border-box', marginTop: 12,
      borderRadius: 14, border: '1.5px solid #c7d2fe', background: '#f5f6ff', padding: '14px 16px',
    };
    const closeBtnStyle = { background: 'none', border: 'none', color: '#94a3b8', fontWeight: 800, fontSize: 13, cursor: 'pointer', flexShrink: 0 };

    // 1) 체크박스로 여러 명을 선택한 경우 — 일괄 작업 패널이 최우선
    if (isAdmin && selectedUnassignedIds.length > 0) {
      const selectedNames = selectedUnassignedIds.map(id => ordersById[id]?.audienceName || '(이름없음)');
      return (
        <div style={editorPanelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8' }}>{selectedUnassignedIds.length}명 선택됨</span>
            <button type="button" onClick={() => setSelectedUnassignedIds([])} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {selectedNames.map((name, idx) => (
              <span key={idx} style={{ padding: '3px 10px', borderRadius: 14, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>{name}</span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>일괄 매핑:</span>
            <InviterMappingPicker
              members={activeMembersSorted}
              existingGroupLabels={existingGroupLabels}
              currentMemberId={null}
              currentGroupLabel={null}
              triggerText="공연자/텍스트 그룹 선택"
              onSelectPerformer={(memberId) => { assignPerformer(selectedUnassignedIds, memberId); setSelectedUnassignedIds([]); }}
              onSelectGroup={(groupLabel) => { assignGroupLabel(selectedUnassignedIds, groupLabel); setSelectedUnassignedIds([]); }}
              onClear={() => setSelectedUnassignedIds([])}
            />
          </div>
        </div>
      );
    }

    if (!activeEditKey) return null;

    // 2) 개별 신청 한 건의 편집 — 1순위/2순위 이하 복수 공연자 패널
    if (activeEditKey.startsWith('order:')) {
      const orderId = activeEditKey.slice('order:'.length);
      const o = ordersById[orderId];
      if (!o) return null;
      return (
        <div style={editorPanelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{o.audienceName || '(이름없음)'} 매핑 편집</span>
            <button type="button" onClick={() => setActiveEditKey(null)} style={closeBtnStyle}>✕</button>
          </div>
          {o.phone && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>연락처: {o.phone}</div>}
          {renderPerformerPriorityPanel(orderId)}
        </div>
      );
    }

    // 3) 그룹(공연자/미매핑 텍스트/관리용 텍스트 그룹)의 편집 — 그룹 전체 재매핑 + 소속 예매자 칩
    //    (칩을 클릭하면 그 한 명만의 편집 패널로 전환된다)
    const row = afterPartyRowsByKey[activeEditKey];
    if (!row || row.kind !== 'group') return null;
    return (
      <div style={editorPanelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{row.label} · {row.count}명</span>
          <button type="button" onClick={() => setActiveEditKey(null)} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>그룹 전체 재매핑:</span>
          <InviterMappingPicker
            members={activeMembersSorted}
            existingGroupLabels={existingGroupLabels}
            currentMemberId={row.memberId}
            currentGroupLabel={row.type === 'group' ? row.label : null}
            disabled={!isAdmin}
            onSelectPerformer={(memberId) => assignPerformer(row.orderIds, memberId)}
            onSelectGroup={(groupLabel) => assignGroupLabel(row.orderIds, groupLabel)}
            onClear={() => clearInviterClassification(row.orderIds)}
          />
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>
          유입된 예매자 {row.orderIds.length}건 — 클릭하면 한 명만 따로 편집
        </div>
        {row.type === 'group' && (
          <form onSubmit={(event) => {
            event.preventDefault();
            const label = String(new FormData(event.currentTarget).get('groupLabel') || '').trim();
            if (label && label !== row.label) assignGroupLabel(row.orderIds, label);
          }} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input name="groupLabel" defaultValue={row.label} aria-label="텍스트 그룹 이름" style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
            <button type="submit" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>그룹명 변경</button>
          </form>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {row.attendees.map((a) => (
            <button key={a.orderId} type="button" onClick={() => setActiveEditKey(`order:${a.orderId}`)}
              style={{ padding: '5px 10px', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}
            >{a.name} ({a.count}명)</button>
          ))}
        </div>
      </div>
    );
  };

  // 테이블 배치: 미배치 참여자 다중 선택 토글
  const toggleSeatingSelection = (orderId) => {
    setSelectedSeatingIds(prev => (prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]));
  };

  // ── 뒤풀이 테이블 배치 — 공연자 매핑과는 완전히 독립된 데이터(콘서트 레코드에 저장) ──
  // tables: [{ id, name, capacity, shape, x, y, width, height, rotation }], seatAssignments: { [orderId]: tableId }
  const afterPartyTables = useMemo(
    () => (Array.isArray(currentShow?.tables) ? currentShow.tables : []).map((t, i) => {
      const table = withTableGeometry(t, i);
      if (Array.isArray(t.seats)) return { ...table, capacity: t.seats.length, seats: t.seats };
      const initial = computeSeatSlots(table, Math.max(0, Number(table.capacity) || 0));
      return { ...table, seats: initial.map(point => ({ id: createSeatId(), x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)), y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)) })) };
    }),
    [currentShow]
  );
  const seatAssignments = useMemo(() => (currentShow?.seatAssignments && typeof currentShow.seatAssignments === 'object' ? currentShow.seatAssignments : {}), [currentShow]);
  const participantSeatAssignments = useMemo(() => (currentShow?.participantSeatAssignments && typeof currentShow.participantSeatAssignments === 'object' ? currentShow.participantSeatAssignments : {}), [currentShow]);
  const performerSeatAssignments = useMemo(() => (currentShow?.performerSeatAssignments && typeof currentShow.performerSeatAssignments === 'object' ? currentShow.performerSeatAssignments : {}), [currentShow]);
  const autoSeatAssignments = useMemo(() => (currentShow?.autoSeatAssignments && typeof currentShow.autoSeatAssignments === 'object' ? currentShow.autoSeatAssignments : {}), [currentShow]);
  const manualSeatAssignments = useMemo(() => (currentShow?.manualSeatAssignments && typeof currentShow.manualSeatAssignments === 'object' ? currentShow.manualSeatAssignments : {}), [currentShow]);

  // 공연자 매핑 상태와 무관하게, 뒤풀이 참여 체크한 모든 신청을 평평한 목록으로 — 테이블 배치는 이 목록만 본다.
  const afterPartyParticipants = useMemo(() => {
    const src = concertId ? orders.filter(o => o.concertId === concertId) : orders;
    return src
      .filter(o => o.isAfterParty)
      .map(o => ({
        orderId: o.id,
        name: o.audienceName || '(이름없음)',
        phone: o.phone || '',
        count: Number(o.afterPartyCount) || 1,
        createdAt: o.createdAt || null,
      }))
      .map((person, originalIndex) => ({ ...person, originalIndex, createdAtMs: Date.parse(person.createdAt) }))
      .sort((a, b) => {
        const aHasDate = Number.isFinite(a.createdAtMs);
        const bHasDate = Number.isFinite(b.createdAtMs);
        if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
        if (aHasDate && a.createdAtMs !== b.createdAtMs) return b.createdAtMs - a.createdAtMs;
        return a.originalIndex - b.originalIndex;
      })
      .map(person => ({
        orderId: person.orderId,
        name: person.name,
        phone: person.phone,
        count: person.count,
        createdAt: person.createdAt,
      }));
  }, [orders, concertId]);

  // 테이블별 배치 인원/잔여석과 미배치 인원을 계산한다. 삭제된 테이블을 가리키는 배치 기록은
  // 자동으로 미배치로 취급한다(참조가 깨져도 오류 없이 동작).
  const seatingOverview = useMemo(() => {
    const byTable = {};
    afterPartyTables.forEach(t => { byTable[t.id] = { table: t, participants: [], performers: [], count: 0, attendeeCount: 0 }; });
    const seatTableById = new Map(afterPartyTables.flatMap(table => table.seats.map(seat => [seat.id, table.id])));
    const attendeeTableByKey = new Map();
    Object.entries(participantSeatAssignments).forEach(([seatId, assignment]) => {
      const tableId = seatTableById.get(seatId);
      if (tableId && assignment?.orderId && Number.isInteger(Number(assignment.attendeeIndex))) {
        attendeeTableByKey.set(`${assignment.orderId}:${Number(assignment.attendeeIndex)}`, tableId);
      }
    });
    Object.entries(performerSeatAssignments).forEach(([seatId, memberId]) => {
      const tableId = seatTableById.get(seatId);
      const member = members.find(item => item.id === memberId);
      if (tableId && member) {
        byTable[tableId].performers.push(member);
        byTable[tableId].count += 1;
      }
    });
    const unassigned = [];
    for (const p of afterPartyParticipants) {
      const countsByTable = new Map();
      let unassignedCount = 0;
      for (let attendeeIndex = 0; attendeeIndex < p.count; attendeeIndex += 1) {
        const tableId = attendeeTableByKey.get(`${p.orderId}:${attendeeIndex}`) || seatAssignments[p.orderId];
        if (tableId && byTable[tableId]) {
          attendeeTableByKey.set(`${p.orderId}:${attendeeIndex}`, tableId);
          countsByTable.set(tableId, (countsByTable.get(tableId) || 0) + 1);
        }
        else unassignedCount += 1;
      }
      countsByTable.forEach((count, tableId) => {
        byTable[tableId].participants.push({ ...p, count, reservationCount: p.count });
        byTable[tableId].count += count;
        byTable[tableId].attendeeCount += count;
      });
      if (unassignedCount > 0) {
        unassigned.push({ ...p, count: unassignedCount });
      }
    }
    const totalAll = afterPartyParticipants.reduce((s, p) => s + p.count, 0);
    const totalPlaced = Object.values(byTable).reduce((s, t) => s + t.attendeeCount, 0);
    const performerCountPlaced = Object.values(byTable).reduce((s, t) => s + t.performers.length, 0);
    const overCapacityCount = afterPartyTables.filter(t => byTable[t.id].count > t.capacity).length;
    return {
      tables: afterPartyTables.map(t => byTable[t.id]), unassigned, totalAll, totalPlaced,
      totalUnassigned: totalAll - totalPlaced, tableCount: afterPartyTables.length, overCapacityCount, performerCountPlaced, attendeeTableByKey,
    };
  }, [afterPartyTables, seatAssignments, participantSeatAssignments, performerSeatAssignments, afterPartyParticipants, members]);

  // 콘서트 레코드에 테이블/배치 패치를 저장한다(최신본을 다시 불러와 병합 — savePriceTiers와 동일한 방식).
  const saveSeatingPatch = useCallback(async (patch) => {
    if (!isAdmin || !currentShow || !concertId) return false;
    setMappingErrorMsg('');
    try {
      const concerts = await firebaseStorage.loadConcerts();
      // A local backup may contain a newer patch than Firebase after a failed save.
      // Use it first so the next successful save cannot silently discard queued changes.
      const candidates = [loadLS(LS_SHOWS_PENDING), concerts, shows, loadLS(LS_SHOWS)];
      const source = candidates.find(items => items.some(item => String(item.id) === String(concertId)));
      if (!source) {
        setMappingErrorMsg('저장할 공연 데이터를 찾지 못했습니다. 공연 목록을 새로고침한 뒤 다시 시도해 주세요.');
        return false;
      }
      const updated = source.map(c => (String(c.id) === String(concertId) ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c));
      const saved = await firebaseStorage.saveConcerts(updated);
      if (!saved) {
        localStorage.setItem(LS_SHOWS, JSON.stringify(updated));
        localStorage.setItem(LS_SHOWS_PENDING, JSON.stringify(updated));
        setShows(updated);
        setMappingErrorMsg('Firebase 저장에 실패해 이 기기의 로컬 백업에만 저장했습니다. 연결 복구 후 동기화가 필요합니다.');
        return 'local';
      }
      try {
        localStorage.setItem(LS_SHOWS, JSON.stringify(updated));
        localStorage.removeItem(LS_SHOWS_PENDING);
      } catch { }
      setShows(updated);
      return 'firebase';
    } catch {
      setMappingErrorMsg('테이블 배치 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
    }
  }, [isAdmin, currentShow, concertId, setShows, shows]);

  const materializeLegacySeatAssignments = () => {
    const next = { ...participantSeatAssignments };
    const occupied = new Set([...Object.keys(next), ...Object.keys(performerSeatAssignments)]);
    afterPartyParticipants.forEach(person => {
      for (let attendeeIndex = 0; attendeeIndex < person.count; attendeeIndex += 1) {
        const hasSeat = Object.values(next).some(value => value?.orderId === person.orderId && value?.attendeeIndex === attendeeIndex);
        if (hasSeat) continue;
        const tableId = seatingOverview.attendeeTableByKey.get(`${person.orderId}:${attendeeIndex}`);
        const table = afterPartyTables.find(item => item.id === tableId);
        const seat = table?.seats.find(item => !occupied.has(item.id));
        if (seat) {
          next[seat.id] = { orderId: person.orderId, attendeeIndex };
          occupied.add(seat.id);
        }
      }
    });
    return next;
  };

  const assignSelectedAttendeeToSeat = (seatId, tableId) => {
    if (!seatAssignmentSelection) return;
    const targetTable = afterPartyTables.find(table => table.id === tableId);
    if (!targetTable?.seats.some(seat => seat.id === seatId)) return;
    let attendee;
    try { attendee = JSON.parse(seatAssignmentSelection); } catch { return; }
    const [orderId, attendeeIndex] = attendee;
    const next = materializeLegacySeatAssignments();
    const performerId = performerSeatAssignments[seatId];
    if (performerId) {
      window.alert('이 좌석은 공연자가 사용 중입니다. 다른 좌석을 선택해 주세요.');
      return;
    }
    const currentOccupant = next[seatId];
    if (currentOccupant && (currentOccupant.orderId !== orderId || currentOccupant.attendeeIndex !== attendeeIndex)) {
      window.alert('이미 다른 참여자가 배정된 좌석입니다. 빈 좌석을 선택해 주세요.');
      return;
    }
    Object.keys(next).forEach(id => {
      if (next[id]?.orderId === orderId && next[id]?.attendeeIndex === attendeeIndex) delete next[id];
    });
    next[seatId] = { orderId, attendeeIndex };
    const nextAssignments = { ...seatAssignments };
    delete nextAssignments[orderId];
    const nextAuto = { ...autoSeatAssignments };
    const nextManual = { ...manualSeatAssignments, [orderId]: true };
    delete nextAuto[orderId];
    saveSeatingPatch({ participantSeatAssignments: next, seatAssignments: nextAssignments, autoSeatAssignments: nextAuto, manualSeatAssignments: nextManual });
    setSeatAssignmentSelection('');
  };

  const unassignSelectedAttendee = () => {
    if (!seatAssignmentSelection) return;
    let attendee;
    try { attendee = JSON.parse(seatAssignmentSelection); } catch { return; }
    const [orderId, attendeeIndex] = attendee;
    const next = materializeLegacySeatAssignments();
    const key = `${orderId}:${attendeeIndex}`;
    if (!Object.values(next).some(value => value?.orderId === orderId && value?.attendeeIndex === attendeeIndex) && !seatingOverview.attendeeTableByKey.has(key)) {
      window.alert('선택한 참여자는 현재 좌석에 배정되어 있지 않습니다.');
      return;
    }
    Object.keys(next).forEach(seatId => {
      if (next[seatId]?.orderId === orderId && next[seatId]?.attendeeIndex === attendeeIndex) delete next[seatId];
    });
    const nextAssignments = { ...seatAssignments };
    delete nextAssignments[orderId];
    const nextAuto = { ...autoSeatAssignments };
    const nextManual = { ...manualSeatAssignments, [orderId]: true };
    delete nextAuto[orderId];
    saveSeatingPatch({ participantSeatAssignments: next, seatAssignments: nextAssignments, autoSeatAssignments: nextAuto, manualSeatAssignments: nextManual });
    setSeatAssignmentSelection('');
  };

  useEffect(() => {
    if (!isAdmin || !currentShow || !Array.isArray(currentShow.tables)) return;
    if (currentShow.tables.every(table => Array.isArray(table.seats) && Number(table.capacity) === table.seats.length)) return;
    if (seatMigrationRef.current.has(currentShow.id)) return;
    seatMigrationRef.current.add(currentShow.id);
    const migrated = { ...(currentShow.participantSeatAssignments || {}) };
    seatingOverview.tables.forEach(({ table, participants }) => {
      let index = 0;
      participants.forEach(person => {
        for (let attendeeIndex = 0; attendeeIndex < person.count && index < table.seats.length; attendeeIndex += 1, index += 1) {
          if (!Object.values(migrated).some(value => value?.orderId === person.orderId && value?.attendeeIndex === attendeeIndex)) {
            migrated[table.seats[index].id] = { orderId: person.orderId, attendeeIndex };
          }
        }
      });
    });
    saveSeatingPatch({ tables: afterPartyTables, participantSeatAssignments: migrated });
  }, [isAdmin, currentShow, afterPartyTables, seatingOverview.tables, saveSeatingPatch]);

  const addTable = () => {
    const name = `테이블 ${afterPartyTables.length + 1}`;
    const positioned = withTableGeometry({ id: `table-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, capacity: 6 }, afterPartyTables.length);
    const table = { ...positioned, ...clampTablePosition(positioned.x, positioned.y, positioned.width, positioned.height) };
    const newTable = { ...table, seats: computeSeatSlots(table, 6).map(point => ({ id: createSeatId(), x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)), y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)) })) };
    saveSeatingPatch({ tables: [...afterPartyTables, newTable] });
  };

  const removeTable = (tableId) => {
    if (!window.confirm('이 테이블을 삭제하면 배치된 예매자는 미배치되고 공연자 좌석도 해제됩니다. 계속하시겠습니까?')) return;
    const removedTable = afterPartyTables.find(table => table.id === tableId);
    const nextTables = afterPartyTables.filter(t => t.id !== tableId);
    const nextAssignments = { ...seatAssignments };
    Object.keys(nextAssignments).forEach(orderId => { if (nextAssignments[orderId] === tableId) delete nextAssignments[orderId]; });
    const nextParticipantSeats = { ...participantSeatAssignments };
    const removedOrderIds = Object.keys(seatAssignments).filter(orderId => seatAssignments[orderId] === tableId);
    Object.keys(nextParticipantSeats).forEach(seatId => { if (removedOrderIds.includes(nextParticipantSeats[seatId]?.orderId)) delete nextParticipantSeats[seatId]; });
    (removedTable?.seats || []).forEach(seat => delete nextParticipantSeats[seat.id]);
    const nextPerformerSeats = { ...performerSeatAssignments };
    (removedTable?.seats || []).forEach(seat => delete nextPerformerSeats[seat.id]);
    saveSeatingPatch({ tables: nextTables, seatAssignments: nextAssignments, participantSeatAssignments: nextParticipantSeats, performerSeatAssignments: nextPerformerSeats });
  };

  const renameTable = (tableId, name) => {
    saveSeatingPatch({ tables: afterPartyTables.map(t => (t.id === tableId ? { ...t, name } : t)) });
  };

  const setTableCapacity = (tableId, capacity) => {
    const n = Math.max(0, Math.floor(Number(capacity) || 0));
    const table = afterPartyTables.find(item => item.id === tableId);
    if (!table) return;
    if (n === table.seats.length) return;
    let seats = [...table.seats];
    const nextParticipants = materializeLegacySeatAssignments();
    const nextPerformerSeats = { ...performerSeatAssignments };
    const nextAssignments = { ...seatAssignments };
    const nextAuto = { ...autoSeatAssignments };
    const nextManual = { ...manualSeatAssignments };
    if (n < seats.length) {
      const removed = seats.slice(n);
      const removedAttendees = removed.map(seat => nextParticipants[seat.id]).filter(Boolean);
      const removedPerformerIds = removed.map(seat => nextPerformerSeats[seat.id]).filter(Boolean);
      if ((removedAttendees.length || removedPerformerIds.length) && !window.confirm('줄어드는 좌석에 배정된 참여자와 공연자의 좌석 배정을 해제합니다. 계속하시겠습니까?')) return;
      const removedOrderIds = new Set(removedAttendees.map(assignment => assignment.orderId));
      removed.forEach(seat => delete nextParticipants[seat.id]);
      removed.forEach(seat => delete nextPerformerSeats[seat.id]);
      removedOrderIds.forEach(orderId => {
        delete nextAssignments[orderId];
        delete nextAuto[orderId];
        nextManual[orderId] = true;
      });
      seats = seats.slice(0, n);
    } else {
      const slots = computeSeatSlots({ ...table, capacity: n }, n).slice(seats.length);
      seats = [...seats, ...slots.map(point => ({ id: createSeatId(), x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)), y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)) }))];
    }
    const tables = afterPartyTables.map(item => item.id === tableId ? { ...item, seats, capacity: seats.length } : item);
    saveSeatingPatch({ tables, participantSeatAssignments: nextParticipants, performerSeatAssignments: nextPerformerSeats, seatAssignments: nextAssignments, autoSeatAssignments: nextAuto, manualSeatAssignments: nextManual });
  };

  // 관리자의 직접 변경은 자동 배치 표식과 분리해 이후 자동 재배치에서 보존한다.
  const assignToTable = (orderIds, tableId) => {
    const nextAssignments = { ...seatAssignments };
    const nextAuto = { ...autoSeatAssignments };
    const nextManual = { ...manualSeatAssignments };
    const nextParticipantSeats = { ...participantSeatAssignments };
    orderIds.forEach(id => {
      if (tableId) nextAssignments[id] = tableId;
      else delete nextAssignments[id];
      delete nextAuto[id];
      nextManual[id] = true;
      Object.keys(nextParticipantSeats).forEach(seatId => { if (nextParticipantSeats[seatId]?.orderId === id) delete nextParticipantSeats[seatId]; });
    });
    if (tableId) {
      const table = afterPartyTables.find(item => item.id === tableId);
      const used = new Set([...Object.keys(nextParticipantSeats), ...Object.keys(performerSeatAssignments)]);
      const freeSeats = (table?.seats || []).filter(seat => !used.has(seat.id));
      const requiredSeats = orderIds.reduce((total, id) => total + (afterPartyParticipants.find(person => person.orderId === id)?.count || 0), 0);
      if (!table || freeSeats.length < requiredSeats) {
        window.alert(`선택한 참여자 ${requiredSeats}명에 비해 빈 좌석이 부족합니다. 빈 좌석 ${freeSeats.length}개입니다. 좌석을 추가하거나 정원이 충분한 테이블을 선택해 주세요.`);
        return;
      }
      let cursor = 0;
      orderIds.forEach(id => {
        const participant = afterPartyParticipants.find(person => person.orderId === id);
        for (let attendeeIndex = 0; participant && attendeeIndex < participant.count && cursor < freeSeats.length; attendeeIndex += 1) {
          nextParticipantSeats[freeSeats[cursor++].id] = { orderId: id, attendeeIndex };
        }
      });
    }
    saveSeatingPatch({ seatAssignments: nextAssignments, autoSeatAssignments: nextAuto, manualSeatAssignments: nextManual, participantSeatAssignments: nextParticipantSeats });
  };

  // 1순위 공연자 매핑만 자동 배치한다. 이전 자동 배정만 재계산하고 수동 배정은 유지한다.
  const autoAssignTables = async (tableOverride = null, participantSeatOverride = null, assignmentOverride = seatAssignments, performerSeatOverride = performerSeatAssignments) => {
    const startingTables = tableOverride || afterPartyTables;
    const mapped = afterPartyParticipants.flatMap(person => {
      const order = ordersById[person.orderId];
      const performer = order && !order.inviterGroupLabel ? resolveInviterMember(order) : null;
      return performer ? [{ ...person, performerId: performer.id, performerName: performer.name }] : [];
    });
    const autoEligible = mapped.filter(person => !manualSeatAssignments[person.orderId] && (!assignmentOverride[person.orderId] || autoSeatAssignments[person.orderId]));
    if (mapped.length === 0) {
      setSeatingActionStatus('실행할 수 없습니다: 뒤풀이 참여 예매 중 유효한 1순위 공연자 매핑이 없습니다. 참여 여부와 공연자 매핑을 확인하세요.');
      return;
    }
    if (autoEligible.length === 0) {
      setSeatingActionStatus('자동 배치할 예매자가 없습니다. 매핑된 예매가 모두 수동 배정 상태라 기존 배치를 보존했습니다.');
      return;
    }
    const movedCount = autoEligible.filter(person => {
      const table = startingTables.find(item => item.id === assignmentOverride[person.orderId]);
      return !table || table.performerId !== person.performerId;
    }).length;
    const previousAutoCount = Object.values(autoSeatAssignments).filter(Boolean).length;
    const performerCount = new Set(autoEligible.map(person => person.performerId)).size;
    if (!window.confirm(`1순위 공연자 ${performerCount}명과 예매자 ${autoEligible.reduce((sum, person) => sum + person.count, 0)}명을 배치합니다. 자동 배정 ${previousAutoCount}건을 갱신하고, 수동 배정은 유지합니다. 미매핑 참여자는 배치하지 않습니다. 예상 변경 ${movedCount}건. 공연자도 테이블 좌석과 정원에 포함됩니다. 계속할까요?`)) {
      setSeatingActionStatus('자동 배치를 취소했습니다. 기존 배치는 변경하지 않았습니다.');
      return;
    }

    const nextAssignments = { ...assignmentOverride };
    const nextAuto = {};
    const nextParticipants = { ...(participantSeatOverride || participantSeatAssignments) };
    const nextPerformerSeats = { ...performerSeatOverride };
    Object.entries(autoSeatAssignments).forEach(([orderId, isAuto]) => {
      if (!isAuto) return;
      delete nextAssignments[orderId];
      Object.keys(nextParticipants).forEach(seatId => { if (nextParticipants[seatId]?.orderId === orderId) delete nextParticipants[seatId]; });
    });
    let tables = [...startingTables];
    const ensureTableSeats = (table) => {
      const seats = [...(table.seats || [])];
      if (seats.length < table.capacity) {
        computeSeatSlots(table, table.capacity).slice(seats.length).forEach(point => seats.push({ id: createSeatId(), x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)), y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)) }));
      }
      return { ...table, seats };
    };
    const newPerformerTable = (performerId, performerName, tableIndex, capacity) => {
      const positioned = withTableGeometry({ id: `table-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: tableIndex === 1 ? performerName : `${performerName} ${tableIndex}`, capacity, performerId, performerTableIndex: tableIndex }, tables.length);
      const base = { ...positioned, ...clampTablePosition(positioned.x, positioned.y, positioned.width, positioned.height) };
      return { ...base, seats: computeSeatSlots(base, capacity).map(point => ({ id: createSeatId(), x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)), y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)) })) };
    };
    const loadByTable = {};
    Object.entries(nextAssignments).forEach(([orderId, tableId]) => {
      const person = afterPartyParticipants.find(item => item.orderId === orderId);
      if (person && !autoSeatAssignments[orderId]) loadByTable[tableId] = (loadByTable[tableId] || 0) + person.count;
    });
    const peopleByPerformer = new Map();
    autoEligible.forEach(person => {
      if (!peopleByPerformer.has(person.performerId)) peopleByPerformer.set(person.performerId, { name: person.performerName, people: [] });
    });
    autoEligible.forEach(person => peopleByPerformer.get(person.performerId)?.people.push(person));
    peopleByPerformer.forEach(({ name, people }, performerId) => {
      let performerTables = tables.filter(table => table.performerId === performerId).sort((a, b) => (a.performerTableIndex || 1) - (b.performerTableIndex || 1));
      if (!performerTables.length) {
        const table = newPerformerTable(performerId, name, 1, 6);
        tables.push(table);
        performerTables = [table];
      }
      performerTables = performerTables.map(table => {
        const updated = { ...table, name: (table.performerTableIndex || 1) === 1 ? name : `${name} ${table.performerTableIndex}` };
        return ensureTableSeats(updated);
      });
      performerTables.forEach(table => { tables = tables.map(item => item.id === table.id ? table : item); });
      const getFreeSeat = (table) => {
        const occupied = new Set([...Object.keys(nextParticipants), ...Object.keys(nextPerformerSeats)]);
        return table.seats.find(seat => !occupied.has(seat.id));
      };
      const existingPerformerSeat = Object.entries(nextPerformerSeats).find(([, memberId]) => memberId === performerId);
      let hostTable = existingPerformerSeat && tables.find(table => table.seats.some(seat => seat.id === existingPerformerSeat[0]));
      let hostSeat = hostTable?.seats.find(seat => seat.id === existingPerformerSeat[0]) || null;
      if (!hostTable) {
        hostTable = performerTables.find(table => (table.capacity - (loadByTable[table.id] || 0)) > 0 && getFreeSeat(table));
        hostSeat = hostTable ? getFreeSeat(hostTable) : null;
      }
      if (!hostSeat) {
        const index = Math.max(0, ...performerTables.map(item => item.performerTableIndex || 1)) + 1;
        hostTable = newPerformerTable(performerId, name, index, Math.max(1, Number(performerTables[0]?.capacity) || 6));
        tables.push(hostTable);
        performerTables.push(hostTable);
        loadByTable[hostTable.id] = 0;
        hostSeat = hostTable.seats[0];
      }
      if (hostSeat && !existingPerformerSeat) {
        nextPerformerSeats[hostSeat.id] = performerId;
        loadByTable[hostTable.id] = (loadByTable[hostTable.id] || 0) + 1;
      }
      people.forEach(person => {
        let firstTableId = null;
        for (let attendeeIndex = 0; attendeeIndex < person.count; attendeeIndex += 1) {
          let table = performerTables.find(candidate => {
            const occupied = candidate.seats.filter(seat => Object.hasOwn(nextParticipants, seat.id) || Object.hasOwn(nextPerformerSeats, seat.id)).length;
            return candidate.capacity - (loadByTable[candidate.id] || 0) > 0 && occupied < candidate.seats.length;
          });
          if (!table) {
            const index = Math.max(0, ...performerTables.map(item => item.performerTableIndex || 1)) + 1;
            const capacity = Math.max(1, Number(performerTables[0]?.capacity) || 6);
            table = newPerformerTable(performerId, name, index, capacity);
            tables.push(table);
            performerTables.push(table);
            loadByTable[table.id] = 0;
          }
          const occupiedSeatIds = new Set([...Object.keys(nextParticipants), ...Object.keys(nextPerformerSeats)]);
          const freeSeat = table.seats.find(seat => !occupiedSeatIds.has(seat.id));
          if (!freeSeat) continue;
          nextParticipants[freeSeat.id] = { orderId: person.orderId, attendeeIndex };
          if (!firstTableId) firstTableId = table.id;
          loadByTable[table.id] = (loadByTable[table.id] || 0) + 1;
        }
        if (firstTableId) nextAssignments[person.orderId] = firstTableId;
        nextAuto[person.orderId] = true;
      });
    });
    setIsAutoAssigning(true);
    setSeatingActionStatus('자동 배치 결과를 저장하고 있습니다…');
    const saveResult = await saveSeatingPatch({ tables, seatAssignments: nextAssignments, autoSeatAssignments: nextAuto, manualSeatAssignments, participantSeatAssignments: nextParticipants, performerSeatAssignments: nextPerformerSeats });
    if (saveResult === 'firebase') {
      setSeatingActionStatus(`배치 완료: 공연자 ${performerCount}명, 예매자 ${autoEligible.reduce((sum, person) => sum + person.count, 0)}명, 테이블 ${tables.length}개. 화면과 Firebase 저장을 갱신했습니다.`);
    } else if (saveResult === 'local') {
      setSeatingActionStatus('배치 결과를 화면과 로컬 백업에 반영했습니다. Firebase 저장은 실패해 동기화가 필요합니다.');
    } else {
      setSeatingActionStatus('저장에 실패했습니다. 오류 안내를 확인한 뒤 다시 시도하세요.');
    }
    setIsAutoAssigning(false);
  };

  // 모든 테이블의 참여자 배치만 해제한다(테이블 자체·이름·위치·정원은 유지). 확인 절차 포함.
  const resetAllSeating = () => {
    if (!window.confirm('모든 예매자와 공연자의 좌석 배정을 해제합니다. 테이블 이름·위치·정원은 그대로 유지됩니다. 계속하시겠습니까?')) return;
    saveSeatingPatch({ seatAssignments: {}, autoSeatAssignments: {}, manualSeatAssignments: {}, participantSeatAssignments: {}, performerSeatAssignments: {} });
  };

  // ── 테이블 배치도: 위치/크기/모양/방향 편집 — afterPartyTables는 이미 기본값이 채워져 있으므로
  // 그 상태 그대로 patch만 덮어써서 저장한다(처음 조작하는 순간 계산된 기본값이 그대로 확정된다). ──
  const updateTableGeometry = (tableId, patch) => {
    saveSeatingPatch({ tables: afterPartyTables.map(t => (t.id === tableId ? { ...t, ...patch } : t)) });
  };

  const setTablePerformer = (tableId, performerId) => {
    const table = afterPartyTables.find(item => item.id === tableId);
    if (!table) return;
    const nextPerformerSeats = { ...performerSeatAssignments };
    const currentPerformerSeatIds = table.seats.filter(seat => nextPerformerSeats[seat.id]).map(seat => seat.id);
    currentPerformerSeatIds.forEach(seatId => delete nextPerformerSeats[seatId]);
    const nextParticipants = materializeLegacySeatAssignments();
    if (!performerId) {
      const tables = afterPartyTables.map(item => item.id === tableId ? { ...item, performerId: null, performerTableIndex: null } : item);
      saveSeatingPatch({ tables, performerSeatAssignments: nextPerformerSeats });
      setPerformerSelectionByTable(previous => ({ ...previous, [tableId]: '' }));
      return;
    }
    const performer = members.find(member => member.id === performerId);
    if (!performer) return;
    const linkedTable = afterPartyTables.find(item => item.id !== tableId && item.performerId === performerId);
    if (linkedTable) {
      window.alert(`${performer.name}은(는) 이미 ${linkedTable.name}에 연결되어 있습니다.`);
      return;
    }
    const seatOnOtherTable = Object.entries(performerSeatAssignments).find(([seatId, memberId]) => {
      if (memberId !== performerId) return false;
      return afterPartyTables.some(item => item.id !== tableId && item.seats.some(seat => seat.id === seatId));
    });
    if (seatOnOtherTable) {
      window.alert(`${performer.name}은(는) 이미 다른 테이블 좌석에 배정되어 있습니다.`);
      return;
    }
    const occupied = new Set([...Object.keys(nextParticipants), ...Object.keys(nextPerformerSeats)]);
    let seats = [...table.seats];
    let freeSeat = seats.find(seat => !occupied.has(seat.id));
    if (!freeSeat) {
      const capacity = seats.length + 1;
      const point = computeSeatSlots({ ...table, capacity }, capacity)[seats.length];
      freeSeat = { id: createSeatId(), x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)), y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)) };
      seats.push(freeSeat);
    }
    nextPerformerSeats[freeSeat.id] = performerId;
    const tables = afterPartyTables.map(item => item.id === tableId ? {
      ...item,
      name: performer.name,
      performerId,
      performerTableIndex: 1,
      seats,
      capacity: seats.length,
    } : item);
    saveSeatingPatch({ tables, participantSeatAssignments: nextParticipants, performerSeatAssignments: nextPerformerSeats });
    setPerformerSelectionByTable(previous => ({ ...previous, [tableId]: performerId }));
  };

  const addChair = (tableId) => {
    const table = afterPartyTables.find(item => item.id === tableId);
    if (!table) return;
    const existing = table.seats || [];
    const center = { x: (table.x + table.width / 2) / TABLE_CANVAS_WIDTH, y: (table.y + table.height + SEAT_EDGE_OFFSET) / TABLE_CANVAS_HEIGHT };
    const seats = [...existing, { id: createSeatId(), x: Math.max(0, Math.min(1, center.x)), y: Math.max(0, Math.min(1, center.y)) }];
    saveSeatingPatch({ tables: afterPartyTables.map(item => item.id === tableId ? { ...item, seats, capacity: seats.length } : item) });
  };

  const removeChair = (tableId, seatId) => {
    const nextParticipants = materializeLegacySeatAssignments();
    const assigned = nextParticipants[seatId];
    const assignedPerformerId = performerSeatAssignments[seatId];
    if ((assigned || assignedPerformerId) && !window.confirm(assignedPerformerId ? '이 좌석의 공연자 배정을 해제할까요?' : '이 좌석에 배정된 참여자의 좌석 배정을 해제할까요?')) return;
    const tables = afterPartyTables.map(item => item.id === tableId ? { ...item, seats: item.seats.filter(seat => seat.id !== seatId), capacity: Math.max(0, item.seats.length - 1) } : item);
    delete nextParticipants[seatId];
    const nextAssignments = { ...seatAssignments };
    const nextAuto = { ...autoSeatAssignments };
    const nextManual = { ...manualSeatAssignments };
    const nextPerformerSeats = { ...performerSeatAssignments };
    delete nextPerformerSeats[seatId];
    if (assigned?.orderId) {
      delete nextAssignments[assigned.orderId];
      delete nextAuto[assigned.orderId];
      nextManual[assigned.orderId] = true;
    }
    saveSeatingPatch({ tables, participantSeatAssignments: nextParticipants, performerSeatAssignments: nextPerformerSeats, seatAssignments: nextAssignments, autoSeatAssignments: nextAuto, manualSeatAssignments: nextManual });
  };

  const moveChair = (tableId, seatId, x, y) => {
    saveSeatingPatch({ tables: afterPartyTables.map(item => item.id === tableId ? {
      ...item, seats: item.seats.map(seat => seat.id === seatId ? { ...seat, x: Math.max(0, Math.min(1, x / TABLE_CANVAS_WIDTH)), y: Math.max(0, Math.min(1, y / TABLE_CANVAS_HEIGHT)) } : seat)
    } : item) });
  };

  const clampTablePosition = (x, y, width, height) => ({
    x: Math.max(0, Math.min(x, TABLE_CANVAS_WIDTH - width)),
    y: Math.max(0, Math.min(y, TABLE_CANVAS_HEIGHT - height)),
  });

  const moveTableTo = (tableId, x, y) => {
    const t = afterPartyTables.find(tb => tb.id === tableId);
    if (!t) return;
    const position = clampTablePosition(x, y, t.width, t.height);
    const deltaX = position.x - t.x;
    const deltaY = position.y - t.y;
    saveSeatingPatch({
      tables: afterPartyTables.map(item => item.id === tableId ? {
        ...item,
        ...position,
        seats: item.seats.map(seat => ({
          ...seat,
          x: Math.max(0, Math.min(1, seat.x + deltaX / TABLE_CANVAS_WIDTH)),
          y: Math.max(0, Math.min(1, seat.y + deltaY / TABLE_CANVAS_HEIGHT)),
        })),
      } : item),
    });
  };

  // 모바일 등 드래그가 불편한 환경을 위한 대체 조작 — 버튼으로 한 칸씩 이동.
  const nudgeTable = (tableId, dx, dy) => {
    const t = afterPartyTables.find(tb => tb.id === tableId);
    if (!t) return;
    moveTableTo(tableId, t.x + dx, t.y + dy);
  };

  const resizeTable = (tableId, width, height) => {
    const t = afterPartyTables.find(tb => tb.id === tableId);
    if (!t) return;
    const w = Math.max(TABLE_MIN_SIZE.width, Math.min(width, TABLE_CANVAS_WIDTH));
    const h = Math.max(TABLE_MIN_SIZE.height, Math.min(height, TABLE_CANVAS_HEIGHT));
    updateTableGeometry(tableId, { width: w, height: h, ...clampTablePosition(t.x, t.y, w, h) });
  };

  const rotateTable = (tableId, deltaDeg) => {
    const t = afterPartyTables.find(tb => tb.id === tableId);
    if (!t) return;
    updateTableGeometry(tableId, { rotation: ((t.rotation + deltaDeg) % 360 + 360) % 360 });
  };

  const setTableShape = (tableId, shape) => {
    updateTableGeometry(tableId, { shape });
  };

  // 뒤풀이 관리에 표시할 통합 행(그룹 + 초대자 미기재 개별 항목)을 key로 조회할 수 있게 모아둔다.
  // 검색/필터와 무관하게 항상 전체를 담고 있어, 편집 패널이 현재 필터와 상관없이 대상을 찾을 수 있다.
  const afterPartyRowsByKey = useMemo(() => {
    const map = {};
    afterPartyEntries.groups.forEach(g => { map[g.key] = { kind: 'group', ...g }; });
    afterPartyEntries.individuals.forEach(i => {
      const key = `order:${i.orderId}`;
      map[key] = { kind: 'individual', type: 'unassigned', key, label: i.name, count: i.count, orderIds: [i.orderId], attendees: [i], memberId: null, ...i };
    });
    return map;
  }, [afterPartyEntries]);

  // 위 통합 행을 검색/필터/정렬해 목록에 실제로 표시할 순서를 만든다.
  // 기본 정렬은 미매핑(텍스트 불일치·미기재)을 우선 노출한다.
  const afterPartyRows = useMemo(() => {
    const q = mgmtQuery.trim().toLowerCase();
    return Object.values(afterPartyRowsByKey)
      .filter(r => mgmtFilter === 'all' || r.type === mgmtFilter)
      .filter(r => {
        if (!q) return true;
        if (r.label.toLowerCase().includes(q)) return true;
        return r.attendees.some(a => a.name.toLowerCase().includes(q) || a.phone.includes(q) || (a.inviterName || '').toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const timeA = Date.parse(a.latestCreatedAt || a.createdAt || '') || 0;
        const timeB = Date.parse(b.latestCreatedAt || b.createdAt || '') || 0;
        if (timeA !== timeB) return timeB - timeA;
        return String(a.orderIds?.[0] || a.orderId || a.key).localeCompare(String(b.orderIds?.[0] || b.orderId || b.key));
      });
  }, [afterPartyRowsByKey, mgmtQuery, mgmtFilter]);
  const afterPartyRowGroups = useMemo(() => {
    const groups = [];
    for (let start = 0; start < afterPartyRows.length; start += 10) {
      groups.push({ start, rows: afterPartyRows.slice(start, start + 10) });
    }
    return groups;
  }, [afterPartyRows]);

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

  const performerAutoCandidateCount = new Set(afterPartyParticipants.flatMap(person => {
    const order = ordersById[person.orderId];
    const performer = order && !order.inviterGroupLabel ? resolveInviterMember(order) : null;
    return performer ? [performer.id] : [];
  })).size;

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
            <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                신청 최신순 · {visibleOrders.length === 0 ? 0 : reservationPage * 10 + 1}~{Math.min((reservationPage + 1) * 10, visibleOrders.length)} / {visibleOrders.length}건
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" disabled={reservationPage === 0} onClick={() => setReservationPage(page => Math.max(0, page - 1))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: reservationPage === 0 ? 'not-allowed' : 'pointer' }}>이전</button>
                <span style={{ fontSize: 12, color: '#475569' }}>{reservationPage + 1} / {Math.max(1, reservationPageCount)}</span>
                <button type="button" disabled={reservationPage + 1 >= reservationPageCount} onClick={() => setReservationPage(page => Math.min(reservationPageCount - 1, page + 1))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: reservationPage + 1 >= reservationPageCount ? 'not-allowed' : 'pointer' }}>다음</button>
              </div>
            </div>
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
                  {visibleReservationPage.map((o) => (
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
            </>
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

        {/* ── [섹션 3] 뒤풀이 관리 — "참여자 관리"(공연자 매핑/텍스트 그룹/미기재)와
             "테이블 배치"(참여자 관리와 완전히 독립된 데이터)를 탭으로 전환하며 관리한다.
             참여 인원이 0명이어도 섹션 자체는 항상 표시해 오류 없이 빈 상태를 보여준다. */}
        <div className="card card-pad" style={{ borderRadius: 20, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>뒤풀이 관리</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ value: 'participants', label: '참여자 관리' }, { value: 'tables', label: '테이블 배치' }].map(t => (
                  <button key={t.value} type="button" onClick={() => setAfterPartyTab(t.value)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: `1.5px solid ${afterPartyTab === t.value ? '#111827' : '#e2e8f0'}`,
                      background: afterPartyTab === t.value ? '#111827' : '#fff',
                      color: afterPartyTab === t.value ? '#fff' : '#64748b'
                    }}
                  >{t.label}</button>
                ))}
              </div>
            </div>

            {mappingErrorMsg && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca',
                color: '#b91c1c', fontSize: 13, fontWeight: 600, marginBottom: 12
              }}>
                <span>{mappingErrorMsg}</span>
                <button type="button" onClick={() => setMappingErrorMsg('')} style={{ background: 'none', border: 'none', color: '#b91c1c', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            )}

            {afterPartyTab === 'participants' ? (
              <>
                {/* 상단 요약 (그룹 수가 아닌 실제 인원 기준) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <StatCard label="전체 뒤풀이 인원" value={`${afterPartySummary.total}명`} color="#111827" />
                  <StatCard label="공연자 매핑 완료" value={`${afterPartySummary.performerMapped}명`} color="#059669" />
                  <StatCard label="미매핑" value={`${afterPartySummary.unmapped}명`} color="#b45309" />
                  <StatCard label="텍스트 그룹" value={`${afterPartySummary.textGroup}명`} color="#7c3aed" />
                </div>

                {/* 검색 + 상태 필터 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <input
                    type="text" value={mgmtQuery} onChange={(e) => setMgmtQuery(e.target.value)}
                    placeholder="이름, 연락처, 초대자 텍스트, 그룹명 검색"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                    {[
                      { value: 'all', label: '전체' },
                      { value: 'unmapped', label: '미매핑' },
                      { value: 'performer', label: '공연자 매핑 완료' },
                      { value: 'unassigned', label: '미기재' },
                      { value: 'group', label: '텍스트 그룹' },
                    ].map(f => (
                      <button key={f.value} type="button" onClick={() => setMgmtFilter(f.value)}
                        style={{
                          flexShrink: 0, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                          border: `1.5px solid ${mgmtFilter === f.value ? '#111827' : '#e2e8f0'}`,
                          background: mgmtFilter === f.value ? '#111827' : '#fff',
                          color: mgmtFilter === f.value ? '#fff' : '#64748b'
                        }}
                      >{f.label}</button>
                    ))}
                  </div>
                </div>

                {/* 참여자 이름표 목록 — 이름/상태/인원수만 표시하는 컴팩트한 태그.
                     체크박스(일괄 선택)와 태그 클릭(편집 대상 지정)은 서로 다른 동작이다.
                     편집 영역은 여기서 펼치지 않고, 목록 바로 아래에 하나만(아코디언) 별도로 표시한다. */}
                {afterPartyRows.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>검색/필터 조건에 맞는 참여자가 없습니다.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
                    {afterPartyRowGroups.map(({ start, rows }) => (
                      <section key={start} style={{ minWidth: 0, padding: 12, borderRadius: 14, border: '1px solid #e2e8f0', background: '#fbfcfe' }}>
                        <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 800, color: '#64748b' }}>최근 예매 {start + 1}~{start + rows.length}명</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 165px), 1fr))', gap: 8 }}>
                    {rows.map((row) => {
                      const isActive = activeEditKey === row.key;
                      const isChecked = row.kind === 'individual' && selectedUnassignedIds.includes(row.orderId);
                      const badge = AFTER_PARTY_TYPE_BADGE[row.type];
                      return (
                        <div key={row.key} style={{
                          display: 'flex', alignItems: 'center', gap: 6, borderRadius: 12, minWidth: 0,
                          border: `1.5px solid ${isActive ? '#111827' : '#e2e8f0'}`,
                          background: isActive ? '#111827' : (isChecked ? '#eff6ff' : '#f8fafc'),
                          padding: '8px 10px', boxSizing: 'border-box'
                        }}>
                          {row.kind === 'individual' && isAdmin && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleUnassignedSelection(row.orderId)}
                              style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                            />
                          )}
                          <button type="button" onClick={() => toggleActiveEdit(row.key)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', minWidth: 0, flex: 1, textAlign: 'left' }}
                          >
                            <span style={{ fontWeight: 700, fontSize: 13, color: isActive ? '#fff' : '#111827', whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 150, textAlign: 'left' }}>
                              {row.label}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 800, color: isActive ? '#cbd5e1' : badge.color, whiteSpace: 'nowrap' }}>· {badge.text}</span>
                            <span style={{ fontSize: 11, fontWeight: 800, color: isActive ? '#fff' : '#111827', whiteSpace: 'nowrap' }}>{row.count}명</span>
                          </button>
                        </div>
                      );
                    })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                {/* 매핑 편집 영역 — 체크박스로 여러 명 선택했으면 일괄 작업 패널, 아니면 방금 클릭한
                     하나의 대상(그룹 또는 개별 신청)에 대한 편집 패널. 폭을 제한해 불필요하게 넓은
                     빈 공간이 생기지 않도록 하고, 목록과는 테두리/배경으로 뚜렷하게 구분한다. */}
                {renderMappingEditorPanel()}
              </>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {!currentShow ? (
                  <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>공연을 선택해야 테이블 배치를 관리할 수 있습니다.</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                      <StatCard label="전체 뒤풀이 인원" value={`${seatingOverview.totalAll}명`} color="#111827" />
                      <StatCard label="배치 완료" value={`${seatingOverview.totalPlaced}명`} color="#059669" />
                      <StatCard label="미배치" value={`${seatingOverview.totalUnassigned}명`} color="#b45309" />
                      <StatCard label="테이블 배치 공연자" value={`${seatingOverview.performerCountPlaced}명`} color="#047857" />
                      <StatCard label="전체 테이블 수" value={`${seatingOverview.tableCount}개`} color="#2563eb" />
                      <StatCard label="정원 초과 테이블" value={`${seatingOverview.overCapacityCount}개`} color="#dc2626" />
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>예매자 집계와 별도로 공연자도 좌석을 차지하며, 테이블별 인원·정원·잔여 좌석 계산에 포함됩니다.</div>

                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" onClick={addTable}
                          style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#111827', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                        >+ 테이블 추가</button>
                        <button type="button" onClick={() => autoAssignTables()}
                          disabled={performerAutoCandidateCount === 0 || isAutoAssigning}
                          title="1순위 공연자 매핑의 예매자만 공연자 ID에 연결된 테이블로 배치합니다. 자동 배치는 갱신하고 수동 배정은 보존합니다. 미매핑 참여자는 배치하지 않습니다."
                          style={{
                            padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700,
                            cursor: performerAutoCandidateCount === 0 || isAutoAssigning ? 'not-allowed' : 'pointer',
                            opacity: performerAutoCandidateCount === 0 || isAutoAssigning ? 0.5 : 1
                          }}
                        >{isAutoAssigning ? '배치 저장 중…' : '공연자 기준 자동 배치'}</button>
                        {seatingActionStatus && <div role="status" style={{ flexBasis: '100%', padding: '8px 10px', borderRadius: 8, background: seatingActionStatus.startsWith('배치 완료') ? '#ecfdf5' : '#fff7ed', color: seatingActionStatus.startsWith('배치 완료') ? '#047857' : '#9a3412', fontSize: 12, fontWeight: 700 }}>{seatingActionStatus}</div>}
                        <span style={{ flexBasis: '100%', fontSize: 11, color: performerAutoCandidateCount ? '#64748b' : '#b45309' }}>
                          {performerAutoCandidateCount ? `공연자 ID로 매핑된 참여자 그룹 ${performerAutoCandidateCount}개를 처리합니다. 수동 예매자 배정은 보존됩니다.` : '자동 배치 대상이 없습니다. 뒤풀이 참여 여부와 1순위 공연자 매핑을 먼저 확인하세요.'}
                        </span>
                        <button type="button" onClick={resetAllSeating}
                          disabled={Object.keys(seatAssignments).length === 0 && Object.keys(participantSeatAssignments).length === 0 && Object.keys(performerSeatAssignments).length === 0}
                          style={{
                            padding: '8px 14px', borderRadius: 10, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 700,
                            cursor: Object.keys(seatAssignments).length === 0 && Object.keys(participantSeatAssignments).length === 0 && Object.keys(performerSeatAssignments).length === 0 ? 'not-allowed' : 'pointer',
                            opacity: Object.keys(seatAssignments).length === 0 && Object.keys(participantSeatAssignments).length === 0 && Object.keys(performerSeatAssignments).length === 0 ? 0.5 : 1
                          }}
                        >배치 초기화</button>
                      </div>
                    )}

                    {isAdmin && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, border: '1px solid #c7d2fe', background: '#f5f6ff' }}>
                        <label htmlFor="seat-attendee-picker" style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>좌석에 배정할 참여자</label>
                        <select id="seat-attendee-picker" value={seatAssignmentSelection} onChange={event => setSeatAssignmentSelection(event.target.value)} style={{ flex: '1 1 220px', minWidth: 0, maxWidth: 420, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', fontSize: 12 }}>
                          <option value="">참여자를 선택하세요</option>
                          {afterPartyParticipants.flatMap(person => Array.from({ length: person.count }, (_, attendeeIndex) => ({ person, attendeeIndex }))).map(({ person, attendeeIndex }) => {
                            const attendeeKey = `${person.orderId}:${attendeeIndex}`;
                            const assignedTableId = seatingOverview.attendeeTableByKey.get(attendeeKey);
                            const assignedTable = seatingOverview.tables.find(item => item.table.id === assignedTableId)?.table;
                            const label = person.count > 1 ? `${person.name} · ${attendeeIndex + 1}번` : person.name;
                            return <option key={attendeeKey} value={JSON.stringify([person.orderId, attendeeIndex])}>{label} · {assignedTable ? `${assignedTable.name} 배정` : '미배치'}</option>;
                          })}
                        </select>
                        <button type="button" disabled={!seatAssignmentSelection} onClick={unassignSelectedAttendee} style={{ padding: '8px 10px', border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', fontSize: 12, fontWeight: 700, cursor: seatAssignmentSelection ? 'pointer' : 'not-allowed', opacity: seatAssignmentSelection ? 1 : 0.5 }}>선택 좌석 배정 해제</button>
                        <span style={{ flexBasis: '100%', fontSize: 11, color: '#64748b' }}>참여자를 고른 뒤 도면의 빈 좌석을 클릭하세요. 배정된 좌석을 클릭하면 해당 참여자를 선택해 이동할 수 있습니다.</span>
                      </div>
                    )}

                    {/* 공간 배치도 — 테이블을 위에서 내려다본 평면도. 고정 가상 좌표계라 화면 크기가
                         달라져도 테이블 간 상대 위치는 항상 같다. 모바일에서는 이 캔버스 영역만
                         가로로 스크롤되며, 페이지 전체에는 가로 스크롤이 생기지 않는다. */}
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid #e2e8f0', borderRadius: 14 }}>
                      <div
                        onClick={(e) => { if (e.target === e.currentTarget) setSelectedTableId(null); }}
                        style={{
                          position: 'relative', width: TABLE_CANVAS_WIDTH, height: TABLE_CANVAS_HEIGHT, minWidth: TABLE_CANVAS_WIDTH,
                          background: '#fbfbfe',
                          backgroundImage: 'linear-gradient(#eef0f5 1px, transparent 1px), linear-gradient(90deg, #eef0f5 1px, transparent 1px)',
                          backgroundSize: '20px 20px'
                        }}
                      >
                        {afterPartyTables.length === 0 && (
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            아직 생성된 테이블이 없습니다. "테이블 추가"로 시작하세요.
                          </div>
                        )}
                        {afterPartyTables.map((table) => {
                          const isDraggingThis = !!(dragInfo && dragInfo.tableId === table.id);
                          const geom = isDraggingThis ? { ...table, x: dragInfo.x, y: dragInfo.y } : table;
                          const isOverlapping = isDraggingThis && afterPartyTables.some(o => o.id !== table.id && tablesOverlap(geom, o));
                          const entry = seatingOverview.tables.find(t => t.table.id === table.id);
                          const placedCount = entry ? entry.count : 0;
                          const over = placedCount > table.capacity;
                          const linkedPerformer = table.performerId ? members.find(member => member.id === table.performerId) : null;
                          const performerTableIndex = table.performerTableIndex || 1;
                          const tableTitle = table.performerId
                            ? `${linkedPerformer?.name || '미지정'}${performerTableIndex > 1 ? ` ${performerTableIndex}` : ''} 테이블`
                            : table.name;
                          const seatNodes = [];
                          const seats = table.seats || [];
                          const legacySeatOccupants = {};
                          let legacyIndex = 0;
                          (entry?.participants || []).forEach(person => {
                            for (let attendeeIndex = 0; attendeeIndex < person.count; attendeeIndex += 1) {
                              const alreadyAssigned = Object.values(participantSeatAssignments).some(value => value?.orderId === person.orderId && value?.attendeeIndex === attendeeIndex);
                              if (alreadyAssigned) continue;
                              while (legacyIndex < seats.length && (participantSeatAssignments[seats[legacyIndex].id] || performerSeatAssignments[seats[legacyIndex].id] || legacySeatOccupants[seats[legacyIndex].id])) legacyIndex += 1;
                              if (legacyIndex < seats.length) legacySeatOccupants[seats[legacyIndex++].id] = { orderId: person.orderId, attendeeIndex };
                            }
                          });
                          seats.forEach((seat) => {
                            const tableDeltaX = isDraggingThis ? (geom.x - table.x) / TABLE_CANVAS_WIDTH : 0;
                            const tableDeltaY = isDraggingThis ? (geom.y - table.y) / TABLE_CANVAS_HEIGHT : 0;
                            const chair = seatDragInfo?.seatId === seat.id
                              ? { ...seat, x: seatDragInfo.x / TABLE_CANVAS_WIDTH, y: seatDragInfo.y / TABLE_CANVAS_HEIGHT }
                              : {
                                ...seat,
                                x: Math.max(0, Math.min(1, seat.x + tableDeltaX)),
                                y: Math.max(0, Math.min(1, seat.y + tableDeltaY)),
                              };
                            const assigned = participantSeatAssignments[seat.id] || legacySeatOccupants[seat.id];
                            const person = assigned && afterPartyParticipants.find(p => p.orderId === assigned.orderId);
                            const performerId = performerSeatAssignments[seat.id];
                            const performer = performerId && members.find(member => member.id === performerId);
                            const occupantName = performer ? `${performer.name} · 공연자` : person?.name;
                            const occupied = Boolean(person || performer);
                            const sx = chair.x * TABLE_CANVAS_WIDTH;
                            const sy = chair.y * TABLE_CANVAS_HEIGHT;
                            const seatWidth = (name) => name ? Math.min(160, Math.max(40, Array.from(name).length * 7 + 18)) : 22;
                            const currentSeatWidth = seatWidth(occupantName);
                            const overlapsSeat = seats.some(other => {
                              if (other.id === seat.id) return false;
                              const otherAssignment = participantSeatAssignments[other.id] || legacySeatOccupants[other.id];
                              const otherPerson = otherAssignment && afterPartyParticipants.find(item => item.orderId === otherAssignment.orderId);
                              const otherPerformer = members.find(member => member.id === performerSeatAssignments[other.id]);
                              const otherName = otherPerformer ? `${otherPerformer.name} · 공연자` : otherPerson?.name;
                              return Math.abs((other.x - seat.x) * TABLE_CANVAS_WIDTH) < (currentSeatWidth + seatWidth(otherName)) / 2
                                && Math.abs((other.y - seat.y) * TABLE_CANVAS_HEIGHT) < 15;
                            });
                            seatNodes.push(<button key={seat.id} type="button" title={occupantName || '빈 좌석 · 선택 참여자 배정'} aria-label={occupantName || '빈 좌석'} onClick={event => {
                              event.stopPropagation();
                              if (seatDragMovedRef.current) {
                                seatDragMovedRef.current = false;
                                return;
                              }
                              if (!isAdmin) return;
                              if (seatAssignmentSelection) assignSelectedAttendeeToSeat(seat.id, table.id);
                              else if (person) setSeatAssignmentSelection(JSON.stringify([assigned.orderId, assigned.attendeeIndex]));
                            }} onPointerDown={e => {
                              if (!isAdmin) return;
                              e.stopPropagation();
                              seatDragMovedRef.current = false;
                              e.currentTarget.setPointerCapture(e.pointerId);
                              setSelectedTableId(table.id);
                              setSeatDragInfo({ seatId: seat.id, tableId: table.id, startX: sx, startY: sy, clientX: e.clientX, clientY: e.clientY, x: sx, y: sy });
                            }} onPointerMove={e => setSeatDragInfo(prev => {
                              if (!prev || prev.seatId !== seat.id) return prev;
                              const rect = e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                              const scaleX = rect.width / TABLE_CANVAS_WIDTH;
                              const scaleY = rect.height / TABLE_CANVAS_HEIGHT;
                              const x = Math.max(12, Math.min(TABLE_CANVAS_WIDTH - 12, prev.startX + (e.clientX - prev.clientX) / scaleX));
                              const y = Math.max(12, Math.min(TABLE_CANVAS_HEIGHT - 12, prev.startY + (e.clientY - prev.clientY) / scaleY));
                              if (Math.hypot(x - prev.startX, y - prev.startY) > 3) seatDragMovedRef.current = true;
                              return { ...prev, x, y };
                            })} onPointerUp={() => {
                              const moved = seatDragMovedRef.current;
                              if (moved && seatDragInfo?.seatId === seat.id) moveChair(table.id, seat.id, seatDragInfo.x, seatDragInfo.y);
                              setSeatDragInfo(null);
                            }} style={{ position: 'absolute', left: sx, top: sy, transform: 'translate(-50%, -50%)', width: occupied ? seatWidth(occupantName) : 22, maxWidth: 160, height: occupied ? 28 : 22, boxSizing: 'border-box', padding: occupied ? '0 8px' : 0, borderRadius: occupied ? 14 : '50%', background: performer ? '#ecfdf5' : (person ? '#111827' : '#fff'), border: overlapsSeat ? '2px solid #ef4444' : (performer ? '1.5px solid #059669' : (person ? '1.5px solid #111827' : '2px dashed #64748b')), boxShadow: '0 1px 4px rgba(0,0,0,.2)', zIndex: 4, cursor: isAdmin ? 'grab' : 'default', touchAction: 'none', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 800, color: performer ? '#047857' : (person ? '#fff' : '#64748b') }}>{occupantName || (seatAssignmentSelection ? '+' : '')}</button>);
                          });

                          return (
                            <div key={table.id}>
                              {seatNodes}
                              <div
                                onPointerDown={(e) => {
                                  if (!isAdmin) return;
                                  e.currentTarget.setPointerCapture(e.pointerId);
                                  setSelectedTableId(table.id);
                                  setDragInfo({ tableId: table.id, startClientX: e.clientX, startClientY: e.clientY, startX: table.x, startY: table.y, x: table.x, y: table.y });
                                }}
                                onPointerMove={(e) => {
                                  setDragInfo(prev => {
                                    if (!prev || prev.tableId !== table.id) return prev;
                                    const dx = e.clientX - prev.startClientX;
                                    const dy = e.clientY - prev.startClientY;
                                    const clamped = clampTablePosition(prev.startX + dx, prev.startY + dy, table.width, table.height);
                                    return { ...prev, x: clamped.x, y: clamped.y };
                                  });
                                }}
                                onPointerUp={() => {
                                  setDragInfo(prev => {
                                    if (prev && prev.tableId === table.id) moveTableTo(table.id, prev.x, prev.y);
                                    return null;
                                  });
                                }}
                                style={{
                                  position: 'absolute', left: geom.x, top: geom.y, width: table.width, height: table.height,
                                  borderRadius: table.shape === 'circle' ? '50%' : 12,
                                  transform: `rotate(${table.rotation}deg)`,
                                  background: isOverlapping ? '#fee2e2' : (over ? '#fef3c7' : (selectedTableId === table.id ? '#e0e7ff' : '#ffffff')),
                                  border: `2px solid ${isOverlapping ? '#ef4444' : (selectedTableId === table.id ? '#4338ca' : '#94a3b8')}`,
                                  boxShadow: selectedTableId === table.id ? '0 0 0 3px rgba(67,56,202,0.22)' : '0 1px 3px rgba(0,0,0,0.08)',
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                  cursor: isAdmin ? 'grab' : 'default', touchAction: 'none', userSelect: 'none', zIndex: 1, boxSizing: 'border-box'
                                }}
                              >
                                <div title={linkedPerformer?.name || '미지정'} style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', padding: '0 6px', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{tableTitle}</div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: linkedPerformer ? '#047857' : '#94a3b8', maxWidth: '100%', padding: '0 5px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkedPerformer ? `공연자 · ${linkedPerformer.name}` : '공연자 · 미지정'}</div>
                                <div style={{ fontSize: 11, color: over ? '#92400e' : '#475569', fontWeight: 700 }}>{placedCount}/{table.capacity} · 잔여 {Math.max(0, table.capacity - placedCount)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 선택한 테이블 편집 — 이름/정원/모양/크기/위치(버튼 이동, 모바일 대체 조작)/방향/삭제 +
                         그 테이블에 배치된 참여자 이동/제거. 캔버스와 별개의 고정폭 영역이라 화면을 가리지 않는다. */}
                    {selectedTableId && (() => {
                      const table = afterPartyTables.find(t => t.id === selectedTableId);
                      if (!table) return null;
                      const entry = seatingOverview.tables.find(t => t.table.id === selectedTableId);
                      const placed = entry ? entry.participants : [];
                      const linkedPerformer = table.performerId ? members.find(member => member.id === table.performerId) : null;
                      const tableTitle = table.performerId ? `${linkedPerformer?.name || '미지정'}${(table.performerTableIndex || 1) > 1 ? ` ${table.performerTableIndex}` : ''} 테이블` : table.name;
                      const smallBtnStyle = { padding: '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
                      const panelSeatAssignments = { ...participantSeatAssignments };
                      const panelOccupiedSeatIds = new Set([...Object.keys(panelSeatAssignments), ...Object.keys(performerSeatAssignments)]);
                      let panelLegacyIndex = 0;
                      (entry?.participants || []).forEach(person => {
                        for (let attendeeIndex = 0; attendeeIndex < person.count; attendeeIndex += 1) {
                          const hasSeat = Object.values(panelSeatAssignments).some(value => value?.orderId === person.orderId && value?.attendeeIndex === attendeeIndex);
                          if (hasSeat) continue;
                          while (panelLegacyIndex < table.seats.length && panelOccupiedSeatIds.has(table.seats[panelLegacyIndex].id)) panelLegacyIndex += 1;
                          if (panelLegacyIndex < table.seats.length) {
                            const seatId = table.seats[panelLegacyIndex++].id;
                            panelSeatAssignments[seatId] = { orderId: person.orderId, attendeeIndex };
                            panelOccupiedSeatIds.add(seatId);
                          }
                        }
                      });
                      return (
                        <div style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', borderRadius: 14, border: '1.5px solid #c7d2fe', background: '#f5f6ff', padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{tableTitle}</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: linkedPerformer ? '#047857' : '#94a3b8' }}>연결 공연자 · {linkedPerformer?.name || '미지정'} · 인원 {entry?.count || 0}/{table.capacity} · 잔여 {Math.max(0, table.capacity - (entry?.count || 0))}</div>
                            </div>
                            <button type="button" onClick={() => setSelectedTableId(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontWeight: 800, cursor: 'pointer' }}>✕</button>
                          </div>
                          {isAdmin ? (
                            <div style={{ display: 'grid', gap: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, color: '#64748b', width: 40, flexShrink: 0 }}>이름</span>
                                <input type="text" defaultValue={table.name}
                                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== table.name) renameTable(table.id, v); }}
                                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, minWidth: 0, boxSizing: 'border-box' }}
                                />
                              </div>
                              <div style={{ display: 'grid', gap: 6 }}>
                                <label htmlFor={`performer-search-${table.id}`} style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>연결 공연자</label>
                                <input id={`performer-search-${table.id}`} type="search" value={performerSearchDraft} onChange={event => setPerformerSearchDraft(event.target.value)} placeholder="공연자 이름 검색" style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                                <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                                  <select value={performerSelectionByTable[table.id] ?? table.performerId ?? ''} onChange={event => setPerformerSelectionByTable(previous => ({ ...previous, [table.id]: event.target.value }))} style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12 }}>
                                    <option value="">공연자 선택</option>
                                    {members.filter(member => member.name?.toLowerCase().includes(performerSearchDraft.trim().toLowerCase())).map(member => <option key={member.id} value={member.id}>{member.name}{afterPartyTables.some(item => item.id !== table.id && item.performerId === member.id) ? ' · 다른 테이블 연결됨' : ''}</option>)}
                                  </select>
                                  <button type="button" disabled={!(performerSelectionByTable[table.id] ?? table.performerId)} onClick={() => setTablePerformer(table.id, performerSelectionByTable[table.id] ?? table.performerId)} style={{ ...smallBtnStyle, opacity: (performerSelectionByTable[table.id] ?? table.performerId) ? 1 : 0.5 }}>연결</button>
                                  {table.performerId && <button type="button" onClick={() => setTablePerformer(table.id, '')} style={{ ...smallBtnStyle, color: '#b91c1c' }}>연결 해제</button>}
                                </div>
                                <span style={{ fontSize: 10, color: '#64748b' }}>공연자 연결은 ID로 저장됩니다. 예매자 좌석은 ‘공연자 기준 자동 배치’에서 배정·갱신됩니다.</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, color: '#64748b', width: 40, flexShrink: 0 }}>좌석 수</span>
                                <input type="number" min={0} value={seatCountDraft[table.id] ?? String(table.seats.length)}
                                  onChange={event => setSeatCountDraft(previous => ({ ...previous, [table.id]: event.target.value }))}
                                  onBlur={(e) => { setTableCapacity(table.id, e.target.value); setSeatCountDraft(previous => { const next = { ...previous }; delete next[table.id]; return next; }); }}
                                  style={{ width: 70, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700 }}
                                />
                                <button type="button" onClick={() => addChair(table.id)} style={smallBtnStyle}>+ 좌석</button>
                              </div>
                              <div style={{ display: 'grid', gap: 6 }}>
                                {table.seats.map((seat, seatIndex) => {
                                  const assigned = panelSeatAssignments[seat.id];
                                  const performer = members.find(member => member.id === performerSeatAssignments[seat.id]);
                                  const attendee = assigned && afterPartyParticipants.find(person => person.orderId === assigned.orderId);
                                  const occupant = performer ? `${performer.name} · 공연자` : attendee ? `${attendee.name}${attendee.count > 1 ? ` · ${assigned.attendeeIndex + 1}번` : ''}` : '빈 좌석';
                                  return <div key={seat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    <span style={{ width: 50, flexShrink: 0, fontSize: 11, color: '#64748b' }}>좌석 {seatIndex + 1}</span>
                                    <span title={occupant} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: performer ? '#047857' : attendee ? '#1e293b' : '#94a3b8' }}>{occupant}</span>
                                    <button type="button" onClick={() => removeChair(table.id, seat.id)} style={{ ...smallBtnStyle, color: '#dc2626', padding: '4px 7px' }}>좌석 삭제</button>
                                  </div>;
                                })}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, color: '#64748b', width: 40, flexShrink: 0 }}>모양</span>
                                {['rect', 'circle'].map(s => (
                                  <button key={s} type="button" onClick={() => setTableShape(table.id, s)}
                                    style={{
                                      padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                      border: `1.5px solid ${table.shape === s ? '#111827' : '#e2e8f0'}`,
                                      background: table.shape === s ? '#111827' : '#fff', color: table.shape === s ? '#fff' : '#64748b'
                                    }}
                                  >{s === 'rect' ? '사각형' : '원형'}</button>
                                ))}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, color: '#64748b', width: 40, flexShrink: 0 }}>크기</span>
                                <button type="button" onClick={() => resizeTable(table.id, table.width - 20, table.height)} style={smallBtnStyle}>폭 -</button>
                                <button type="button" onClick={() => resizeTable(table.id, table.width + 20, table.height)} style={smallBtnStyle}>폭 +</button>
                                <button type="button" onClick={() => resizeTable(table.id, table.width, table.height - 20)} style={smallBtnStyle}>높이 -</button>
                                <button type="button" onClick={() => resizeTable(table.id, table.width, table.height + 20)} style={smallBtnStyle}>높이 +</button>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, color: '#64748b', width: 40, flexShrink: 0 }}>위치</span>
                                <button type="button" onClick={() => nudgeTable(table.id, 0, -TABLE_NUDGE_STEP)} style={smallBtnStyle}>↑</button>
                                <button type="button" onClick={() => nudgeTable(table.id, 0, TABLE_NUDGE_STEP)} style={smallBtnStyle}>↓</button>
                                <button type="button" onClick={() => nudgeTable(table.id, -TABLE_NUDGE_STEP, 0)} style={smallBtnStyle}>←</button>
                                <button type="button" onClick={() => nudgeTable(table.id, TABLE_NUDGE_STEP, 0)} style={smallBtnStyle}>→</button>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>드래그 대신 쓸 수 있는 버튼 이동</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, color: '#64748b', width: 40, flexShrink: 0 }}>방향</span>
                                <button type="button" onClick={() => rotateTable(table.id, 90)} style={smallBtnStyle}>90° 회전</button>
                              </div>
                              <button type="button" onClick={() => { removeTable(table.id); setSelectedTableId(null); }}
                                style={{ padding: '7px 0', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                              >이 테이블 삭제</button>
                            </div>
                          ) : (
                            <div style={{ fontSize: 13, color: '#475569' }}>{table.name} · 정원 {table.capacity}명</div>
                          )}

                          <div style={{ marginTop: 12, borderTop: '1px solid #e0e3ff', paddingTop: 10 }}>
                            <div style={{ fontSize: 12, color: '#047857', fontWeight: 800, marginBottom: 6 }}>공연자 ({entry?.performers.length || 0}명)</div>
                            {entry?.performers.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{entry.performers.map(performer => <span key={performer.id} title={performer.name} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '4px 8px', borderRadius: 12, border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#047857', fontSize: 12, fontWeight: 800 }}>{performer.name}</span>)}</div> : <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>공연자 좌석이 아직 배치되지 않았습니다.</div>}
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>배치된 참여자 ({placed.length}건)</div>
                            {placed.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#94a3b8' }}>배치된 참여자가 없습니다.</div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {placed.map(p => {
                                  const o = ordersById[p.orderId];
                                  const inviterInfo = o ? classifyAfterPartyOrder(o) : null;
                                  return (
                                  <span key={p.orderId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 700 }}>
                                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 110 }}>{p.name} ({p.count}명)</span>
                                    {inviterInfo && (inviterInfo.type === 'performer' || inviterInfo.type === 'group') && (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: AFTER_PARTY_TYPE_BADGE[inviterInfo.type].color, whiteSpace: 'nowrap' }}>
                                        → {inviterInfo.label}
                                      </span>
                                    )}
                                    {isAdmin && (
                                      <TableAssignPicker
                                        tables={seatingOverview.tables}
                                        currentTableId={table.id}
                                        pendingCount={p.count}
                                        triggerText="이동"
                                        onAssign={(tableId) => assignToTable([p.orderId], tableId)}
                                        onUnassign={() => assignToTable([p.orderId], null)}
                                      />
                                    )}
                                  </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 다중 선택 일괄 배치 툴바 (미배치 참여자를 체크하면 노출) */}
                    {isAdmin && selectedSeatingIds.length > 0 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                        padding: '10px 14px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe'
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{selectedSeatingIds.length}건 선택됨</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <TableAssignPicker
                            tables={seatingOverview.tables}
                            currentTableId={null}
                            pendingCount={seatingOverview.unassigned.filter(p => selectedSeatingIds.includes(p.orderId)).reduce((s, p) => s + p.count, 0)}
                            triggerText="선택 인원 일괄 배치"
                            onAssign={(tableId) => { assignToTable(selectedSeatingIds, tableId); setSelectedSeatingIds([]); }}
                            onUnassign={() => setSelectedSeatingIds([])}
                          />
                          <button type="button" onClick={() => setSelectedSeatingIds([])}
                            style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >선택 해제</button>
                        </div>
                      </div>
                    )}

                    {/* 미배치 참여자 — 컴팩트 이름표, 체크박스로 다중 선택 + 개별 "배치" 버튼 */}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 8 }}>
                        미배치 참여자 ({seatingOverview.unassigned.length}건 · {seatingOverview.totalUnassigned}명)
                      </div>
                      {seatingOverview.unassigned.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>모든 참여자가 배치되었습니다.</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {seatingOverview.unassigned.map(p => {
                            const o = ordersById[p.orderId];
                            const inviterInfo = o ? classifyAfterPartyOrder(o) : null;
                            return (
                            <div key={p.orderId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 20, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                              {isAdmin && (
                                <input
                                  type="checkbox"
                                  checked={selectedSeatingIds.includes(p.orderId)}
                                  onChange={() => toggleSeatingSelection(p.orderId)}
                                  style={{ width: 15, height: 15, cursor: 'pointer' }}
                                />
                              )}
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 120 }}>{p.name}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{p.count}명</span>
                              {inviterInfo && (inviterInfo.type === 'performer' || inviterInfo.type === 'group') && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: AFTER_PARTY_TYPE_BADGE[inviterInfo.type].color, whiteSpace: 'nowrap' }}>
                                  → {inviterInfo.label}
                                </span>
                              )}
                              {isAdmin && (
                                <button type="button" onClick={() => setSeatAssignmentSelection(JSON.stringify([p.orderId, 0]))} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>좌석 선택</button>
                              )}
                              {isAdmin && (
                                <TableAssignPicker
                                  tables={seatingOverview.tables}
                                  currentTableId={null}
                                  pendingCount={p.count}
                                  triggerText="배치"
                                  onAssign={(tableId) => assignToTable([p.orderId], tableId)}
                                  onUnassign={() => {}}
                                />
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontWeight: 500 }}>
          관리자만 상태 토글이 가능합니다. 모든 데이터는 브라우저 로컬 스토리지 및 데이터베이스에 안전하게 보관됩니다.
        </div>
      </div>
    </div>
  );
}
