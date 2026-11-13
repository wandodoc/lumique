import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import './PageStyles.css';

const DEPOSIT_WAIT = '입금대기';
const DEPOSIT_DONE = '입금완료';
const ATTEND_WAIT = '미입장';
const ATTEND_DONE = '입장완료';

import { firebaseStorage } from '../utils/firebaseStorage';
import { countSoldByTier, resolveActivePrice, cleanPriceTier, formatTierUntil, regularPriceOf } from '../utils/pricing';
import { sortByPartAndName } from '../utils/calculations';
import { filterOrdersForShow, resolveShowByAnyId } from '../utils/performances';
import ShowSettlementCard from '../components/ShowSettlementCard';

const genTierId = () => `tier-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 모든 데이터는 서버(Firestore)에만 저장한다. 이 페이지는 localStorage에 아무것도 쓰지 않는다.
const SERVER_LOAD_FAILED_MSG = '서버에서 데이터를 불러오지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요. (저장은 잠겨 있습니다)';
const SERVER_SAVE_FAILED_MSG = '서버 저장에 실패해 변경이 반영되지 않았습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.';

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
  performer: { text: '공연자 초대', color: '#059669' },
  unmapped: { text: '확인 필요', color: '#b45309' },
  unassigned: { text: '초대자 없음', color: '#64748b' },
  group: { text: '직접 만든 그룹', color: '#7c3aed' },
};

// ── 뒤풀이 테이블 배치도: 고정 가상 좌표계(px 단위) — 화면 크기가 달라져도 테이블의
// 상대 위치가 항상 동일하게 유지된다. 모바일에서는 이 캔버스만 가로 스크롤을 허용한다. ──
const TABLE_CANVAS_WIDTH = 1000;
const TABLE_CANVAS_HEIGHT = 640;
const TABLE_CANVAS_VERSION = 3;
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
    baseWidth: Number(table.baseWidth) > 0 ? Number(table.baseWidth) : (Number(table.width) > 0 ? Number(table.width) : size.width),
    baseHeight: Number(table.baseHeight) > 0 ? Number(table.baseHeight) : (Number(table.height) > 0 ? Number(table.height) : size.height),
    x: Number.isFinite(table.x) ? table.x : 30 + col * 180,
    y: Number.isFinite(table.y) ? table.y : 30 + row * 130,
    rotation: Number.isFinite(table.rotation) ? table.rotation : 0,
  };
};

// 두 테이블(사각 바운딩 박스 기준)이 겹치는지 — 회전은 단순화를 위해 반영하지 않는다.
const getTableBounds = (table) => {
  const radians = ((Number(table.rotation) || 0) % 360) * Math.PI / 180;
  const width = Math.abs(table.width * Math.cos(radians)) + Math.abs(table.height * Math.sin(radians));
  const height = Math.abs(table.width * Math.sin(radians)) + Math.abs(table.height * Math.cos(radians));
  return { x: table.x + (table.width - width) / 2, y: table.y + (table.height - height) / 2, width, height };
};
const tablesOverlap = (a, b) => {
  const boundsA = getTableBounds(a);
  const boundsB = getTableBounds(b);
  return boundsA.x < boundsB.x + boundsB.width && boundsA.x + boundsA.width > boundsB.x
    && boundsA.y < boundsB.y + boundsB.height && boundsA.y + boundsA.height > boundsB.y;
};

// 좌석 하나의 지름 + 좌석 사이 최소 여백 = 한 변에 좌석을 몇 개까지 "여유 있게" 넣을 수
// 있는지 계산하는 기준 길이. 테이블 가장자리에서 좌석 중심까지의 거리도 여기서 고정한다.
const SEAT_DOT_SIZE = 18;
const SEAT_MIN_GAP = 10;
const SEAT_EDGE_OFFSET = 20;
const createSeatId = () => `seat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 변 길이 len에 (코너 쪽 여유를 감안해) 넣을 수 있는 최대 좌석 수.
const seatCapacityForSide = (len) => Math.max(1, Math.floor((len * 0.85) / (SEAT_DOT_SIZE + SEAT_MIN_GAP)));

// 정원 n명이 겹치지 않고 앉을 수 있도록 테이블 크기를 계산한다 (현재 크기보다 줄이지는 않는다).
// 정원을 6 → 10명처럼 늘렸을 때 테이블이 그대로면 좌석이 뭉개지는 문제를 막는다.
const sizeForCapacity = (table, n) => {
  const unit = SEAT_DOT_SIZE + SEAT_MIN_GAP;
  if (table.shape === 'circle') {
    const needDiameter = Math.ceil((unit * n) / Math.PI) - SEAT_EDGE_OFFSET * 2;
    const d = Math.max(TABLE_DEFAULT_SIZE.circle.width, needDiameter);
    return { width: Math.max(table.width, d), height: Math.max(table.height, d) };
  }
  const perSide = Math.ceil(n / 2);
  const needLen = Math.ceil((unit * perSide) / 0.85) + 2;
  if (table.width >= table.height) return { width: Math.max(table.width, needLen), height: table.height };
  return { width: table.width, height: Math.max(table.height, needLen) };
};

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
const CONCERT_SAVE_BLOCKED_MSG = '서버에서 공연 목록을 불러오지 못해 저장할 수 없습니다. (빈 목록으로 덮어쓰기를 차단했습니다) 새로고침 후 다시 시도해 주세요.';

// 컬럼 순서/숨김 설정은 기기와 무관하게 유지되도록 서버 설정 문서(settings.reservationColumns)에 저장한다.
async function loadColConfig() {
  const settings = await firebaseStorage.loadSettings();
  const cfg = settings?.[LS_COL_CONFIG];
  return cfg && typeof cfg === 'object' ? cfg : null;
}
function saveColConfig(cfg) {
  firebaseStorage.saveSettings({ [LS_COL_CONFIG]: cfg });
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
              >{m.name}{m.part ? ` (${m.part})` : m.type === 'external' ? ' (외부)' : ''}</button>
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
  const [searchParams] = useSearchParams();
  const routeShowTitle = searchParams.get('title');

  const [orders, setOrders] = useState([]);
  const [shows, setShows] = useState([]);
  const [members, setMembers] = useState([]);
  // 공연별 참가자 목록 (공연 관리에서 지정). 뒤풀이에 공연자 직접 추가 시 참고용.
  const [performanceParticipants, setPerformanceParticipants] = useState({});
  const [bandMembers, setBandMembers] = useState({});
  const [duesSavingId, setDuesSavingId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [reservationPage, setReservationPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dataLoadFailed, setDataLoadFailed] = useState(false);

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


  // 뒤풀이 관리 섹션 — 검색/필터/탭/정리함/토스트 상태
  const [mgmtQuery, setMgmtQuery] = useState('');
  const [mgmtFilter, setMgmtFilter] = useState('all');
  const [afterPartyPage, setAfterPartyPage] = useState(0);
  const [mappingErrorMsg, setMappingErrorMsg] = useState('');
  const [afterPartyTab, setAfterPartyTab] = useState('participants'); // 'participants' | 'groups' | 'tables'
  const [expandedAttendeeKey, setExpandedAttendeeKey] = useState(null);
  const [afterPartyToast, setAfterPartyToast] = useState(null);
  const afterPartyToastTimer = useRef(null);
  const [isPerformerPanelOpen, setIsPerformerPanelOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [inboxIndex, setInboxIndex] = useState(0);
  const [applyToAllMatching, setApplyToAllMatching] = useState(true);
  const [inboxSelectValue, setInboxSelectValue] = useState('');
  const [addAttendeeSelectValue, setAddAttendeeSelectValue] = useState('');
  const [addPerformerSelectValue, setAddPerformerSelectValue] = useState('');
  const [selectedSeatingIds, setSelectedSeatingIds] = useState([]); // 테이블 배치: 미배치 참여자 다중 선택
  const [selectedTableId, setSelectedTableId] = useState(null); // 배치도: 편집 중인 테이블(위치/정원/모양 등)
  const [seatingView, setSeatingView] = useState('sheet'); // 좌석 배치 보기: 'sheet'(표) | 'map'(배치도)
  const [sheetAddTableId, setSheetAddTableId] = useState(null); // 표 보기: "+ 추가" 목록이 열린 테이블
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

  const currentShow = useMemo(
    () => (concertId ? resolveShowByAnyId(shows, concertId) : null),
    [shows, concertId]
  );

  useEffect(() => {
    document.title = '티켓 신청 및 입장 관리';
    loadColConfig().then(saved => {
      if (!saved) return;
      if (Array.isArray(saved.order) && saved.order.length > 0) {
        // 이후 추가된 컬럼(예: 가격 구간)은 기존에 저장된 순서에 없으므로 뒤에 보충한다.
        const missing = DEFAULT_COLUMN_ORDER.filter(id => !saved.order.includes(id));
        setColOrder([...saved.order, ...missing]);
      }
      if (Array.isArray(saved.hidden)) setHiddenCols(saved.hidden);
    });
    async function loadData() {
      let fbConcerts = await firebaseStorage.loadConcerts();
      let fbOrders = await firebaseStorage.loadOrders();
      // null = 읽기 실패. "비어 있음"과 구분해 빈 화면 + 오류 배너로 알리고, 어떤 로컬 사본도 쓰지 않는다.
      const failed = fbConcerts === null || fbOrders === null;
      if (failed) setMappingErrorMsg(SERVER_LOAD_FAILED_MSG);
      setDataLoadFailed(failed);
      if (fbConcerts === null) fbConcerts = [];
      if (fbOrders === null) fbOrders = [];
      setShows(fbConcerts);
      setOrders(fbOrders);
      const fbData = await firebaseStorage.loadData();
      if (fbData === undefined) {
        setDataLoadFailed(true);
        setMappingErrorMsg(SERVER_LOAD_FAILED_MSG);
      }
      setMembers(fbData?.members || []);
      setPerformanceParticipants(fbData?.performanceParticipants && typeof fbData.performanceParticipants === 'object' && !Array.isArray(fbData.performanceParticipants) ? fbData.performanceParticipants : {});
      setBandMembers(fbData?.bandMembers && typeof fbData.bandMembers === 'object' && !Array.isArray(fbData.bandMembers) ? fbData.bandMembers : {});
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
      if (concertId && !filterOrdersForShow([order], concertId).length) return false;
      
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
        if (checkinMode) {
          const byName = String(a.order.audienceName || '').localeCompare(
            String(b.order.audienceName || ''),
            'ko'
          );
          return byName || a.originalIndex - b.originalIndex;
        }
        const aHasDate = Number.isFinite(a.createdAt);
        const bHasDate = Number.isFinite(b.createdAt);
        if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
        if (aHasDate && a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
        return a.originalIndex - b.originalIndex;
      })
      .map(({ order }) => order);
  }, [orders, query, filter, concertId, checkinMode]);

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

  // 공연 1건에 부분 변경을 서버 최신 목록에 병합한다. 성공 시 서버가 돌려준 목록으로 화면을 맞춘다.
  const patchCurrentShow = async (patch) => {
    if (dataLoadFailed || !currentShow || !concertId) return false;
    const list = await firebaseStorage.patchShow(currentShow.id, patch);
    if (list === 'missing') { alert(CONCERT_SAVE_BLOCKED_MSG); return false; }
    if (!Array.isArray(list)) { alert(SERVER_SAVE_FAILED_MSG); return false; }
    setShows(list);
    return true;
  };

  // 활동 회원 목록 (파트 > 이름 순)
  const activeMembersSorted = useMemo(() => sortByPartAndName(members.filter(m => m.status === 'active')), [members]);

  // 현재 공연의 등록된 참가자 ID 목록 (공연 관리에서 지정)
  const currentShowParticipantIds = useMemo(() => {
    if (!currentShow?.id) return [];
    return Array.isArray(performanceParticipants[currentShow.id]) ? performanceParticipants[currentShow.id] : [];
  }, [currentShow, performanceParticipants]);

  // 공연 참가자 뒤풀이 직접 추가 목록: currentShow.afterPartyPerformerIds 에 저장된 memberId 배열
  const afterPartyPerformerIds = useMemo(() => (
    Array.isArray(currentShow?.afterPartyPerformerIds) ? currentShow.afterPartyPerformerIds : []
  ), [currentShow]);

  // 직접 참석 공연자가 소속된 "직접 만든 그룹" (memberId → 그룹명). 집계·좌석과 무관한 표시용 정보.
  const performerGroupMapping = useMemo(() => (
    currentShow?.performerGroupMapping && typeof currentShow.performerGroupMapping === 'object' ? currentShow.performerGroupMapping : {}
  ), [currentShow]);

  // 그룹으로 지정할 수 있는 공연자 전체: 활동 회원 + 이 공연의 참가자/직접 참석 공연자.
  // 외부 세션 등은 회원 목록(members)에 없고 bandMembers에만 있어, 회원만 보면 그룹 카드는
  // 생기는데 드롭다운에서 고를 수 없고 수동 지정도 인식되지 않았다.
  const findPerformer = useCallback((id) => {
    if (!id) return null;
    const member = members.find(m => m.id === id);
    if (member) return member;
    const band = bandMembers[id];
    return band ? { part: '', ...band, id } : null;
  }, [members, bandMembers]);
  const performerOptions = useMemo(() => {
    const seen = new Set(activeMembersSorted.map(m => m.id));
    const extras = [];
    [...currentShowParticipantIds, ...afterPartyPerformerIds].forEach(id => {
      if (seen.has(id)) return;
      const performer = findPerformer(id);
      if (!performer) return;
      seen.add(id);
      extras.push(performer);
    });
    extras.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return [...activeMembersSorted, ...extras];
  }, [activeMembersSorted, currentShowParticipantIds, afterPartyPerformerIds, findPerformer]);
  const performerSuffix = (m) => (m?.part ? ` (${m.part})` : m?.type === 'external' ? ' (외부)' : '');

  // 공연자 본인이 예매 뒤풀이 인원에도 포함된 경우를 명시적으로 연결한다. 초대자 매핑은
  // 예매자 본인을 뜻하지 않으므로, 이름/초대자 정보로 자동 차감하지 않는다.
  const afterPartyPerformerOrderIds = useMemo(() => (
    currentShow?.afterPartyPerformerOrderIds && typeof currentShow.afterPartyPerformerOrderIds === 'object'
      ? currentShow.afterPartyPerformerOrderIds : {}
  ), [currentShow]);
  const performerDuplicateCountByOrder = useMemo(() => {
    const counts = {};
    const currentOrderIds = new Set((concertId ? filterOrdersForShow(orders, concertId) : orders)
      .filter(order => order.isAfterParty)
      .map(order => order.id));
    afterPartyPerformerIds.forEach(memberId => {
      const orderId = afterPartyPerformerOrderIds[memberId];
      if (orderId && currentOrderIds.has(orderId)) counts[orderId] = (counts[orderId] || 0) + 1;
    });
    return counts;
  }, [afterPartyPerformerIds, afterPartyPerformerOrderIds, orders, concertId]);
  const effectiveAfterPartyCount = useCallback((order) => Math.max(
    0,
    (Number(order?.afterPartyCount) || 1) - (performerDuplicateCountByOrder[order?.id] || 0)
  ), [performerDuplicateCountByOrder]);

  const addPerformerToAfterParty = async (memberId) => {
    if (!isAdmin || !currentShow) return;
    if (afterPartyPerformerIds.includes(memberId)) return;
    await patchCurrentShow({ afterPartyPerformerIds: [...afterPartyPerformerIds, memberId] });
  };
  const removePerformerFromAfterParty = async (memberId) => {
    if (!isAdmin || !currentShow) return;
    const nextDuplicateOrders = { ...afterPartyPerformerOrderIds };
    delete nextDuplicateOrders[memberId];
    await patchCurrentShow({ afterPartyPerformerIds: afterPartyPerformerIds.filter(id => id !== memberId), afterPartyPerformerOrderIds: nextDuplicateOrders });
  };
  const setPerformerDuplicateOrder = async (memberId, orderId) => {
    if (!isAdmin || !currentShow) return;
    const next = { ...afterPartyPerformerOrderIds };
    if (orderId) next[memberId] = orderId;
    else delete next[memberId];
    const currentOrders = concertId ? filterOrdersForShow(orders, concertId) : orders;
    const afterPartyOrdersById = new Map(currentOrders.filter(order => order.isAfterParty).map(order => [order.id, order]));
    const duplicateCounts = {};
    afterPartyPerformerIds.forEach(id => {
      const linkedOrderId = next[id];
      if (linkedOrderId && afterPartyOrdersById.has(linkedOrderId)) {
        duplicateCounts[linkedOrderId] = (duplicateCounts[linkedOrderId] || 0) + 1;
      }
    });
    const effectiveCountForId = (id) => {
      const order = afterPartyOrdersById.get(id);
      return order ? Math.max(0, (Number(order.afterPartyCount) || 1) - (duplicateCounts[id] || 0)) : 0;
    };
    // 중복 연결로 줄어든 인원의 기존 좌석도 함께 비워 유령 점유를 남기지 않는다.
    const nextParticipantSeats = { ...participantSeatAssignments };
    Object.entries(nextParticipantSeats).forEach(([seatId, assignment]) => {
      if (!assignment?.orderId || Number(assignment.attendeeIndex) >= effectiveCountForId(assignment.orderId)) delete nextParticipantSeats[seatId];
    });
    const nextSeatAssignments = { ...seatAssignments };
    Object.keys(nextSeatAssignments).forEach(id => {
      if (effectiveCountForId(id) === 0) delete nextSeatAssignments[id];
    });
    await patchCurrentShow({ afterPartyPerformerOrderIds: next, participantSeatAssignments: nextParticipantSeats, seatAssignments: nextSeatAssignments });
  };

  const savePriceTiers = async (patch) => {
    await patchCurrentShow(patch);
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
    const allConcertOrders = concertId ? filterOrdersForShow(orders, concertId) : orders;
    const ticketPrice = currentShow?.price ?? 5000;
    const paidRevenue = allConcertOrders.reduce((sum, o) => sum + (o.depositStatus === DEPOSIT_DONE ? totalPriceFor(o) : 0), 0);
    // 회비에서 충당된 것으로 표시된 예매 건의 합계. 총 모금액(실 티켓 수익)과는 별도로,
    // 공연 정산 시 "회비 쪽에서 메꾼 금액"을 따로 확인할 수 있도록 집계한다.
    const duesCoveredSum = allConcertOrders.reduce((sum, o) => sum + (o.duesMemberId ? (Number(o.duesCoveredAmount) || 0) : 0), 0);
    const duesCoveredCount = allConcertOrders.filter(o => o.duesMemberId).length;
    // 입금 완료 금액 중 회비로 충당된 부분을 뺀, 관객이 실제로 입금한 티켓값 (공연 정산표의 "티켓 판매").
    const duesCoveredPaidSum = allConcertOrders.reduce((sum, o) => sum + (o.duesMemberId && o.depositStatus === DEPOSIT_DONE ? Math.min(Number(o.duesCoveredAmount) || 0, totalPriceFor(o)) : 0), 0);
    return {
      tickets: visibleOrders.reduce((sum, o) => sum + (Number(o.ticketCount) || 0), 0),
      enteredTotal: visibleOrders.reduce((sum, o) => sum + (Number(o.enteredCount) || 0), 0),
      paidTickets: visibleOrders.reduce((sum, o) => sum + (o.depositStatus === DEPOSIT_DONE ? (Number(o.ticketCount) || 0) : 0), 0),
      afterParties: visibleOrders.reduce((sum, o) => sum + (o.isAfterParty ? effectiveAfterPartyCount(o) : 0), 0) + afterPartyPerformerIds.length,
      totalFund: paidRevenue + extraDonationSum,
      extraDonation: extraDonationSum,
      duesCoveredSum,
      duesCoveredCount,
      ticketCash: paidRevenue - duesCoveredPaidSum,
      ticketPrice,
    };
  }, [visibleOrders, orders, concertId, currentShow, extraDonationSum, totalPriceFor, afterPartyPerformerIds, effectiveAfterPartyCount]);

  // 초대자 텍스트에 쓰인 이름이 활동 회원 이름과 정확히 일치하면 자동으로 그 회원을 매핑한다.
  // 두 명 이상 적었으면(쉼표 구분) 맨 처음 적은 이름을 기준으로 매칭한다.
  const autoMatchInviterMember = (inviterNameText) => {
    if (!inviterNameText || inviterNameText === '없음') return null;
    const firstName = inviterNameText.split(',')[0]?.trim();
    if (!firstName) return null;
    const matches = performerOptions.filter(m => m.name === firstName);
    return matches.length === 1 ? matches[0] : null;
  };

  // inviterMemberId의 세 가지 상태를 구분한다 (불필요한 별도 필드를 새로 만들지 않고 값 자체로 구분):
  // - 실제 회원 id(문자열)  → 관리자가 수동으로 지정한 공연자 매핑
  // - 빈 문자열 ''          → 관리자가 "매핑 해제"를 눌러 명시적으로 미매핑 상태를 확정함
  //                           (원본 텍스트가 회원 이름과 일치해도 자동 매칭을 다시 적용하지 않음)
  // - null/undefined       → 아직 아무 조작도 하지 않은 상태 → 자동 매칭을 적용
  // 기존 데이터에는 이 필드가 아예 없어(undefined) 항상 자동 매칭 경로를 타므로 이전 동작과 호환된다.
  const resolveInviterMember = (o) => {
    if (o.inviterMemberId && o.inviterMemberId !== 'unassigned') return findPerformer(o.inviterMemberId);
    if (o.inviterMemberId === '' || o.inviterMemberId === 'unassigned') return null;
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
    // 관리자가 수동으로 미분류/미기재로 지정했거나 매핑 해제한 경우
    if (o.inviterMemberId === 'unassigned' || o.inviterMemberId === '') {
      return {
        type: 'unassigned',
        key: `order:${o.id}`,
        label: o.audienceName || '(이름없음)',
        member: null,
        originalInviterName: (o.inviterName && o.inviterName !== '없음') ? o.inviterName : '',
      };
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
    return { type: 'unassigned', key: `order:${o.id}`, label: o.audienceName || '(이름없음)', member: null, originalInviterName: '' };
  };

  // 뒤풀이 참여자를 공연자/미매핑 텍스트/관리용 텍스트 그룹은 그룹으로 묶고,
  // 초대자 미기재 건은 서로 다른 공연자일 수 있어 개별 항목으로 따로 둔다.
  const afterPartyEntries = useMemo(() => {
    const src = concertId ? filterOrdersForShow(orders, concertId) : orders;
    const groupMap = {};
    const individuals = [];
    for (const o of src) {
      if (!o.isAfterParty) continue;
      const c = classifyAfterPartyOrder(o);
      const count = effectiveAfterPartyCount(o);
      if (count <= 0) continue;
      const attendee = {
        orderId: o.id,
        name: o.audienceName || '(이름없음)',
        phone: o.phone || '',
        count,
        createdAt: o.createdAt || null,
        inviterName: (o.inviterName && o.inviterName !== '없음') ? o.inviterName : '',
        originalInviterName: c.originalInviterName || ((o.inviterName && o.inviterName !== '없음') ? o.inviterName : ''),
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
  }, [orders, concertId, members, effectiveAfterPartyCount, performerOptions, findPerformer]);

  // 상단 요약: 인원 수 기준. 확인 필요 = 이름 불일치 그룹 + 초대자 미기재 개별 건.
  const afterPartySummary = useMemo(() => {
    const performerDirect = afterPartyPerformerIds.length;
    const performerMapped = afterPartyEntries.groups.filter(g => g.type === 'performer').reduce((s, g) => s + g.count, 0);
    const textGroup = afterPartyEntries.groups.filter(g => g.type === 'group').reduce((s, g) => s + g.count, 0);
    const unmappedGroupCount = afterPartyEntries.groups.filter(g => g.type === 'unmapped').reduce((s, g) => s + g.count, 0);
    const unassignedCount = afterPartyEntries.individuals.reduce((s, i) => s + i.count, 0);
    const unmapped = unmappedGroupCount + unassignedCount;
    const total = performerDirect + performerMapped + textGroup + unmapped;
    return { total, unmapped, needsReview: unmappedGroupCount, noInviter: unassignedCount };
  }, [afterPartyEntries, afterPartyPerformerIds]);

  // 관리자가 과거에 만들어 둔 텍스트 그룹명 목록 (재사용을 위해 전체 공연 기준으로 수집)
  const existingGroupLabels = useMemo(() => {
    const set = new Set();
    orders.forEach(o => { if (o.inviterGroupLabel) set.add(o.inviterGroupLabel); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  // 뒤풀이 매핑/배치 관련 쓰기 작업의 단일 통로. orderIds에 patch를 병합해 저장하고,
  // 실패 시 배너로 보여줄 오류 메시지를 지정한다.
  const applyAfterPartyPatch = async (orderIds, patch, failMsg) => {
    if (!isAdmin || dataLoadFailed || !orderIds || orderIds.length === 0) return 'error';
    setMappingErrorMsg('');
    const idSet = new Set(orderIds);
    try {
      // 화면의 목록이 아니라 서버 최신 목록에 패치한다 (페이지를 열어 둔 사이 들어온 새 예매를 지우지 않도록).
      const saved = await firebaseStorage.patchOrders(list => list.map(o => (idSet.has(o.id) ? { ...o, ...patch } : o)));
      if (Array.isArray(saved)) {
        setOrders(saved);
        return 'firebase';
      }
      setMappingErrorMsg(SERVER_SAVE_FAILED_MSG);
      return 'error';
    } catch {
      setMappingErrorMsg(failMsg);
      return 'error';
    }
  };

  // orderIds를 실제 공연자(회원)에게 한 번에 매핑한다(=1순위 지정). 기존에 지정돼 있던
  // 관리용 텍스트 그룹은 해제된다. 2순위 이하 참고용 목록(inviterExtraMemberIds)은 그대로 둔다.
  const assignPerformer = (orderIds, memberId) =>
    applyAfterPartyPatch(orderIds, { inviterMemberId: memberId || null, inviterGroupLabel: null }, '공연자 초대 연결 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');

  // orderIds를 관리자가 지정한 텍스트 그룹으로 분류한다. 공연자 매핑과 참고용 복수 공연자
  // 목록은 모두 해제한다 — 텍스트 그룹은 공연자 실적과 별개의 분류이기 때문이다.
  const assignGroupLabel = (orderIds, groupLabel) =>
    applyAfterPartyPatch(orderIds, { inviterGroupLabel: groupLabel, inviterMemberId: null, inviterExtraMemberIds: [] }, '텍스트 그룹 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');

  // orderIds를 "명시적 매핑 해제" 상태로 확정한다. inviterMemberId를 빈 문자열('')로 저장해,
  // 원본 텍스트가 회원 이름과 일치하더라도 자동 매칭이 다시 적용되지 않도록 한다(미매핑 유지).
  // 2순위 이하 참고용 목록은 유지한다(1순위 확정 여부와 무관한 별개의 참고 정보).
  const clearInviterClassification = (orderIds) =>
    applyAfterPartyPatch(orderIds, { inviterMemberId: 'unassigned', inviterGroupLabel: null }, '초대자 없음 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');

  // 직접 참석 공연자의 소속 그룹(직접 만든 그룹)을 기록하거나 해제한다. 공연자는 직접 참석
  // 목록에 그대로 남아 인원·좌석 집계는 바뀌지 않고, 명단에서 어느 그룹에 보이는지만 달라진다.
  const setPerformerGroup = async (memberId, groupLabel) => {
    if (!isAdmin || !currentShow) return 'error';
    const next = { ...performerGroupMapping };
    if (groupLabel) next[memberId] = groupLabel; else delete next[memberId];
    const ids = afterPartyPerformerIds.includes(memberId) ? afterPartyPerformerIds : [...afterPartyPerformerIds, memberId];
    try {
      const ok = await patchCurrentShow({ performerGroupMapping: next, afterPartyPerformerIds: ids });
      return ok ? 'firebase' : 'error';
    } catch {
      setMappingErrorMsg('공연자 그룹 지정 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
      return 'error';
    }
  };

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

  // 테이블 배치: 미배치 참여자 다중 선택 토글
  const toggleSeatingSelection = (orderId) => {
    setSelectedSeatingIds(prev => (prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]));
  };

  // ── 뒤풀이 테이블 배치 — 공연자 매핑과는 완전히 독립된 데이터(콘서트 레코드에 저장) ──
  // tables: [{ id, name, capacity, shape, x, y, width, height, rotation }], seatAssignments: { [orderId]: tableId }
  const afterPartyTables = useMemo(
    () => (Array.isArray(currentShow?.tables) ? currentShow.tables : []).map((t, i) => {
      const table = withTableGeometry(t, i);
      if (Array.isArray(t.seats)) {
        const seats = t.canvasVersion === TABLE_CANVAS_VERSION
          ? t.seats
          : t.seats.map(seat => ({
            ...seat,
            x: seat.x * (t.canvasVersion === 2 ? 1600 : 1000) / TABLE_CANVAS_WIDTH,
            y: seat.y * (t.canvasVersion === 2 ? 1000 : 460) / TABLE_CANVAS_HEIGHT,
          }));
        return { ...table, canvasVersion: TABLE_CANVAS_VERSION, capacity: seats.length, seats };
      }
      const initial = computeSeatSlots(table, Math.max(0, Number(table.capacity) || 0));
      return { ...table, canvasVersion: TABLE_CANVAS_VERSION, seats: initial.map(point => ({ id: createSeatId(), x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)), y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)) })) };
    }),
    [currentShow]
  );
  const seatAssignments = useMemo(() => (currentShow?.seatAssignments && typeof currentShow.seatAssignments === 'object' ? currentShow.seatAssignments : {}), [currentShow]);
  const participantSeatAssignments = useMemo(() => (currentShow?.participantSeatAssignments && typeof currentShow.participantSeatAssignments === 'object' ? currentShow.participantSeatAssignments : {}), [currentShow]);
  const performerSeatAssignments = useMemo(() => (currentShow?.performerSeatAssignments && typeof currentShow.performerSeatAssignments === 'object' ? currentShow.performerSeatAssignments : {}), [currentShow]);
  const canonicalPerformerSeatByMember = useMemo(() => Object.entries(performerSeatAssignments).reduce((map, [seatId, memberId]) => {
    if (memberId && !map[memberId]) map[memberId] = seatId;
    return map;
  }, {}), [performerSeatAssignments]);
  const autoSeatAssignments = useMemo(() => (currentShow?.autoSeatAssignments && typeof currentShow.autoSeatAssignments === 'object' ? currentShow.autoSeatAssignments : {}), [currentShow]);
  const manualSeatAssignments = useMemo(() => (currentShow?.manualSeatAssignments && typeof currentShow.manualSeatAssignments === 'object' ? currentShow.manualSeatAssignments : {}), [currentShow]);

  // 공연자 매핑 상태와 무관하게, 뒤풀이 참여 체크한 모든 신청을 평평한 목록으로 — 테이블 배치는 이 목록만 본다.
  const afterPartyParticipants = useMemo(() => {
    const src = concertId ? filterOrdersForShow(orders, concertId) : orders;
    return src
      .filter(o => o.isAfterParty)
      .map(o => ({
        orderId: o.id,
        name: o.audienceName || '(이름없음)',
        phone: o.phone || '',
        count: effectiveAfterPartyCount(o),
        createdAt: o.createdAt || null,
      }))
      .filter(person => person.count > 0)
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
  }, [orders, concertId, effectiveAfterPartyCount]);

  // 테이블별 배치 인원/잔여석과 미배치 인원을 계산한다. 삭제된 테이블을 가리키는 배치 기록은
  // 자동으로 미배치로 취급한다(참조가 깨져도 오류 없이 동작).
  const seatingOverview = useMemo(() => {
    const byTable = {};
    afterPartyTables.forEach(t => { byTable[t.id] = { table: t, participants: [], performers: [], count: 0, attendeeCount: 0 }; });
    const seatTableById = new Map(afterPartyTables.flatMap(table => table.seats.map(seat => [seat.id, table.id])));
    const attendeeTableByKey = new Map();
    const explicitlyAssignedAttendees = new Set();
    Object.entries(participantSeatAssignments).forEach(([seatId, assignment]) => {
      if (assignment?.orderId && Number.isInteger(Number(assignment.attendeeIndex))) {
        explicitlyAssignedAttendees.add(`${assignment.orderId}:${Number(assignment.attendeeIndex)}`);
      }
      if (performerSeatAssignments[seatId]) return;
      const tableId = seatTableById.get(seatId);
      if (tableId && assignment?.orderId && Number.isInteger(Number(assignment.attendeeIndex))) {
        attendeeTableByKey.set(`${assignment.orderId}:${Number(assignment.attendeeIndex)}`, tableId);
      }
    });
    const seatedPerformerIds = new Set();
    Object.entries(performerSeatAssignments).forEach(([seatId, memberId]) => {
      const tableId = seatTableById.get(seatId);
      const member = findPerformer(memberId); // 외부 공연자(bandMembers)도 테이블 인원으로 보이게 한다
      if (tableId && member && canonicalPerformerSeatByMember[memberId] === seatId && !seatedPerformerIds.has(memberId)) {
        seatedPerformerIds.add(memberId);
        byTable[tableId].performers.push(member);
        byTable[tableId].count += 1;
      }
    });
    const unassigned = [];
    for (const p of afterPartyParticipants) {
      const countsByTable = new Map();
      let unassignedCount = 0;
      for (let attendeeIndex = 0; attendeeIndex < p.count; attendeeIndex += 1) {
        const attendeeKey = `${p.orderId}:${attendeeIndex}`;
        const tableId = attendeeTableByKey.get(attendeeKey) || (explicitlyAssignedAttendees.has(attendeeKey) ? null : seatAssignments[p.orderId]);
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
  }, [afterPartyTables, seatAssignments, participantSeatAssignments, performerSeatAssignments, canonicalPerformerSeatByMember, afterPartyParticipants, members, findPerformer]);

  // 콘서트 레코드에 테이블/배치 패치를 저장한다. 서버 최신 목록을 읽어 해당 공연 1건에만 병합하므로
  // 오래 열어 둔 탭의 옛 목록이 다른 기기의 저장을 덮어쓰지 않는다. 실패 시 화면에도 반영하지 않고 오류를 알린다.
  const saveSeatingPatchNow = useCallback(async (patch) => {
    if (!isAdmin || dataLoadFailed || !currentShow || !concertId) return false;
    setMappingErrorMsg('');
    try {
      const list = await firebaseStorage.patchShow(currentShow.id, patch);
      if (list === 'missing') {
        setMappingErrorMsg('서버에 이 공연이 없어 저장할 수 없습니다. 공연 목록을 새로고침한 뒤 다시 시도해 주세요.');
        return false;
      }
      if (!Array.isArray(list)) {
        setMappingErrorMsg('테이블 배치 저장에 실패해 변경이 반영되지 않았습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
        return false;
      }
      setShows(list);
      return 'firebase';
    } catch {
      setMappingErrorMsg('테이블 배치 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
      return false;
    }
  }, [isAdmin, dataLoadFailed, currentShow, concertId, setShows]);

  const seatingSaveQueueRef = useRef(Promise.resolve());
  const saveSeatingPatch = useCallback((patch) => {
    const task = seatingSaveQueueRef.current.then(() => saveSeatingPatchNow(patch));
    seatingSaveQueueRef.current = task.catch(() => false);
    return task;
  }, [saveSeatingPatchNow]);

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
    let selection;
    try { selection = JSON.parse(seatAssignmentSelection); } catch { return; }
    const isPerformer = selection?.type === 'performer';
    if (isPerformer) {
      const memberId = selection.memberId;
      const performer = members.find(member => member.id === memberId);
      if (!performer) return;
      const nextParticipants = materializeLegacySeatAssignments();
      const nextPerformers = { ...performerSeatAssignments };
      if (nextParticipants[seatId]) {
        window.alert('이미 참여자가 배정된 좌석입니다. 빈 좌석을 선택해 주세요.');
        return;
      }
      const currentPerformer = nextPerformers[seatId];
      if (currentPerformer && currentPerformer !== memberId) {
        window.alert('이미 다른 공연자가 배정된 좌석입니다. 빈 좌석을 선택해 주세요.');
        return;
      }
      Object.keys(nextPerformers).forEach(id => { if (nextPerformers[id] === memberId) delete nextPerformers[id]; });
      nextPerformers[seatId] = memberId;
      saveSeatingPatch({ performerSeatAssignments: nextPerformers });
      setSeatAssignmentSelection('');
      return;
    }
    const orderId = selection?.type === 'attendee' ? selection.orderId : selection?.[0];
    const attendeeIndex = selection?.type === 'attendee' ? selection.attendeeIndex : selection?.[1];
    if (!orderId || !Number.isInteger(Number(attendeeIndex))) return;
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
    let selection;
    try { selection = JSON.parse(seatAssignmentSelection); } catch { return; }
    if (selection?.type === 'performer') {
      const next = { ...performerSeatAssignments };
      const hasAssignment = Object.values(next).includes(selection.memberId);
      if (!hasAssignment) {
        window.alert('선택한 공연자는 현재 좌석에 배정되어 있지 않습니다.');
        return;
      }
      Object.keys(next).forEach(seatId => { if (next[seatId] === selection.memberId) delete next[seatId]; });
      saveSeatingPatch({ performerSeatAssignments: next });
      setSeatAssignmentSelection('');
      return;
    }
    const orderId = selection?.type === 'attendee' ? selection.orderId : selection?.[0];
    const attendeeIndex = selection?.type === 'attendee' ? selection.attendeeIndex : selection?.[1];
    if (!orderId || !Number.isInteger(Number(attendeeIndex))) return;
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
    const base = withTableGeometry({ id: `table-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, capacity: 6 }, afterPartyTables.length);
    const candidatePositions = [
      { x: 30, y: 380 }, { x: 570, y: 380 }, { x: 30, y: 30 }, { x: 570, y: 30 },
      { x: 30, y: 190 }, { x: 570, y: 190 }, { x: 300, y: 30 }, { x: 300, y: 380 }, { x: 300, y: 190 },
    ];
    const hasRoom = position => afterPartyTables.every(table =>
      position.x + base.width + 45 <= table.x || table.x + table.width + 45 <= position.x
      || position.y + base.height + 45 <= table.y || table.y + table.height + 45 <= position.y
    );
    const placement = candidatePositions.find(hasRoom) || { x: base.x, y: base.y };
    const positioned = { ...base, ...placement };
    const table = { ...positioned, ...clampTablePosition(positioned.x, positioned.y, positioned.width, positioned.height) };
    const newTable = { ...table, canvasVersion: TABLE_CANVAS_VERSION, seats: computeSeatSlots(table, 6).map(point => ({ id: createSeatId(), x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)), y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)) })) };
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
    if (n === table.seats.length) {
      // 정원이 같아도 테이블이 너무 작아 좌석이 겹쳐 있으면(예전 버그로 깨진 배치) 크기를 키워 다시 배치한다.
      const grown = sizeForCapacity(table, n);
      if (grown.width <= table.width && grown.height <= table.height) return;
    }
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
    }
    let nextGeometry = null;
    if (n >= table.seats.length) {
      // 정원이 늘면 테이블 크기를 함께 키우고 좌석 전체를 새 크기에 맞춰 다시 배치한다.
      // 기존 좌석 id는 순서대로 유지해 이미 배정된 사람이 풀리지 않게 한다.
      const grown = sizeForCapacity(table, n);
      nextGeometry = { width: grown.width, height: grown.height, baseWidth: grown.width, baseHeight: grown.height, ...clampTablePosition(table.x, table.y, grown.width, grown.height) };
      const slots = computeSeatSlots({ ...table, ...nextGeometry }, n);
      seats = slots.map((point, idx) => ({
        id: seats[idx]?.id || createSeatId(),
        x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)),
        y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)),
      }));
    }
    const tables = afterPartyTables.map(item => item.id === tableId ? { ...item, ...(nextGeometry || {}), seats, capacity: seats.length } : item);
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

  // ── 표 보기 전용: 테이블 단위로 사람을 넣고 뺀다 (좌석 번호는 자동 선택) ──
  const assignPerformerToTable = (memberId, tableId) => {
    const table = afterPartyTables.find(t => t.id === tableId);
    if (!table) return;
    const nextParticipants = materializeLegacySeatAssignments();
    const nextPerformers = { ...performerSeatAssignments };
    Object.keys(nextPerformers).forEach(seatId => { if (nextPerformers[seatId] === memberId) delete nextPerformers[seatId]; });
    const used = new Set([...Object.keys(nextParticipants), ...Object.keys(nextPerformers)]);
    const freeSeat = table.seats.find(seat => !used.has(seat.id));
    if (!freeSeat) { window.alert('빈 좌석이 없습니다. 정원을 늘리거나 다른 테이블을 선택해 주세요.'); return; }
    nextPerformers[freeSeat.id] = memberId;
    saveSeatingPatch({ participantSeatAssignments: nextParticipants, performerSeatAssignments: nextPerformers });
  };
  const unassignPerformerFromTables = (memberId) => {
    const next = { ...performerSeatAssignments };
    Object.keys(next).forEach(seatId => { if (next[seatId] === memberId) delete next[seatId]; });
    saveSeatingPatch({ performerSeatAssignments: next });
  };
  // 테이블 대표(추후 테이블별 정산용). 테이블 레코드의 repName 필드에 이름을 저장한다.
  const setTableRep = (tableId, repName) => {
    saveSeatingPatch({ tables: afterPartyTables.map(t => (t.id === tableId ? { ...t, repName } : t)) });
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
      setSeatingActionStatus('실행할 수 없습니다: 뒤풀이 참여 예매 중 공연자 초대로 연결된 예매가 없습니다. 참여 여부와 그룹 지정을 확인하세요.');
      return;
    }
    if (autoEligible.length === 0) {
      setSeatingActionStatus('자동 배치할 예매자가 없습니다. 매핑된 예매가 모두 수동 배정 상태라 기존 배치를 보존했습니다.');
      return;
    }
    if (!window.confirm('그룹이 정리된 참석자들을 각 공연자의 테이블로 자동 배치합니다.\n(수동으로 지정한 배치는 유지됩니다. 계속할까요?)')) {
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
      return { ...base, canvasVersion: TABLE_CANVAS_VERSION, seats: computeSeatSlots(base, capacity).map(point => ({ id: createSeatId(), x: Math.max(0.012, Math.min(0.988, point.x / TABLE_CANVAS_WIDTH)), y: Math.max(0.02, Math.min(0.98, point.y / TABLE_CANVAS_HEIGHT)) })) };
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
      setSeatingActionStatus(`배치 완료: 공연자 ${performerCount}명, 예매자 ${autoEligible.reduce((sum, person) => sum + person.count, 0)}명, 테이블 ${tables.length}개. 서버에 저장했습니다.`);
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

  // 테이블을 전부 삭제하고 좌석 배정도 모두 비운다. 배치를 처음부터 다시 그릴 때 사용.
  const removeAllTables = () => {
    if (afterPartyTables.length === 0) return;
    if (!window.confirm(`테이블 ${afterPartyTables.length}개를 모두 삭제하고 좌석 배정도 전부 비웁니다. 되돌릴 수 없습니다. 계속하시겠습니까?`)) return;
    setSelectedTableId(null);
    saveSeatingPatch({ tables: [], seatAssignments: {}, autoSeatAssignments: {}, manualSeatAssignments: {}, participantSeatAssignments: {}, performerSeatAssignments: {} });
  };

  // ── 테이블 배치도: 위치/크기/모양/방향 편집 — afterPartyTables는 이미 기본값이 채워져 있으므로
  // 그 상태 그대로 patch만 덮어써서 저장한다(처음 조작하는 순간 계산된 기본값이 그대로 확정된다). ──
  const updateTableGeometry = (tableId, patch) => {
    saveSeatingPatch({ tables: afterPartyTables.map(t => (t.id === tableId ? { ...t, ...patch } : t)) });
  };

  const setTablePerformer = (tableId, performerId) => {
    const table = afterPartyTables.find(item => item.id === tableId);
    if (!table) return;
    if (!performerId) {
      const tables = afterPartyTables.map(item => item.id === tableId ? { ...item, performerId: null, performerTableIndex: null } : item);
      saveSeatingPatch({ tables });
      setPerformerSelectionByTable(previous => ({ ...previous, [tableId]: '' }));
      return;
    }
    const performer = members.find(member => member.id === performerId);
    if (!performer) return;
    const performerTableIndex = afterPartyTables.filter(item => item.id !== tableId && item.performerId === performerId).length + 1;
    const tables = afterPartyTables.map(item => item.id === tableId ? {
      ...item,
      name: performer.name,
      performerId,
      performerTableIndex,
    } : item);
    saveSeatingPatch({ tables });
    setPerformerSelectionByTable(previous => ({ ...previous, [tableId]: performerId }));
  };

  const addChair = (tableId) => {
    const table = afterPartyTables.find(item => item.id === tableId);
    if (!table) return;
    const existing = table.seats || [];
    const center = { x: table.x + table.width / 2, y: table.y + table.height + SEAT_EDGE_OFFSET };
    const seats = [...existing, { id: createSeatId(), x: Math.min(tableCanvasSize.width, center.x) / TABLE_CANVAS_WIDTH, y: Math.min(tableCanvasSize.height, center.y) / TABLE_CANVAS_HEIGHT }];
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
    const table = afterPartyTables.find(item => item.id === tableId);
    const layout = tableDisplayLayouts.get(tableId) || table;
    if (!table || !layout) return;
    const tableX = table.x + table.width / 2 + (x - (layout.x + layout.width / 2)) * table.width / layout.width;
    const tableY = table.y + table.height / 2 + (y - (layout.y + layout.height / 2)) * table.height / layout.height;
    saveSeatingPatch({ tables: afterPartyTables.map(item => item.id === tableId ? {
      ...item, seats: item.seats.map(seat => seat.id === seatId ? {
        ...seat,
        x: Math.max(0, Math.min(tableCanvasSize.width / TABLE_CANVAS_WIDTH, tableX / TABLE_CANVAS_WIDTH)),
        y: Math.max(0, Math.min(tableCanvasSize.height / TABLE_CANVAS_HEIGHT, tableY / TABLE_CANVAS_HEIGHT)),
      } : seat)
    } : item) });
  };

  const clampTablePosition = (x, y, width, height) => ({
    x: Math.max(100, Math.min(x, Math.max(TABLE_CANVAS_WIDTH, tableCanvasSize.width) - width - 100)),
    y: Math.max(100, Math.min(y, Math.max(TABLE_CANVAS_HEIGHT, tableCanvasSize.height) - height - 100)),
  });

  const moveTableTo = (tableId, x, y) => {
    const t = afterPartyTables.find(tb => tb.id === tableId);
    if (!t) return;
    const layout = tableDisplayLayouts.get(tableId) || t;
    const position = { x: Math.max(30, x), y: Math.max(30, y) };
    const deltaX = position.x - layout.x;
    const deltaY = position.y - layout.y;
    saveSeatingPatch({
      tables: afterPartyTables.map(item => item.id === tableId ? {
        ...item,
        ...position,
        width: layout.width,
        height: layout.height,
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
    const layout = tableDisplayLayouts.get(tableId) || t;
    moveTableTo(tableId, layout.x + dx, layout.y + dy);
  };

  const resizeTable = (tableId, width, height) => {
    const t = afterPartyTables.find(tb => tb.id === tableId);
    if (!t) return;
    const w = Math.max(TABLE_MIN_SIZE.width, Math.min(width, TABLE_CANVAS_WIDTH));
    const h = Math.max(TABLE_MIN_SIZE.height, Math.min(height, TABLE_CANVAS_HEIGHT));
    updateTableGeometry(tableId, { width: w, height: h, baseWidth: w, baseHeight: h, ...clampTablePosition(t.x, t.y, w, h) });
  };

  const rotateTable = (tableId, deltaDeg) => {
    const t = afterPartyTables.find(tb => tb.id === tableId);
    if (!t) return;
    updateTableGeometry(tableId, { rotation: ((t.rotation + deltaDeg) % 360 + 360) % 360 });
  };

  const setTableShape = (tableId, shape) => {
    updateTableGeometry(tableId, { shape });
  };


  // ── 참석자별 보기: 예매 건과 직접 참석 공연자를 한 행씩 평평하게 나열한다 ──
  const groupOptionLabels = useMemo(() => {
    const set = new Set(existingGroupLabels);
    Object.values(performerGroupMapping).forEach(label => { if (label) set.add(label); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [existingGroupLabels, performerGroupMapping]);

  const afterPartyAttendeeRows = useMemo(() => {
    const src = concertId ? filterOrdersForShow(orders, concertId) : orders;
    const rows = [];
    for (const o of src) {
      if (!o.isAfterParty) continue;
      const count = effectiveAfterPartyCount(o);
      if (count <= 0) continue;
      const c = classifyAfterPartyOrder(o);
      const rawInviter = (o.inviterName && o.inviterName !== '없음') ? o.inviterName : '';
      rows.push({
        key: `order:${o.id}`, kind: 'order', order: o, orderId: o.id,
        name: o.audienceName || '(이름없음)', phone: o.phone || '', count,
        type: c.type,
        groupLabel: c.type === 'performer' ? c.member.name : c.type === 'group' ? c.label : '',
        selectValue: c.type === 'performer' ? `member:${c.member.id}` : c.type === 'group' ? `group:${c.label}` : c.type === 'unassigned' ? 'unassigned' : 'unmapped',
        originalInviterName: c.originalInviterName || rawInviter,
        createdAt: o.createdAt || '',
      });
    }
    afterPartyPerformerIds.forEach(id => {
      const m = members.find(x => x.id === id) || bandMembers[id] || { id, name: id, part: '' };
      const label = performerGroupMapping[id] || '';
      rows.push({
        key: `performer:${id}`, kind: 'performer', memberId: id, member: m,
        name: m.name, phone: m.phone || '', count: 1,
        type: label ? 'group' : 'performer',
        groupLabel: label || '공연자 본인',
        selectValue: label ? `group:${label}` : 'self',
        originalInviterName: '', createdAt: '',
      });
    });
    return rows;
  }, [orders, concertId, effectiveAfterPartyCount, afterPartyPerformerIds, members, bandMembers, performerGroupMapping, performerOptions, findPerformer]);

  // 확인이 필요한 건을 먼저, 그다음 최근 신청 순으로 보여준다.
  const afterPartyAttendeeList = useMemo(() => {
    const q = mgmtQuery.trim().toLowerCase();
    const priority = { unmapped: 0, unassigned: 1, performer: 2, group: 2 };
    return afterPartyAttendeeRows
      .filter(r => mgmtFilter === 'all' || r.type === mgmtFilter)
      .filter(r => !q || r.name.toLowerCase().includes(q) || stripHyphens(r.phone).includes(stripHyphens(q)) || r.groupLabel.toLowerCase().includes(q) || r.originalInviterName.toLowerCase().includes(q))
      .sort((a, b) => {
        if (priority[a.type] !== priority[b.type]) return priority[a.type] - priority[b.type];
        const timeA = Date.parse(a.createdAt || '') || 0;
        const timeB = Date.parse(b.createdAt || '') || 0;
        if (timeA !== timeB) return timeB - timeA;
        return a.name.localeCompare(b.name);
      });
  }, [afterPartyAttendeeRows, mgmtQuery, mgmtFilter]);

  // 즉시 저장한 변경을 알려주고 몇 초 동안 되돌릴 수 있게 하는 토스트.
  const showAfterPartyToast = (message, undo) => {
    clearTimeout(afterPartyToastTimer.current);
    setAfterPartyToast({ message, undo });
    afterPartyToastTimer.current = setTimeout(() => setAfterPartyToast(null), 6000);
  };
  const undoAfterPartyToast = async () => {
    const toast = afterPartyToast;
    clearTimeout(afterPartyToastTimer.current);
    setAfterPartyToast(null);
    if (toast?.undo) await toast.undo();
  };

  // "소속 그룹" 드롭다운 변경 — 예매 한 건을 즉시 저장하고 실행 취소를 제공한다.
  const changeOrderGroup = async (order, value) => {
    if (!order) return;
    const previous = {
      inviterMemberId: order.inviterMemberId ?? null,
      inviterGroupLabel: order.inviterGroupLabel ?? null,
      inviterExtraMemberIds: Array.isArray(order.inviterExtraMemberIds) ? order.inviterExtraMemberIds : [],
    };
    const name = order.audienceName || '(이름없음)';
    let result = 'error';
    let targetLabel = '';
    if (value === '__new') {
      const label = String(window.prompt('새 그룹 이름을 입력하세요') || '').trim();
      if (!label) return;
      result = await assignGroupLabel([order.id], label);
      targetLabel = label;
    } else if (value.startsWith('member:')) {
      const memberId = value.slice('member:'.length);
      const member = members.find(m => m.id === memberId);
      result = await assignPerformer([order.id], memberId);
      targetLabel = `공연자 ${member?.name || ''} 초대`;
    } else if (value.startsWith('group:')) {
      targetLabel = value.slice('group:'.length);
      result = await assignGroupLabel([order.id], targetLabel);
    } else if (value === 'unassigned') {
      result = await clearInviterClassification([order.id]);
      targetLabel = '초대자 없음';
    } else {
      return;
    }
    if (result === 'firebase') {
      showAfterPartyToast(`${name} → ${targetLabel}`, () => applyAfterPartyPatch([order.id], previous, '실행 취소에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.'));
    }
  };

  const changePerformerGroup = async (row, value) => {
    const previousLabel = performerGroupMapping[row.memberId] || null;
    let nextLabel = null;
    if (value === '__new') {
      nextLabel = String(window.prompt('새 그룹 이름을 입력하세요') || '').trim();
      if (!nextLabel) return;
    } else if (value.startsWith('group:')) {
      nextLabel = value.slice('group:'.length);
    } else if (value !== 'self') {
      return;
    }
    const result = await setPerformerGroup(row.memberId, nextLabel);
    if (result === 'firebase') {
      showAfterPartyToast(`${row.name} → ${nextLabel || '공연자 본인 (그룹 없음)'}`, () => setPerformerGroup(row.memberId, previousLabel));
    }
  };

  const renderOrderDetail = (row) => {
    const o = row.order;
    const primary = resolveInviterMember(o);
    const extras = getExtraPerformerIds(o);
    const extraMembers = extras.map(id => members.find(m => m.id === id) || bandMembers[id] || { id, name: id, part: '' });
    return (
      <div className="after-party-detail-grid">
        <div><span>연락처</span><strong>{o.phone || '-'}</strong></div>
        <div><span>입금</span><strong>{o.depositStatus || '-'}</strong></div>
        <div><span>신청 시간</span><strong>{o.createdAt && Number.isFinite(Date.parse(o.createdAt)) ? new Date(o.createdAt).toLocaleString('ko-KR') : '-'}</strong></div>
        <div><span>원본 초대자 입력</span><strong>{row.originalInviterName ? `"${row.originalInviterName}"` : '없음'}</strong></div>
        <div className="after-party-detail-wide">
          <span>함께한 공연자 (참고용 · 집계에 영향 없음)</span>
          <div className="after-party-detail-chips">
            {extraMembers.map(m => (
              <span key={m.id} className="after-party-chip">{m.name}{m.part ? ` (${m.part})` : ''}
                {isAdmin && <button type="button" aria-label={`${m.name} 빼기`} onClick={() => removeExtraPerformer(o.id, m.id)}>✕</button>}
              </span>
            ))}
            {extraMembers.length === 0 && <span className="after-party-detail-empty">없음</span>}
            {isAdmin && <AddPerformerPicker members={performerOptions} excludeIds={[primary?.id, ...extras].filter(Boolean)} onAdd={(memberId) => addExtraPerformer(o.id, memberId)} triggerText="+ 추가" />}
          </div>
        </div>
      </div>
    );
  };

  const renderPerformerDetail = (row) => {
    const selectedOrderId = afterPartyPerformerOrderIds[row.memberId] || '';
    const availableOrders = (concertId ? filterOrdersForShow(orders, concertId) : orders).filter(order => {
      if (!order.isAfterParty) return false;
      if (order.id === selectedOrderId) return true;
      return (performerDuplicateCountByOrder[order.id] || 0) < (Number(order.afterPartyCount) || 1);
    });
    return (
      <div className="after-party-detail-grid">
        <div className="after-party-detail-wide">
          <span>본인 명의 예매가 있나요?</span>
          <select className="after-party-group-select" value={selectedOrderId} disabled={!isAdmin} aria-label={`${row.name} 본인 예매 연결`}
            onChange={event => setPerformerDuplicateOrder(row.memberId, event.target.value)}>
            <option value="">별도 참석 (중복 없음)</option>
            {availableOrders.map(order => <option key={order.id} value={order.id}>{order.audienceName || '이름 없음'} · 뒤풀이 {Number(order.afterPartyCount) || 1}명</option>)}
          </select>
          <small>연결하면 그 예매 인원에서 1명을 빼서 인원·좌석이 겹치지 않게 해요.</small>
        </div>
        {isAdmin && (
          <div className="after-party-detail-wide">
            <button type="button" className="after-party-edit-button" style={{ border: '1px solid #fca5a5', color: '#dc2626', background: '#fff' }} onClick={() => removePerformerFromAfterParty(row.memberId)}>뒤풀이 참석 취소</button>
          </div>
        )}
      </div>
    );
  };

  const bookingAttendeeCount = useMemo(() => {
    return afterPartyAttendeeRows
      .filter(r => r.kind === 'order')
      .reduce((sum, r) => sum + r.count, 0);
  }, [afterPartyAttendeeRows]);

  const findMemberRecommendation = useCallback((originalText) => {
    if (!originalText) return null;
    const cleanOrig = String(originalText).replace(/\s+/g, '').toLowerCase();
    if (!cleanOrig) return null;
    let match = performerOptions.find(m => m.name.replace(/\s+/g, '').toLowerCase() === cleanOrig);
    if (match) return match;
    if (cleanOrig.length >= 2) {
      match = performerOptions.find(m => {
        const cName = m.name.replace(/\s+/g, '').toLowerCase();
        return cName.includes(cleanOrig) || cleanOrig.includes(cName);
      });
      if (match) return match;
      const prefix = cleanOrig.slice(0, 2);
      match = performerOptions.find(m => m.name.replace(/\s+/g, '').toLowerCase().startsWith(prefix));
      if (match) return match;
    }
    return null;
  }, [performerOptions]);

  const inboxItems = useMemo(() => {
    const unmapped = [];
    const unassigned = [];
    for (const r of afterPartyAttendeeRows) {
      if (r.kind !== 'order') continue;
      if (r.type === 'unmapped') {
        unmapped.push({ ...r, suggest: findMemberRecommendation(r.originalInviterName) });
      } else if (r.type === 'unassigned') {
        unassigned.push({ ...r, suggest: findMemberRecommendation(r.originalInviterName) });
      }
    }
    return [...unmapped, ...unassigned];
  }, [afterPartyAttendeeRows, findMemberRecommendation]);

  const applyInbox = async (item, targetValue, applyAll = false) => {
    if (!item || !targetValue) return;
    const targetItems = (applyAll && item.originalInviterName)
      ? inboxItems.filter(i => i.originalInviterName === item.originalInviterName)
      : [item];
    const orderIds = targetItems.map(i => i.orderId);
    const previousMap = {};
    targetItems.forEach(i => {
      const o = i.order;
      previousMap[i.orderId] = {
        inviterMemberId: o.inviterMemberId ?? null,
        inviterGroupLabel: o.inviterGroupLabel ?? null,
        inviterExtraMemberIds: Array.isArray(o.inviterExtraMemberIds) ? o.inviterExtraMemberIds : [],
      };
    });

    let result = 'error';
    let labelText = '';
    if (targetValue === '__new') {
      const label = String(window.prompt('새 그룹 이름을 입력하세요') || '').trim();
      if (!label) return;
      result = await assignGroupLabel(orderIds, label);
      labelText = label;
    } else if (targetValue.startsWith('member:')) {
      const memberId = targetValue.slice('member:'.length);
      const member = members.find(m => m.id === memberId);
      result = await assignPerformer(orderIds, memberId);
      labelText = `공연자 ${member?.name || ''} 초대`;
    } else if (targetValue.startsWith('group:')) {
      labelText = targetValue.slice('group:'.length);
      result = await assignGroupLabel(orderIds, labelText);
    } else if (targetValue === 'unassigned') {
      result = await clearInviterClassification(orderIds);
      labelText = '초대자 없음';
    }

    if (result === 'firebase') {
      const countStr = targetItems.length > 1 ? `${targetItems[0].name} 외 ${targetItems.length - 1}건` : item.name;
      showAfterPartyToast(`${countStr} → ${labelText}`, async () => {
        for (const [oid, prev] of Object.entries(previousMap)) {
          await applyAfterPartyPatch([oid], prev, '실행 취소에 실패했습니다.');
        }
      });
      setInboxIndex(prev => Math.min(prev, Math.max(0, inboxItems.length - targetItems.length - 1)));
    }
  };

  // 그룹 카드는 참석 명단과 같은 분류 결과(afterPartyEntries)로 만든다. 예전에는 수동 지정된
  // inviterMemberId만 세어, 이름으로 자동 연결된 예매나 다른 공연의 예매가 카드와 명단에서 다르게 보였다.
  const afterPartyGroupsList = useMemo(() => {
    const cards = new Map();
    const perfCard = (memberId) => {
      const id = `member:${memberId}`;
      if (!cards.has(id)) {
        const m = findPerformer(memberId) || { id: memberId, name: memberId, part: '' };
        cards.set(id, {
          id, kind: 'perf', memberId, name: m.name,
          sub: m.part ? `${m.part} · 공연자 초대` : m.type === 'external' ? '외부 공연자 · 공연자 초대' : '공연자 초대',
          orderCount: 0, orderAttendees: 0, directCount: 0, totalCount: 0, orders: [], performers: [],
        });
      }
      return cards.get(id);
    };
    const groupCard = (label) => {
      const id = `group:${label}`;
      if (!cards.has(id)) {
        cards.set(id, { id, kind: 'group', name: label, sub: '직접 만든 그룹', orderCount: 0, orderAttendees: 0, directCount: 0, totalCount: 0, orders: [], performers: [] });
      }
      return cards.get(id);
    };

    afterPartyEntries.groups.forEach(g => {
      const card = g.type === 'performer' && g.memberId ? perfCard(g.memberId) : g.type === 'group' ? groupCard(g.label) : null;
      if (!card) return; // 이름 불일치(확인 필요) 묶음은 정리함에서 다룬다
      card.orders = g.orderIds.map(orderId => ordersById[orderId]).filter(Boolean);
      card.orderCount = card.orders.length;
      card.orderAttendees = g.count;
      card.totalCount += g.count;
    });
    afterPartyPerformerIds.forEach(memberId => {
      const label = performerGroupMapping[memberId];
      const card = label ? groupCard(label) : perfCard(memberId);
      card.performers.push(findPerformer(memberId) || { id: memberId, name: memberId, part: '' });
      card.directCount += 1;
      card.totalCount += 1;
    });
    groupOptionLabels.forEach(label => groupCard(label)); // 아직 비어 있는 직접 만든 그룹도 카드로 보여 준다

    return [...cards.values()].sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name));
  }, [afterPartyEntries, afterPartyPerformerIds, performerGroupMapping, groupOptionLabels, ordersById, findPerformer]);

  const handleRenameGroup = async (oldLabel) => {
    const newLabel = String(window.prompt('새 그룹 이름을 입력하세요', oldLabel) || '').trim();
    if (!newLabel || newLabel === oldLabel) return;
    const targetOrders = orders.filter(o => o.isAfterParty && o.inviterGroupLabel === oldLabel);
    const orderIds = targetOrders.map(o => o.id);
    const prevMapping = { ...performerGroupMapping };
    const nextMapping = { ...performerGroupMapping };
    Object.entries(nextMapping).forEach(([mId, grp]) => {
      if (grp === oldLabel) nextMapping[mId] = newLabel;
    });
    if (orderIds.length > 0) {
      await assignGroupLabel(orderIds, newLabel);
    }
    await patchCurrentShow({ performerGroupMapping: nextMapping });
    setSelectedGroupId(`group:${newLabel}`);
    showAfterPartyToast(`그룹 "${oldLabel}" → "${newLabel}"(으)로 변경됨`, async () => {
      if (orderIds.length > 0) await assignGroupLabel(orderIds, oldLabel);
      await patchCurrentShow({ performerGroupMapping: prevMapping });
      setSelectedGroupId(`group:${oldLabel}`);
    });
  };

  const handleDisbandGroup = async (group) => {
    if (!window.confirm(`"${group.name}" 그룹을 해제하시겠습니까?\n소속된 예매 건은 모두 "초대자 없음"으로 바뀌고 공연자는 그룹 없는 본인 참석으로 변경됩니다.`)) return;
    const orderIds = group.orders.map(o => o.id);
    const prevOrders = group.orders.map(o => ({
      id: o.id,
      patch: {
        inviterMemberId: o.inviterMemberId ?? null,
        inviterGroupLabel: o.inviterGroupLabel ?? null,
        inviterExtraMemberIds: Array.isArray(o.inviterExtraMemberIds) ? o.inviterExtraMemberIds : [],
      }
    }));
    const prevMapping = { ...performerGroupMapping };
    const nextMapping = { ...performerGroupMapping };
    if (group.kind === 'group') {
      Object.entries(nextMapping).forEach(([mId, grp]) => {
        if (grp === group.name) delete nextMapping[mId];
      });
    }

    if (orderIds.length > 0) {
      await clearInviterClassification(orderIds);
    }
    if (group.kind === 'group') {
      await patchCurrentShow({ performerGroupMapping: nextMapping });
    }
    setSelectedGroupId(null);
    showAfterPartyToast(`"${group.name}" 그룹이 해제됨`, async () => {
      for (const item of prevOrders) {
        await applyAfterPartyPatch([item.id], item.patch, '실행 취소 실패');
      }
      if (group.kind === 'group') {
        await patchCurrentShow({ performerGroupMapping: prevMapping });
      }
    });
  };

  const handleRemoveOrderFromGroup = async (order) => {
    const prev = {
      inviterMemberId: order.inviterMemberId ?? null,
      inviterGroupLabel: order.inviterGroupLabel ?? null,
      inviterExtraMemberIds: Array.isArray(order.inviterExtraMemberIds) ? order.inviterExtraMemberIds : [],
    };
    const res = await clearInviterClassification([order.id]);
    if (res === 'firebase') {
      showAfterPartyToast(`${order.audienceName} → 초대자 없음으로 분리됨`, () => {
        applyAfterPartyPatch([order.id], prev, '실행 취소 실패');
      });
    }
  };

  const handleRemovePerformerFromGroup = async (memberId, memberName) => {
    const prevLabel = performerGroupMapping[memberId] || null;
    const res = await setPerformerGroup(memberId, null);
    if (res === 'firebase') {
      showAfterPartyToast(`${memberName} → 그룹 없는 본인 참석으로 변경됨`, () => {
        setPerformerGroup(memberId, prevLabel);
      });
    }
  };

  const listRows = afterPartyAttendeeList;
  const listPageSize = 20;
  const afterPartyPageCount = Math.max(1, Math.ceil(listRows.length / listPageSize));
  const effectiveAfterPartyPage = Math.min(afterPartyPage, afterPartyPageCount - 1);
  const visibleListRows = listRows.slice(effectiveAfterPartyPage * listPageSize, (effectiveAfterPartyPage + 1) * listPageSize);
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
    if (dataLoadFailed) return;
    const saved = await firebaseStorage.patchOrders(list => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    if (!Array.isArray(saved)) { setMappingErrorMsg(SERVER_SAVE_FAILED_MSG); return; }
    setOrders(saved);
  };

  // 예매 내역 삭제 (관리자 전용) — 테스트 신청이나 취소 요청 등을 되돌릴 수 없이 완전히 제거한다.
  const deleteOrder = async (order) => {
    if (!isAdmin || dataLoadFailed) return;
    if (!window.confirm(`${order.audienceName || '이름없음'}님의 예매 내역(${order.ticketCount}매)을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const saved = await firebaseStorage.patchOrders(list => list.filter((o) => o.id !== order.id), { allowEmpty: true });
    if (!Array.isArray(saved)) { setMappingErrorMsg(SERVER_SAVE_FAILED_MSG); return; }
    setOrders(saved);
  };

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
      const ok = await patchCurrentShow({ extraDonationList: nextList, extraDonation: nextSum });
      if (!ok) return;
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
      await patchCurrentShow({ extraDonationList: nextList, extraDonation: nextSum });
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
      case 'inviterName': {
        const isAfter = Boolean(o.isAfterParty);
        const classification = isAfter ? classifyAfterPartyOrder(o) : null;
        return (
          <td key={colId} style={{ padding: '10px 8px', textAlign: 'center', width: cellWidth, boxSizing: 'border-box' }}>
            <div style={{ display: 'grid', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>{o.inviterName || '-'}</span>
              {isAfter && (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                  {classification?.type === 'performer' && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 6, border: '1px solid #a7f3d0' }}>
                      ✓ {classification.label}
                    </span>
                  )}
                  {classification?.type === 'unmapped' && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fffbeb', padding: '1px 6px', borderRadius: 6, border: '1px solid #fde68a' }}>
                      미매핑
                    </span>
                  )}
                  {classification?.type === 'unassigned' && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      미분류
                    </span>
                  )}
                  {classification?.type === 'group' && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '1px 6px', borderRadius: 6, border: '1px solid #ddd6fe' }}>
                      {classification.label}
                    </span>
                  )}
                </div>
              )}
            </div>
          </td>
        );
      }
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

  const tableDisplayLayouts = useMemo(() => {
    const layouts = afterPartyTables.map(table => {
      const seatNameById = new Map();
      const occupiedSeats = new Set(Object.keys(performerSeatAssignments));
      table.seats.forEach(seat => {
        const performerId = performerSeatAssignments[seat.id];
        const isCanonicalPerformerSeat = performerId && canonicalPerformerSeatByMember[performerId] === seat.id;
        if (isCanonicalPerformerSeat) seatNameById.set(seat.id, members.find(member => member.id === performerId)?.name || '');
        const attendee = participantSeatAssignments[seat.id];
        if (attendee && !isCanonicalPerformerSeat) {
          seatNameById.set(seat.id, afterPartyParticipants.find(person => person.orderId === attendee.orderId)?.name || '');
          occupiedSeats.add(seat.id);
        }
    });
      let legacySeatIndex = 0;
      (seatingOverview.tables.find(item => item.table.id === table.id)?.participants || []).forEach(person => {
        for (let attendeeIndex = 0; attendeeIndex < person.count; attendeeIndex += 1) {
          if (Object.values(participantSeatAssignments).some(value => value?.orderId === person.orderId && value?.attendeeIndex === attendeeIndex)) continue;
          while (legacySeatIndex < table.seats.length && occupiedSeats.has(table.seats[legacySeatIndex].id)) legacySeatIndex += 1;
          if (legacySeatIndex < table.seats.length) {
            const seat = table.seats[legacySeatIndex++];
            seatNameById.set(seat.id, person.name);
            occupiedSeats.add(seat.id);
          }
        }
      });
      const seatNames = table.seats.map(seat => seatNameById.get(seat.id) || '');
      const labelWidth = Math.min(180, Math.max(80, ...seatNames.filter(Boolean).map(name => Array.from(name).length * 12 + 24)));
      const labelHeight = Math.max(32, ...seatNames.filter(Boolean).map(name => Math.ceil((Array.from(name).length * 12 + 4) / labelWidth) * 14 + 10));
      const occupiedCount = seatNames.filter(Boolean).length;
      const baseWidth = table.baseWidth || table.width;
      const baseHeight = table.baseHeight || table.height;
      let width = baseWidth;
      let height = baseHeight;
      if (occupiedCount && table.shape === 'circle') {
        const requiredDiameter = Math.ceil(occupiedCount * (labelWidth + SEAT_MIN_GAP) / Math.PI);
        width = height = Math.max(baseWidth, baseHeight, requiredDiameter);
      } else if (occupiedCount) {
        const baseGeometry = { ...table, width: baseWidth, height: baseHeight };
        const plannedSlots = computeSeatSlots(baseGeometry, table.seats.length);
        const horizontalSlots = plannedSlots.filter(point => point.y < table.y || point.y > table.y + baseHeight).length;
        const verticalSlots = plannedSlots.length - horizontalSlots;
        width = Math.max(baseWidth, Math.ceil(horizontalSlots / 2) * (labelWidth + SEAT_MIN_GAP) + 24);
        height = Math.max(baseHeight, Math.ceil(verticalSlots / 2) * (labelHeight + SEAT_MIN_GAP) + 24);
      }
      return { ...table, width, height, baseWidth, baseHeight };
    });

    // Keep saved positions when possible and place collisions into additional rows.
    layouts.sort((a, b) => a.y - b.y || a.x - b.x);
    const placed = [];
    layouts.forEach(layout => {
      let x = Math.max(30, layout.x);
      let y = Math.max(30, layout.y);
      let attempts = 0;
      while (placed.some(other => tablesOverlap({ ...layout, x, y }, other)) && attempts <= placed.length) {
        x += layout.width + 220;
        if (x + layout.width > TABLE_CANVAS_WIDTH) {
          x = 30;
          y += Math.max(layout.height, ...placed.filter(other => other.y <= y && other.y + other.height > y).map(other => other.height)) + 220;
        }
        attempts += 1;
      }
      layout.x = x;
      layout.y = y;
      placed.push(layout);
    });

    return new Map(layouts.map(layout => [layout.id, layout]));
  }, [afterPartyTables, seatingOverview.tables, participantSeatAssignments, performerSeatAssignments, canonicalPerformerSeatByMember, afterPartyParticipants, members]);

  const tableCanvasSize = useMemo(() => {
    const layouts = [...tableDisplayLayouts.values()];
    const bounds = layouts.map(getTableBounds);
    return {
      width: Math.max(TABLE_CANVAS_WIDTH, ...bounds.map(table => table.x + table.width + 110)),
      height: Math.max(TABLE_CANVAS_HEIGHT, ...bounds.map(table => table.y + table.height + 110)),
    };
  }, [tableDisplayLayouts]);

  useEffect(() => {
    if (!isAdmin || !currentShow || !afterPartyTables.length) return;
    if (Array.isArray(currentShow.tables) && currentShow.tables.some(table => !Array.isArray(table.seats) || Number(table.capacity) !== table.seats.length)) return;
    const changed = afterPartyTables.some(table => {
      const layout = tableDisplayLayouts.get(table.id);
      return layout && (Math.abs(table.x - layout.x) > 0.5 || Math.abs(table.y - layout.y) > 0.5
        || Math.abs(table.width - layout.width) > 0.5 || Math.abs(table.height - layout.height) > 0.5
        || table.baseWidth !== layout.baseWidth || table.baseHeight !== layout.baseHeight);
    });
    if (!changed) return;
    const tables = afterPartyTables.map(table => {
      const layout = tableDisplayLayouts.get(table.id);
      if (!layout) return table;
      return {
        ...table,
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        baseWidth: layout.baseWidth,
        baseHeight: layout.baseHeight,
        seats: table.seats.map(seat => {
          const relativeX = (seat.x * TABLE_CANVAS_WIDTH - table.x) / Math.max(1, table.width);
          const relativeY = (seat.y * TABLE_CANVAS_HEIGHT - table.y) / Math.max(1, table.height);
          return { ...seat, x: (layout.x + relativeX * layout.width) / TABLE_CANVAS_WIDTH, y: (layout.y + relativeY * layout.height) / TABLE_CANVAS_HEIGHT };
        }),
      };
    });
    saveSeatingPatch({ tables });
  }, [isAdmin, currentShow, afterPartyTables, tableDisplayLayouts, saveSeatingPatch]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100dvh', gap: 16, background: '#f8fafc' }}>
        <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 4 }}></div>
        <div className="loading-text" style={{ color: 'var(--slate-500)', fontSize: 15, fontWeight: 600 }}>데이터를 불러오는 중입니다...</div>
      </div>
    );
  }

  return (
    <div className="page fade-in reservation-management-page" style={{ background: '#f8fafc', minHeight: '100dvh' }}>
      {showColSettings && (
        <ColumnSettingsPanel
          colOrder={colOrder}
          setColOrder={setColOrder}
          hiddenCols={hiddenCols}
          setHiddenCols={setHiddenCols}
          onClose={() => setShowColSettings(false)}
        />
      )}

      <div className="page-container reservation-management-container" style={{ display: 'grid', gap: 20, padding: '32px 16px' }}>
        {/* ── 페이지 헤더 ── */}
        <div className="reservation-page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
                {routeShowTitle || (concertId ? '공연 예매 관리' : '전체 공연 예매 관리')}
              </h1>
            )}
          </div>
          <button type="button" className="btn-secondary" style={{ height: 38, padding: '0 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => navigate('/concerts')}>
            ← 공연 목록
          </button>
        </div>

        {/* ── [섹션 1] 상단 요약 카드 및 '입장 관리 모드(당일 모드)' 토글 + 예매자 관리 내역(테이블) ── */}
        
        {/* 1-1. 상단 통계 요약 카드 */}
        <div className="reservation-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
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
        <div className="card card-pad reservation-list-card" style={{ display: 'grid', gap: 14, borderRadius: 20, border: '1px solid #e2e8f0' }}>

          <div className="reservation-list-heading">
            <div>
              <div className="reservation-section-kicker">RESERVATIONS</div>
              <h2>예매 내역</h2>
              <p>예매 정보와 입금·입장 상태를 확인하고 관리합니다.</p>
            </div>
            <div className="reservation-heading-count"><strong>{visibleOrders.length}</strong><span>건</span></div>
          </div>

          {/* 입장 관리 모드 (당일 모드) 토글 */}
          <div className="reservation-checkin-toggle" style={{
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
          <div className="reservation-toolbar" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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

          <div className="reservation-filter-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            <div className="reservation-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                신청 최신순 · {visibleOrders.length === 0 ? 0 : reservationPage * 10 + 1}~{Math.min((reservationPage + 1) * 10, visibleOrders.length)} / {visibleOrders.length}건
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" disabled={reservationPage === 0} onClick={() => setReservationPage(page => Math.max(0, page - 1))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: reservationPage === 0 ? 'not-allowed' : 'pointer' }}>이전</button>
                <span style={{ fontSize: 12, color: '#475569' }}>{reservationPage + 1} / {Math.max(1, reservationPageCount)}</span>
                <button type="button" disabled={reservationPage + 1 >= reservationPageCount} onClick={() => setReservationPage(page => Math.min(reservationPageCount - 1, page + 1))} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: reservationPage + 1 >= reservationPageCount ? 'not-allowed' : 'pointer' }}>다음</button>
              </div>
            </div>
            <div className="reservation-table-scroll" style={{ overflowX: 'auto', margin: '0 -24px' }}>
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


        {/* ── 공연 정산표: 쓸 수 있는 돈(티켓·부원 회비·후원금)과 든 돈(지출)을 한 표로 본다 ── */}
        {currentShow && (
          <ShowSettlementCard
            show={currentShow}
            isAdmin={isAdmin}
            onPatchShow={patchCurrentShow}
            ticketCash={totals.ticketCash}
            duesCoveredSum={totals.duesCoveredSum}
            duesCoveredCount={totals.duesCoveredCount}
            donations={donationList}
            participantIds={currentShowParticipantIds}
            members={members}
            bandMembers={bandMembers}
          />
        )}

        {/* ── [섹션 2] 후원금 관리 — 공연을 선택하면 정산표가 후원금을 관리하므로 전체 보기에서만 표시 ── */}
        {!currentShow && (
        <div style={{ background: '#111827', borderRadius: 20, padding: '20px 24px', color: '#fff', display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>후원금 관리</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                {currentShow ? `후원금 ${totals.extraDonation.toLocaleString()}원` : `총 모금액 ${totals.totalFund.toLocaleString()}원`}
              </div>
              {currentShow ? (
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, lineHeight: 1.5 }}>
                  따로 받은 후원을 기록합니다. 위 공연 정산표의 '후원금'에 더해집니다.
                </div>
              ) : (
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, lineHeight: 1.5 }}>
                {isTiered
                  ? `입금완료 ${totals.paidTickets}매 (가격 구간별 단가 적용)`
                  : `입금완료 ${totals.paidTickets}매 × ${totals.ticketPrice.toLocaleString()}원`}
                {totals.extraDonation > 0 && <span style={{ color: '#10b981' }}> + 후원금 총 {totals.extraDonation.toLocaleString()}원 ({donationList.length}건)</span>}
              </div>
              )}
              {!currentShow && totals.duesCoveredSum > 0 && (
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
        )}

        {/* ── [섹션 3] 뒤풀이 관리 — "참여자 관리"(공연자 매핑/텍스트 그룹/미기재)와
             "테이블 배치"(참여자 관리와 완전히 독립된 데이터)를 탭으로 전환하며 관리한다.
             참여 인원이 0명이어도 섹션 자체는 항상 표시해 오류 없이 빈 상태를 보여준다. */}
        <div className="card card-pad after-party-card" style={{ borderRadius: 20, border: '1px solid #e2e8f0' }}>
            <div className="after-party-header">
              <div>
                <div className="after-party-eyebrow">공연 운영</div>
                <h2>뒤풀이 관리</h2>
                <p>참석 명단과 좌석 배치는 서로 독립적으로 관리됩니다.</p>
              </div>
              <div className="after-party-tabs" role="tablist" aria-label="뒤풀이 관리 작업">
                {[
                  { value: 'participants', step: '1', label: '참석 명단' },
                  { value: 'groups', step: '2', label: '그룹' },
                  { value: 'tables', step: '3', label: '좌석 배치' },
                ].map(t => (
                  <button key={t.value} type="button" role="tab" aria-selected={afterPartyTab === t.value}
                    className={afterPartyTab === t.value ? 'after-party-tab is-active' : 'after-party-tab'}
                    onClick={() => setAfterPartyTab(t.value)}
                  >
                    <span className="after-party-tab-step">{t.step}</span>
                    {t.label}
                  </button>
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

            {/* 상단 요약 바 */}
            <div className="after-party-summary-bar" style={{ marginBottom: 14 }}>
              <div className="stats">
                뒤풀이 참석 총 <strong>{afterPartySummary.total}명</strong>
                <span>예매 {bookingAttendeeCount}명 · 공연자 본인 {afterPartyPerformerIds.length}명</span>
              </div>
              {afterPartySummary.unmapped > 0 ? (
                <div className="alert">
                  <span>⚠️ 그룹 확인이 필요한 참석자 {afterPartySummary.unmapped}건</span>
                  <button type="button" onClick={() => setAfterPartyTab('groups')}>지금 정리하기 →</button>
                </div>
              ) : (
                <div className="alert ok">
                  <span>✅ 모든 참석자의 그룹이 정리됐어요</span>
                </div>
              )}
            </div>

            {afterPartyTab === 'participants' && (
              <div className="after-party-participants-view">
                <div className="after-party-participant-layout is-single">
                  <section className="after-party-list-panel">
                    <div className="after-party-list-toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '14px 16px 10px' }}>
                      <input
                        type="search"
                        value={mgmtQuery}
                        onChange={(e) => { setMgmtQuery(e.target.value); setAfterPartyPage(0); }}
                        placeholder="이름 · 연락처 · 소속 그룹 검색"
                        aria-label="뒤풀이 참석자 검색"
                        style={{ flex: 1, minWidth: 200 }}
                      />
                      <div className="after-party-filter-row" style={{ padding: 0, overflowX: 'visible', margin: 0 }}>
                        {[
                          { value: 'all', label: '전체', count: afterPartyAttendeeRows.length },
                          { value: 'unmapped', label: '확인 필요', count: afterPartyAttendeeRows.filter(r => r.type === 'unmapped').length },
                          { value: 'performer', label: '공연자 본인', count: afterPartyAttendeeRows.filter(r => r.kind === 'performer').length },
                        ].map(f => (
                          <button key={f.value} type="button" aria-pressed={mgmtFilter === f.value}
                            className={mgmtFilter === f.value ? 'after-party-filter is-active' : 'after-party-filter'}
                            onClick={() => { setMgmtFilter(f.value); setAfterPartyPage(0); }}
                          >{f.label} <span>{f.count}</span></button>
                        ))}
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          className="after-party-filter"
                          style={{ background: isPerformerPanelOpen ? '#1e3a8a' : '#eff6ff', color: isPerformerPanelOpen ? '#fff' : '#1d4ed8', borderColor: '#93c5fd', fontWeight: 800 }}
                          onClick={() => setIsPerformerPanelOpen(prev => !prev)}
                        >
                          {isPerformerPanelOpen ? '✕ 공연자 닫기' : '+ 공연자 추가'}
                        </button>
                      )}
                    </div>

                    {/* 접이식 공연자 참석 관리 패널 */}
                    {isPerformerPanelOpen && (
                      <div style={{ margin: '0 16px 14px', padding: '14px', borderRadius: 12, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#1e3a8a' }}>🎸 공연 참가자 뒤풀이 참석 관리 (참석 {afterPartyPerformerIds.length}명)</span>
                          {isAdmin && currentShowParticipantIds.length > 0 && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="button" onClick={() => patchCurrentShow({ afterPartyPerformerIds: Array.from(new Set([...afterPartyPerformerIds, ...currentShowParticipantIds])) })} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #93c5fd', background: '#fff', color: '#1d4ed8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>공연자 전원 참석 추가</button>
                              <button type="button" onClick={() => patchCurrentShow({ afterPartyPerformerIds: afterPartyPerformerIds.filter(id => !currentShowParticipantIds.includes(id)) })} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>전원 해제</button>
                            </div>
                          )}
                        </div>
                        {currentShowParticipantIds.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {currentShowParticipantIds.map(memberId => {
                              const m = members.find(x => x.id === memberId) || bandMembers[memberId] || { id: memberId, name: memberId, part: '' };
                              const isAttending = afterPartyPerformerIds.includes(memberId);
                              return (
                                <button key={memberId} type="button" disabled={!isAdmin} onClick={() => isAttending ? removePerformerFromAfterParty(memberId) : addPerformerToAfterParty(memberId)}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 9, border: `1.5px solid ${isAttending ? '#2563eb' : '#cbd5e1'}`, background: isAttending ? '#2563eb' : '#fff', color: isAttending ? '#fff' : '#475569', fontSize: 11, fontWeight: 700, cursor: isAdmin ? 'pointer' : 'default' }}>
                                  <span>{isAttending ? '✓' : '+'}</span>
                                  <span>{m.name}{m.part ? ` (${m.part})` : ''}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {isAdmin && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px dashed #bfdbfe' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a' }}>다른 회원 직접 추가:</span>
                            <AddPerformerPicker members={performerOptions} excludeIds={afterPartyPerformerIds} onAdd={(memberId) => addPerformerToAfterParty(memberId)} triggerText="+ 공연자 직접 추가" />
                            {afterPartyPerformerIds.filter(id => !currentShowParticipantIds.includes(id)).map(id => {
                              const m = members.find(x => x.id === id) || bandMembers[id] || { id, name: id, part: '' };
                              return (
                                <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8, background: '#fff', border: '1px solid #93c5fd', color: '#1d4ed8', fontSize: 11, fontWeight: 700 }}>
                                  {m.name}{m.part ? ` (${m.part})` : ''}
                                  <button type="button" onClick={() => removePerformerFromAfterParty(id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 800, cursor: 'pointer', padding: 0, marginLeft: 2 }}>✕</button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="after-party-table-wrap">
                      <table className="after-party-participant-table after-party-attendee-table">
                        <thead><tr><th>참석자</th><th>인원</th><th>소속 그룹</th><th>비고</th></tr></thead>
                        <tbody>
                          {listRows.length === 0 ? (
                            <tr><td colSpan={4} className="after-party-empty-row">검색/필터 조건에 맞는 참석자가 없습니다.</td></tr>
                          ) : visibleListRows.map(row => {
                            const isOpen = expandedAttendeeKey === row.key;
                            const badge = AFTER_PARTY_TYPE_BADGE[row.type];
                            const groupOptions = groupOptionLabels.map(label => <option key={label} value={`group:${label}`}>🏷 {label}</option>);
                            const currentMemberMissing = row.selectValue.startsWith('member:') && !performerOptions.some(m => `member:${m.id}` === row.selectValue);
                            const subText = row.kind === 'performer' ? '공연자 본인 참석'
                              : row.originalInviterName ? `초대자 입력: "${row.originalInviterName}"` : '초대자 미기재';
                            const noteText = row.kind === 'performer'
                              ? (afterPartyPerformerOrderIds[row.memberId] ? '본인 예매와 연결됨' : '')
                              : row.type === 'unmapped' ? '회원 이름과 일치하지 않아요' : '';
                            return (
                              <Fragment key={row.key}>
                                <tr className={isOpen ? 'is-selected' : ''} aria-expanded={isOpen} onClick={() => setExpandedAttendeeKey(isOpen ? null : row.key)}>
                                  <td>
                                    <div className="after-party-row-title">
                                      <span><strong>{row.name}{row.kind === 'performer' ? ' 🎤' : ''}</strong><small>{subText}</small></span>
                                    </div>
                                  </td>
                                  <td><strong>{row.count}명</strong></td>
                                  <td onClick={event => event.stopPropagation()}>
                                    <select
                                      className="after-party-group-select"
                                      value={row.selectValue}
                                      disabled={!isAdmin}
                                      aria-label={`${row.name} 소속 그룹`}
                                      onChange={event => (row.kind === 'performer' ? changePerformerGroup(row, event.target.value) : changeOrderGroup(row.order, event.target.value))}
                                    >
                                      {row.kind === 'performer' ? (
                                        <>
                                          <option value="self">🎤 공연자 본인 (그룹 없음)</option>
                                          <optgroup label="직접 만든 그룹">
                                            {groupOptions}
                                            <option value="__new">➕ 새 그룹 만들기…</option>
                                          </optgroup>
                                        </>
                                      ) : (
                                        <>
                                          {row.selectValue === 'unmapped' && <option value="unmapped" disabled>⚠️ 확인 필요 — 그룹을 골라 주세요</option>}
                                          {currentMemberMissing && <option value={row.selectValue}>🎤 {row.groupLabel}</option>}
                                          <optgroup label="공연자 초대">
                                            {performerOptions.map(m => <option key={m.id} value={`member:${m.id}`}>🎤 {m.name}{performerSuffix(m)}</option>)}
                                          </optgroup>
                                          <optgroup label="직접 만든 그룹">
                                            {groupOptions}
                                            <option value="__new">➕ 새 그룹 만들기…</option>
                                          </optgroup>
                                          <option value="unassigned">⊘ 초대자 없음</option>
                                        </>
                                      )}
                                    </select>
                                    <span className={`after-party-status after-party-status-${row.type}`}><i />{badge.text}</span>
                                  </td>
                                  <td className="after-party-attendee-note">{noteText}</td>
                                </tr>
                                {isOpen && (
                                  <tr className="after-party-attendee-detail">
                                    <td colSpan={4} onClick={event => event.stopPropagation()}>
                                      {row.kind === 'performer' ? renderPerformerDetail(row) : renderOrderDetail(row)}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="after-party-list-pagination">
                      <span>{listRows.length === 0 ? '0개' : `${effectiveAfterPartyPage * listPageSize + 1}–${Math.min((effectiveAfterPartyPage + 1) * listPageSize, listRows.length)}개`} / {listRows.length}개</span>
                      <div>
                        <button type="button" disabled={effectiveAfterPartyPage === 0} onClick={() => setAfterPartyPage(Math.max(0, effectiveAfterPartyPage - 1))}>이전</button>
                        <span>{effectiveAfterPartyPage + 1} / {afterPartyPageCount}</span>
                        <button type="button" disabled={effectiveAfterPartyPage + 1 >= afterPartyPageCount} onClick={() => setAfterPartyPage(Math.min(afterPartyPageCount - 1, effectiveAfterPartyPage + 1))}>다음</button>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {afterPartyTab === 'groups' && (
              <div className="after-party-groups-view">
                {/* 1. 정리함 (Inbox) */}
                <div className="after-party-inbox">
                  <div className="after-party-inbox-head">
                    <strong>정리함 · <span style={{ color: '#b45309' }}>{inboxItems.length}</span>건 남음</strong>
                    <span style={{ fontSize: 12, color: '#71717a' }}>한 건씩 처리하면 자동으로 다음으로 넘어갑니다</span>
                  </div>
                  {inboxItems.length === 0 ? (
                    <div className="after-party-inbox-card" style={{ textAlign: 'center', padding: '24px 16px', color: '#047857', fontWeight: 800, fontSize: 15 }}>
                      🎉 모든 참석자의 그룹이 정리됐어요
                    </div>
                  ) : (() => {
                    const currentIdx = Math.min(inboxIndex, inboxItems.length - 1);
                    const item = inboxItems[currentIdx];
                    const sameTextCount = item.originalInviterName ? inboxItems.filter(i => i.originalInviterName === item.originalInviterName).length : 1;
                    return (
                      <div className="after-party-inbox-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                          <div>
                            <strong style={{ fontSize: 15, color: '#18181b' }}>{item.name} · {item.count}명</strong>
                            <div style={{ fontSize: 12, color: '#71717a', marginTop: 3 }}>
                              {item.originalInviterName ? `초대자 칸에 "${item.originalInviterName}"(이)라고 적었어요.` : '초대자가 적혀있지 않아요.'}
                            </div>
                          </div>
                          {item.order?.phone && <span style={{ fontSize: 11, color: '#71717a' }}>연락처: {item.order.phone}</span>}
                        </div>

                        {item.suggest && (
                          <div className="after-party-suggest">
                            <span style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                              추천 <b>🎤 {item.suggest.name}{item.suggest.part ? ` (${item.suggest.part})` : ''}</b> (이름이 비슷해요)
                            </span>
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => applyInbox(item, `member:${item.suggest.id}`, applyToAllMatching)}
                              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#111827', color: '#fff', fontSize: 12, fontWeight: 800, cursor: isAdmin ? 'pointer' : 'default' }}
                            >
                              ✓ 이걸로 연결
                            </button>
                          </div>
                        )}

                        <div className="after-party-inbox-actions">
                          <select
                            className="after-party-group-select"
                            value={inboxSelectValue}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const val = e.target.value;
                              setInboxSelectValue('');
                              if (val) applyInbox(item, val, applyToAllMatching);
                            }}
                            style={{ maxWidth: 220 }}
                          >
                            <option value="">다른 그룹 선택…</option>
                            <optgroup label="공연자 초대">
                              {performerOptions.map(m => <option key={m.id} value={`member:${m.id}`}>🎤 {m.name}{performerSuffix(m)}</option>)}
                            </optgroup>
                            <optgroup label="직접 만든 그룹">
                              {groupOptionLabels.map(l => <option key={l} value={`group:${l}`}>🏷 {l}</option>)}
                              <option value="__new">➕ 새 그룹 만들기…</option>
                            </optgroup>
                          </select>
                          <button
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => applyInbox(item, 'unassigned', applyToAllMatching)}
                            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d4d4d8', background: '#fff', color: '#3f3f46', fontSize: 12, fontWeight: 700, cursor: isAdmin ? 'pointer' : 'default' }}
                          >
                            초대자 없음으로 두기
                          </button>
                          {sameTextCount > 1 && (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#71717a', cursor: 'pointer', marginLeft: 'auto' }}>
                              <input
                                type="checkbox"
                                checked={applyToAllMatching}
                                onChange={e => setApplyToAllMatching(e.target.checked)}
                              />
                              같은 초대자 텍스트("{item.originalInviterName}") {sameTextCount}건 모두 적용
                            </label>
                          )}
                        </div>

                        <div className="after-party-inbox-nav">
                          <button
                            type="button"
                            disabled={currentIdx === 0}
                            onClick={() => setInboxIndex(Math.max(0, currentIdx - 1))}
                            style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', fontSize: 11, fontWeight: 700, cursor: currentIdx === 0 ? 'not-allowed' : 'pointer' }}
                          >
                            ◀ 이전
                          </button>
                          <span>{currentIdx + 1} / {inboxItems.length}</span>
                          <button
                            type="button"
                            disabled={currentIdx >= inboxItems.length - 1}
                            onClick={() => setInboxIndex(Math.min(inboxItems.length - 1, currentIdx + 1))}
                            style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', fontSize: 11, fontWeight: 700, cursor: currentIdx >= inboxItems.length - 1 ? 'not-allowed' : 'pointer' }}
                          >
                            다음 ▶
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 2. 그룹 카드 그리드 */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px' }}>
                    <strong style={{ fontSize: 15, color: '#18181b' }}>그룹 {afterPartyGroupsList.length}개</strong>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={async () => {
                          const label = String(window.prompt('새 그룹 이름을 입력하세요') || '').trim();
                          if (!label) return;
                          if (groupOptionLabels.includes(label)) {
                            setSelectedGroupId(`group:${label}`);
                            return;
                          }
                          setSelectedGroupId(`group:${label}`);
                          showAfterPartyToast(`"${label}" 그룹이 생성되었습니다. 구성원을 추가해 주세요.`);
                        }}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d4d4d8', background: '#fff', color: '#18181b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        + 새 그룹 만들기
                      </button>
                    )}
                  </div>
                  <div className="after-party-group-grid">
                    {afterPartyGroupsList.map(g => {
                      const isSel = selectedGroupId === g.id;
                      const icon = g.kind === 'perf' ? '🎤' : '🏷';
                      return (
                        <div
                          key={g.id}
                          className={`after-party-gcard ${isSel ? 'is-selected' : ''}`}
                          onClick={() => setSelectedGroupId(isSel ? null : g.id)}
                        >
                          <div className="after-party-gcard-name">{icon} {g.name}</div>
                          <div className="after-party-gcard-meta">{g.totalCount}명 · {g.sub}</div>
                          <div className="after-party-gcard-meta" style={{ fontSize: 11, color: '#a1a1aa' }}>예매 {g.orderCount}건 · 공연자 {g.directCount}명</div>
                          <div className="after-party-gcard-note">{g.kind === 'perf' ? '공연자 실적 포함' : '공연자 실적 제외'}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: '#71717a', marginTop: 8 }}>
                    🏷 그룹은 공연자 실적에 포함되지 않아요.
                  </div>
                </div>

                {/* 3. 구성원 패널 (선택된 그룹) */}
                {(() => {
                  if (!selectedGroupId) return null;
                  const g = afterPartyGroupsList.find(x => x.id === selectedGroupId) || {
                    id: selectedGroupId,
                    kind: selectedGroupId.startsWith('group:') ? 'group' : 'perf',
                    name: selectedGroupId.replace(/^(group:|member:)/, ''),
                    totalCount: 0,
                    orders: [],
                    performers: [],
                  };
                  return (
                    <div className="after-party-members-panel">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingBottom: 8, borderBottom: '1px solid #f4f4f5' }}>
                        <div>
                          <strong style={{ fontSize: 15, color: '#18181b' }}>{g.kind === 'perf' ? '🎤' : '🏷'} {g.name} · {g.totalCount}명</strong>
                          <span style={{ fontSize: 12, color: '#71717a', marginLeft: 8 }}>구성원 관리</span>
                        </div>
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            {g.kind === 'group' && (
                              <button
                                type="button"
                                onClick={() => handleRenameGroup(g.name)}
                                style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #d4d4d8', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                이름 바꾸기
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDisbandGroup(g)}
                              style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                              그룹 해제
                            </button>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'grid', gap: 2 }}>
                        {g.orders.map(o => (
                          <div key={o.id} className="after-party-mrow">
                            <span>
                              <strong>{o.audienceName || '(이름없음)'}</strong>
                              <span style={{ color: '#71717a', marginLeft: 6, fontSize: 12 }}>({effectiveAfterPartyCount(o)}명)</span>
                              {o.phone && <span style={{ color: '#a1a1aa', marginLeft: 6, fontSize: 11 }}>· {o.phone}</span>}
                            </span>
                            {isAdmin && (
                              <button type="button" className="after-party-mini-btn" onClick={() => handleRemoveOrderFromGroup(o)}>
                                빼기
                              </button>
                            )}
                          </div>
                        ))}
                        {g.performers.map(m => (
                          <div key={m.id} className="after-party-mrow">
                            <span>
                              <strong>{m.name}</strong>
                              <span style={{ color: '#2563eb', marginLeft: 6, fontSize: 12, fontWeight: 700 }}>🎤 공연자 본인 (1명)</span>
                            </span>
                            {isAdmin && (
                              <button type="button" className="after-party-mini-btn" onClick={() => handleRemovePerformerFromGroup(m.id, m.name)}>
                                빼기
                              </button>
                            )}
                          </div>
                        ))}
                        {g.orders.length === 0 && g.performers.length === 0 && (
                          <div style={{ color: '#a1a1aa', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
                            아직 이 그룹에 소속된 참석자가 없습니다. 아래 버튼으로 참석자나 공연자를 추가하세요.
                          </div>
                        )}
                      </div>

                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px dashed #e4e4e7', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <select
                              className="after-party-group-select"
                              value={addAttendeeSelectValue}
                              onChange={async (e) => {
                                const orderId = e.target.value;
                                setAddAttendeeSelectValue('');
                                if (!orderId) return;
                                const o = ordersById[orderId];
                                if (!o) return;
                                const val = g.kind === 'perf' ? `member:${g.memberId}` : `group:${g.name}`;
                                await changeOrderGroup(o, val);
                              }}
                              style={{ maxWidth: 220 }}
                            >
                              <option value="">+ 참석자 추가 (미분류 건)…</option>
                              {afterPartyAttendeeRows.filter(r => r.kind === 'order' && (r.type === 'unmapped' || r.type === 'unassigned')).map(r => (
                                <option key={r.orderId} value={r.orderId}>
                                  {r.name} ({r.count}명) {r.originalInviterName ? `[${r.originalInviterName}]` : '[초대자 없음]'}
                                </option>
                              ))}
                            </select>
                          </div>

                          {g.kind === 'group' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <select
                                className="after-party-group-select"
                                value={addPerformerSelectValue}
                                onChange={async (e) => {
                                  const memberId = e.target.value;
                                  setAddPerformerSelectValue('');
                                  if (!memberId) return;
                                  await setPerformerGroup(memberId, g.name);
                                  showAfterPartyToast(`공연자 → "${g.name}" 그룹에 배정됨`);
                                }}
                                style={{ maxWidth: 220 }}
                              >
                                <option value="">+ 공연자 추가…</option>
                                {afterPartyPerformerIds.filter(id => !g.performers.some(p => p.id === id)).map(id => {
                                  const m = members.find(x => x.id === id) || bandMembers[id] || { id, name: id, part: '' };
                                  return <option key={id} value={id}>{m.name}{m.part ? ` (${m.part})` : ''}</option>;
                                })}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {afterPartyTab === 'tables' && (
              <div className="after-party-seating-view" style={{ display: 'grid', gap: 16 }}>
                {!currentShow ? (
                  <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>공연을 선택해야 테이블 배치를 관리할 수 있습니다.</div>
                ) : (
                  <>
                    <div className="after-party-seating-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                      <StatCard label="배치 완료" value={`${seatingOverview.totalPlaced}명`} color="#059669" />
                      <StatCard label="미배치" value={`${seatingOverview.totalUnassigned}명`} color="#b45309" />
                      <StatCard label="테이블" value={`${seatingOverview.tableCount}개`} color="#111827" />
                      <StatCard label="정원 초과 테이블" value={`${seatingOverview.overCapacityCount}개`} color="#dc2626" />
                    </div>
                    <div className="after-party-seating-note" style={{ fontSize: 11, color: '#64748b' }}>전체 {seatingOverview.totalAll}명 · 공연자 좌석 {seatingOverview.performerCountPlaced}명 포함 · 예매 인원과 별도로 정원에 반영됩니다.</div>

                    <div className="after-party-view-toggle" role="group" aria-label="좌석 배치 보기 방식" style={{ justifySelf: 'start' }}>
                      <button type="button" className={seatingView === 'sheet' ? 'is-active' : ''} aria-pressed={seatingView === 'sheet'} onClick={() => setSeatingView('sheet')}>표 보기</button>
                      <button type="button" className={seatingView === 'map' ? 'is-active' : ''} aria-pressed={seatingView === 'map'} onClick={() => setSeatingView('map')}>배치도 보기</button>
                    </div>

                    {isAdmin && (
                      <div className="after-party-seating-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" onClick={addTable}
                          style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#111827', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                        >+ 테이블 추가</button>
                        <button type="button" onClick={() => autoAssignTables()}
                          disabled={performerAutoCandidateCount === 0 || isAutoAssigning}
                          title="1순위 공연자 매핑의 예매자만 공연자 ID에 연결된 테이블로 배치합니다. 자동 배치는 갱신하고 수동 배정은 보존합니다. 그룹 확인이 필요한 참여자는 배치하지 않습니다."
                          style={{
                            padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700,
                            cursor: performerAutoCandidateCount === 0 || isAutoAssigning ? 'not-allowed' : 'pointer',
                            opacity: performerAutoCandidateCount === 0 || isAutoAssigning ? 0.5 : 1
                          }}
                        >{isAutoAssigning ? '배치 저장 중…' : '공연자 기준 자동 배치'}</button>
                        {seatingActionStatus && <div role="status" style={{ flexBasis: '100%', padding: '8px 10px', borderRadius: 8, background: seatingActionStatus.startsWith('배치 완료') ? '#ecfdf5' : '#fff7ed', color: seatingActionStatus.startsWith('배치 완료') ? '#047857' : '#9a3412', fontSize: 12, fontWeight: 700 }}>{seatingActionStatus}</div>}
                        <span style={{ flexBasis: '100%', fontSize: 11, color: performerAutoCandidateCount ? '#64748b' : '#b45309' }}>
                          {performerAutoCandidateCount ? `공연자 ID로 매핑된 참여자 그룹 ${performerAutoCandidateCount}개를 처리합니다. 수동 예매자 배정은 보존됩니다.` : '자동 배치 대상이 없습니다. 뒤풀이 참여 여부와 공연자 초대 연결을 먼저 확인하세요.'}
                        </span>
                        <button type="button" onClick={resetAllSeating}
                          disabled={Object.keys(seatAssignments).length === 0 && Object.keys(participantSeatAssignments).length === 0 && Object.keys(performerSeatAssignments).length === 0}
                          style={{
                            padding: '8px 14px', borderRadius: 10, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 700,
                            cursor: Object.keys(seatAssignments).length === 0 && Object.keys(participantSeatAssignments).length === 0 && Object.keys(performerSeatAssignments).length === 0 ? 'not-allowed' : 'pointer',
                            opacity: Object.keys(seatAssignments).length === 0 && Object.keys(participantSeatAssignments).length === 0 && Object.keys(performerSeatAssignments).length === 0 ? 0.5 : 1
                          }}
                        >배치 초기화</button>
                        <button type="button" onClick={removeAllTables}
                          disabled={afterPartyTables.length === 0}
                          title="테이블과 좌석 배정을 전부 지우고 처음부터 다시 그립니다"
                          style={{
                            padding: '8px 14px', borderRadius: 10, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 700,
                            cursor: afterPartyTables.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: afterPartyTables.length === 0 ? 0.5 : 1
                          }}
                        >테이블 전체 삭제</button>
                      </div>
                    )}

                    {/* ── 표 보기: 구글 시트처럼 테이블 단위로 인원을 넣고 뺀다. 배치도와 같은 데이터를 본다. ── */}
                    {seatingView === 'sheet' && (() => {
                      const chipBase = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 16, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 700, color: '#1e293b' };
                      const perfChip = { ...chipBase, border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#047857' };
                      const chipX = { border: 'none', background: 'none', color: '#dc2626', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 };
                      const cellInput = { padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, background: '#fff', minWidth: 0 };
                      const placedPerformerIds = new Set(seatingOverview.tables.flatMap(entry => entry.performers.map(m => m.id)));
                      const unplacedPerformers = afterPartyPerformerIds.filter(id => !placedPerformerIds.has(id)).map(id => findPerformer(id) || { id, name: id, part: '' });
                      const poolOrders = seatingOverview.unassigned;
                      const poolTotal = poolOrders.reduce((s, p) => s + p.count, 0) + unplacedPerformers.length;
                      const placedTotal = seatingOverview.tables.reduce((s, entry) => s + entry.count, 0);
                      return (
                        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
                          <div style={{ padding: '12px 14px', border: '1.5px dashed #cbd5e1', borderRadius: 12, background: '#f8fafc' }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: poolTotal ? '#b45309' : '#047857', marginBottom: poolTotal ? 8 : 0 }}>
                              {poolTotal ? `미배치 ${poolTotal}명 — 각 테이블의 "+ 추가"를 눌러 배치하세요` : '✅ 모두 배치됐어요'}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {unplacedPerformers.map(m => <span key={m.id} style={perfChip}>🎤 {m.name}</span>)}
                              {poolOrders.map(p => <span key={p.orderId} style={chipBase}>{p.name}{p.count > 1 ? ` (${p.count}명)` : ''}</span>)}
                            </div>
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table className="after-party-participant-table" style={{ minWidth: 660 }}>
                              <thead><tr><th>테이블</th><th>대표 <span style={{ fontWeight: 500 }}>(정산용)</span></th><th>정원</th><th>배치 인원</th><th style={{ textAlign: 'right' }}>인원</th><th></th></tr></thead>
                              <tbody>
                                {seatingOverview.tables.length === 0 && (
                                  <tr><td colSpan={6} className="after-party-empty-row">아직 테이블이 없습니다. '+ 테이블 추가'를 눌러 시작하세요.</td></tr>
                                )}
                                {seatingOverview.tables.map(entry => {
                                  const table = entry.table;
                                  const memberNames = [...entry.performers.map(m => m.name), ...entry.participants.map(p => p.name)];
                                  const over = entry.count > table.capacity;
                                  return (
                                    <tr key={table.id} style={{ cursor: 'default' }}>
                                      <td>
                                        <input type="text" disabled={!isAdmin} aria-label="테이블 이름" key={`nm:${table.id}:${table.name}`} defaultValue={table.name}
                                          onBlur={e => { const v = e.target.value.trim(); if (v && v !== table.name) renameTable(table.id, v); }}
                                          style={{ ...cellInput, width: 110, fontWeight: 800 }} />
                                      </td>
                                      <td>
                                        <select disabled={!isAdmin} aria-label="테이블 대표" value={table.repName || ''} onChange={e => setTableRep(table.id, e.target.value)} style={{ ...cellInput, maxWidth: 120 }}>
                                          <option value="">대표 선택</option>
                                          {memberNames.map(n => <option key={n} value={n}>{n}</option>)}
                                          {table.repName && !memberNames.includes(table.repName) && <option value={table.repName}>{table.repName}</option>}
                                        </select>
                                      </td>
                                      <td>
                                        <input type="number" min="0" disabled={!isAdmin} aria-label="정원" key={`cap:${table.id}:${table.capacity}`} defaultValue={table.capacity}
                                          onBlur={e => setTableCapacity(table.id, e.target.value)}
                                          style={{ ...cellInput, width: 56, textAlign: 'right' }} />
                                      </td>
                                      <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minWidth: 220 }}>
                                          {entry.performers.map(m => (
                                            <span key={m.id} style={perfChip}>🎤 {m.name}
                                              {isAdmin && <button type="button" aria-label={`${m.name} 빼기`} style={chipX} onClick={() => unassignPerformerFromTables(m.id)}>✕</button>}
                                            </span>
                                          ))}
                                          {entry.participants.map(p => (
                                            <span key={p.orderId} style={chipBase}>{p.name}{p.count > 1 ? ` (${p.count}명)` : ''}
                                              {isAdmin && <button type="button" aria-label={`${p.name} 빼기`} style={chipX} onClick={() => assignToTable([p.orderId], null)}>✕</button>}
                                            </span>
                                          ))}
                                          {isAdmin && (
                                            <span style={{ position: 'relative', display: 'inline-block' }}>
                                              <button type="button" onClick={() => setSheetAddTableId(prev => (prev === table.id ? null : table.id))}
                                                style={{ padding: '5px 10px', borderRadius: 16, border: '1.5px dashed #cbd5e1', background: 'transparent', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ 추가</button>
                                              {sheetAddTableId === table.id && (
                                                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 40, width: 220, maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, boxShadow: '0 10px 26px rgba(15,23,42,.16)', padding: 6 }}>
                                                  {unplacedPerformers.map(m => (
                                                    <button key={m.id} type="button" onClick={() => { assignPerformerToTable(m.id, table.id); setSheetAddTableId(null); }}
                                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', background: 'none', fontSize: 12, fontWeight: 700, color: '#047857', cursor: 'pointer', borderRadius: 7 }}>🎤 {m.name}</button>
                                                  ))}
                                                  {poolOrders.map(p => (
                                                    <button key={p.orderId} type="button" onClick={() => { assignToTable([p.orderId], table.id); setSheetAddTableId(null); }}
                                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', background: 'none', fontSize: 12, fontWeight: 700, color: '#1e293b', cursor: 'pointer', borderRadius: 7 }}>{p.name}{p.count > 1 ? ` (${p.count}명)` : ''}</button>
                                                  ))}
                                                  {poolTotal === 0 && <div style={{ fontSize: 12, color: '#94a3b8', padding: '7px 9px' }}>미배치 인원이 없습니다</div>}
                                                </div>
                                              )}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: over ? '#dc2626' : entry.count === table.capacity ? '#047857' : '#111827', whiteSpace: 'nowrap' }}>{entry.count}/{table.capacity}</span>
                                        {over && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>정원 초과</div>}
                                      </td>
                                      <td>
                                        {isAdmin && <button type="button" onClick={() => removeTable(table.id)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>삭제</button>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              {seatingOverview.tables.length > 0 && (
                                <tfoot>
                                  <tr>
                                    <td style={{ fontWeight: 800 }}>합계 {seatingOverview.tableCount}개</td>
                                    <td></td>
                                    <td style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>정원 {afterPartyTables.reduce((s, t) => s + (Number(t.capacity) || 0), 0)}명</td>
                                    <td></td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{placedTotal}명 배치</td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>
                      );
                    })()}

                    {seatingView === 'map' && (<>
                    {isAdmin && (
                      <div className="after-party-seat-picker" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, border: '1px solid #c7d2fe', background: '#f5f6ff' }}>
                        <label htmlFor="seat-attendee-picker" style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>좌석에 배정할 대상</label>
                        <select id="seat-attendee-picker" value={seatAssignmentSelection} onChange={event => setSeatAssignmentSelection(event.target.value)} style={{ flex: '1 1 220px', minWidth: 0, maxWidth: 420, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', fontSize: 12 }}>
                          <option value="">참여자 또는 공연자를 선택하세요</option>
                          {afterPartyParticipants.flatMap(person => Array.from({ length: person.count }, (_, attendeeIndex) => ({ person, attendeeIndex }))).map(({ person, attendeeIndex }) => {
                            const attendeeKey = `${person.orderId}:${attendeeIndex}`;
                            const assignedTableId = seatingOverview.attendeeTableByKey.get(attendeeKey);
                            const assignedTable = seatingOverview.tables.find(item => item.table.id === assignedTableId)?.table;
                            const label = person.count > 1 ? `${person.name} · ${attendeeIndex + 1}번` : person.name;
                            return <option key={attendeeKey} value={JSON.stringify({ type: 'attendee', orderId: person.orderId, attendeeIndex })}>{label} · {assignedTable ? `${assignedTable.name} 배정` : '미배치'}</option>;
                          })}
                          {afterPartyPerformerIds.length > 0 && (
                            <optgroup label="공연 참가자 (뒤풀이 참석)">
                              {afterPartyPerformerIds.map(memberId => {
                                const member = members.find(m => m.id === memberId) || bandMembers[memberId] || { id: memberId, name: memberId };
                                const assignedSeatId = Object.entries(performerSeatAssignments).find(([, id]) => id === memberId)?.[0];
                                const assignedTable = assignedSeatId && seatingOverview.tables.find(item => item.table.seats.some(seat => seat.id === assignedSeatId))?.table;
                                return <option key={`performer-${memberId}`} value={JSON.stringify({ type: 'performer', memberId })}>{member.name} (공연자) · {assignedTable ? `${assignedTable.name} 배정` : '미배치'}</option>;
                              })}
                            </optgroup>
                          )}
                          <optgroup label="전체 회원 (기타)">
                            {members.filter(m => !afterPartyPerformerIds.includes(m.id)).map(member => {
                              const assignedSeatId = Object.entries(performerSeatAssignments).find(([, memberId]) => memberId === member.id)?.[0];
                              const assignedTable = assignedSeatId && seatingOverview.tables.find(item => item.table.seats.some(seat => seat.id === assignedSeatId))?.table;
                              return <option key={`performer-${member.id}`} value={JSON.stringify({ type: 'performer', memberId: member.id })}>{member.name} · {assignedTable ? `${assignedTable.name} 배정` : '미배치'}</option>;
                            })}
                          </optgroup>
                        </select>
                        <button type="button" disabled={!seatAssignmentSelection} onClick={unassignSelectedAttendee} style={{ padding: '8px 10px', border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', fontSize: 12, fontWeight: 700, cursor: seatAssignmentSelection ? 'pointer' : 'not-allowed', opacity: seatAssignmentSelection ? 1 : 0.5 }}>선택 좌석 배정 해제</button>
                        <span style={{ flexBasis: '100%', fontSize: 11, color: '#64748b' }}>참여자를 고른 뒤 도면의 빈 좌석을 클릭하세요. 배정된 좌석을 클릭하면 해당 참여자를 선택해 이동할 수 있습니다.</span>
                      </div>
                    )}

                    {/* 공간 배치도 — 테이블을 위에서 내려다본 평면도. 고정 가상 좌표계라 화면 크기가
                         달라져도 테이블 간 상대 위치는 항상 같다. 모바일에서는 이 캔버스 영역만
                         가로로 스크롤되며, 페이지 전체에는 가로 스크롤이 생기지 않는다. */}
                    <div className="after-party-seating-workspace">
                      <div className="after-party-floor-column">
                          <div data-testid="table-canvas-viewport" style={{ width: '100%', overflow: 'auto', maxHeight: 'min(70vh, 760px)', WebkitOverflowScrolling: 'touch', border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, boxSizing: 'border-box' }}>
                      <div
                                data-testid="table-canvas"
                        onClick={(e) => { if (e.target === e.currentTarget) setSelectedTableId(null); }}
                        style={{
                                  position: 'relative', width: tableCanvasSize.width, height: tableCanvasSize.height, minWidth: TABLE_CANVAS_WIDTH,
                          background: '#fbfbfe',
                          backgroundImage: 'linear-gradient(#eef0f5 1px, transparent 1px), linear-gradient(90deg, #eef0f5 1px, transparent 1px)',
                          backgroundSize: '20px 20px'
                        }}
                      >
                        {afterPartyTables.length === 0 && (
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            아직 테이블이 없습니다. ‘테이블 추가’를 눌러 배치를 시작하세요.
                          </div>
                        )}
                        {afterPartyTables.map((table) => {
                          const displayTable = tableDisplayLayouts.get(table.id) || table;
                          const isDraggingThis = !!(dragInfo && dragInfo.tableId === table.id);
                          const geom = isDraggingThis ? { ...displayTable, x: dragInfo.x, y: dragInfo.y } : displayTable;
                          const isOverlapping = isDraggingThis && afterPartyTables.some(other => {
                            if (other.id === table.id) return false;
                            const otherLayout = tableDisplayLayouts.get(other.id) || other;
                            return tablesOverlap(geom, otherLayout);
                          });
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
                          const seatChipMaxWidth = 180;
                          const seatPosition = seat => ({
                            x: geom.x + geom.width / 2 + (seat.x * TABLE_CANVAS_WIDTH - (table.x + table.width / 2)) * geom.width / table.width,
                            y: geom.y + geom.height / 2 + (seat.y * TABLE_CANVAS_HEIGHT - (table.y + table.height / 2)) * geom.height / table.height,
                          });
                          seats.forEach((seat) => {
                            const point = seatPosition(seat);
                            const chair = seatDragInfo?.seatId === seat.id
                              ? { ...seat, x: seatDragInfo.x / TABLE_CANVAS_WIDTH, y: seatDragInfo.y / TABLE_CANVAS_HEIGHT }
                              : { ...seat, x: point.x / TABLE_CANVAS_WIDTH, y: point.y / TABLE_CANVAS_HEIGHT };
                            const assigned = participantSeatAssignments[seat.id] || legacySeatOccupants[seat.id];
                            const person = assigned && afterPartyParticipants.find(p => p.orderId === assigned.orderId);
                            const rawPerformerId = performerSeatAssignments[seat.id];
                            const performerId = canonicalPerformerSeatByMember[rawPerformerId] === seat.id ? rawPerformerId : null;
                            const performer = performerId && members.find(member => member.id === performerId);
                            const occupantName = performer?.name || person?.name;
                            const occupied = Boolean(person || performer);
                            const sx = chair.x * TABLE_CANVAS_WIDTH;
                            const sy = chair.y * TABLE_CANVAS_HEIGHT;
                            const seatWidth = name => name ? Math.min(seatChipMaxWidth, Math.max(40, Array.from(name).length * 12 + 24)) : 22;
                            const seatHeight = name => name ? Math.max(32, Math.ceil((Array.from(name).length * 12 + 4) / seatWidth(name)) * 14 + 10) : 22;
                            const currentSeatWidth = seatWidth(occupantName);
                            const currentSeatHeight = seatHeight(occupantName);
                            const overlapsSeat = seats.some(other => {
                              if (other.id === seat.id) return false;
                              const otherAssignment = participantSeatAssignments[other.id] || legacySeatOccupants[other.id];
                              const otherPerson = otherAssignment && afterPartyParticipants.find(item => item.orderId === otherAssignment.orderId);
                              const otherPerformerId = performerSeatAssignments[other.id];
                              const otherPerformer = canonicalPerformerSeatByMember[otherPerformerId] === other.id && members.find(member => member.id === otherPerformerId);
                              const otherName = otherPerformer?.name || otherPerson?.name;
                              const otherPoint = seatPosition(other);
                              return Math.abs(otherPoint.x - sx) < (currentSeatWidth + seatWidth(otherName)) / 2
                                && Math.abs(otherPoint.y - sy) < (currentSeatHeight + seatHeight(otherName)) / 2;
                            });
                            seatNodes.push(<button key={seat.id} data-seat-id={seat.id} data-table-id={table.id} type="button" title={occupantName || '빈 좌석 · 선택 대상 배정'} aria-label={occupantName || '빈 좌석'} onClick={event => {
                              event.stopPropagation();
                              if (seatDragMovedRef.current) {
                                seatDragMovedRef.current = false;
                                return;
                              }
                              if (!isAdmin) return;
                              if (seatAssignmentSelection) assignSelectedAttendeeToSeat(seat.id, table.id);
                              else if (performer) setSeatAssignmentSelection(JSON.stringify({ type: 'performer', memberId: performer.id }));
                              else if (person) setSeatAssignmentSelection(JSON.stringify({ type: 'attendee', orderId: assigned.orderId, attendeeIndex: assigned.attendeeIndex }));
                            }} onPointerDown={e => {
                              if (!isAdmin) return;
                              e.stopPropagation();
                              seatDragMovedRef.current = false;
                              e.currentTarget.setPointerCapture(e.pointerId);
                              setSelectedTableId(table.id);
                              setSeatDragInfo({ seatId: seat.id, tableId: table.id, startX: sx, startY: sy, clientX: e.clientX, clientY: e.clientY, x: sx, y: sy });
                            }} onPointerMove={e => {
                              const canvasRect = e.currentTarget?.parentElement?.parentElement?.getBoundingClientRect();
                              if (!canvasRect?.width || !canvasRect?.height) return;
                              const clientX = e.clientX;
                              const clientY = e.clientY;
                              setSeatDragInfo(prev => {
                                if (!prev || prev.seatId !== seat.id) return prev;
                                const scaleX = canvasRect.width / tableCanvasSize.width;
                                const scaleY = canvasRect.height / tableCanvasSize.height;
                                const x = Math.max(12, Math.min(tableCanvasSize.width - 12, prev.startX + (clientX - prev.clientX) / scaleX));
                                const y = Math.max(12, Math.min(tableCanvasSize.height - 12, prev.startY + (clientY - prev.clientY) / scaleY));
                                if (Math.hypot(x - prev.startX, y - prev.startY) > 3) seatDragMovedRef.current = true;
                                return { ...prev, x, y };
                              });
                            }} onPointerUp={() => {
                              const moved = seatDragMovedRef.current;
                              if (moved && seatDragInfo?.seatId === seat.id) moveChair(table.id, seat.id, seatDragInfo.x, seatDragInfo.y);
                              setSeatDragInfo(null);
                            }} style={{ position: 'absolute', left: sx, top: sy, transform: 'translate(-50%, -50%)', width: occupied ? seatWidth(occupantName) : 22, maxWidth: 220, minHeight: occupied ? 32 : 22, height: occupied ? 'auto' : 22, boxSizing: 'border-box', padding: occupied ? '5px 10px' : 0, borderRadius: occupied ? 16 : '50%', background: performer ? '#ecfdf5' : (person ? '#111827' : '#fff'), border: overlapsSeat ? '2px solid #ef4444' : (performer ? '2px solid #059669' : (person ? '1.5px solid #111827' : '2px dashed #64748b')), boxShadow: '0 1px 4px rgba(0,0,0,.2)', zIndex: 4, cursor: isAdmin ? 'grab' : 'default', touchAction: 'none', userSelect: 'none', overflow: 'visible', whiteSpace: occupied ? 'normal' : 'nowrap', overflowWrap: 'anywhere', lineHeight: 1.15, fontSize: 12, fontWeight: 800, color: performer ? '#047857' : (person ? '#fff' : '#64748b') }}>{occupantName || (seatAssignmentSelection ? '+' : '')}</button>);
                          });

                          return (
                            <div key={table.id} data-table-card-id={table.id}>
                              {seatNodes}
                              <div
                                onPointerDown={(e) => {
                                  if (!isAdmin) return;
                                  e.currentTarget.setPointerCapture(e.pointerId);
                                  setSelectedTableId(table.id);
                                  setDragInfo({ tableId: table.id, startClientX: e.clientX, startClientY: e.clientY, startX: displayTable.x, startY: displayTable.y, x: displayTable.x, y: displayTable.y });
                                }}
                                onPointerMove={(e) => {
                                  setDragInfo(prev => {
                                    if (!prev || prev.tableId !== table.id) return prev;
                                    const dx = e.clientX - prev.startClientX;
                                    const dy = e.clientY - prev.startClientY;
                                    const clamped = clampTablePosition(prev.startX + dx, prev.startY + dy, displayTable.width, displayTable.height);
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
                                  position: 'absolute', left: geom.x, top: geom.y, width: displayTable.width, height: displayTable.height,
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
                                <div title={linkedPerformer?.name || '연결 없음'} style={{ fontSize: 10, fontWeight: 700, color: linkedPerformer ? '#047857' : '#94a3b8', maxWidth: '100%', padding: '0 5px', textAlign: 'center', overflowWrap: 'anywhere' }}>{linkedPerformer ? `연결 · ${linkedPerformer.name}` : '연결 없음'}</div>
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
                        <div className="after-party-table-inspector" style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', borderRadius: 14, border: '1.5px solid #c7d2fe', background: '#f5f6ff', padding: '14px 16px' }}>
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
                                  <select id={`performer-table-link-${table.id}`} value={performerSelectionByTable[table.id] ?? table.performerId ?? ''} onChange={event => setPerformerSelectionByTable(previous => ({ ...previous, [table.id]: event.target.value }))} style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12 }}>
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
                                  const performerId = performerSeatAssignments[seat.id];
                                  const performer = canonicalPerformerSeatByMember[performerId] === seat.id && members.find(member => member.id === performerId);
                                  const attendee = assigned && afterPartyParticipants.find(person => person.orderId === assigned.orderId);
                                  const occupant = performer ? `${performer.name} · 공연자` : attendee ? `${attendee.name}${attendee.count > 1 ? ` · ${assigned.attendeeIndex + 1}번` : ''}` : '빈 좌석';
                                  return <div key={seat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    <span style={{ width: 50, flexShrink: 0, fontSize: 11, color: '#64748b' }}>좌석 {seatIndex + 1}</span>
                                    <span title={occupant} style={{ flex: 1, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', fontSize: 12, fontWeight: 700, color: performer ? '#047857' : attendee ? '#1e293b' : '#94a3b8' }}>{occupant}</span>
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

                      </div>
                      <aside className="after-party-unassigned-column">
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
                    <div className="after-party-unassigned-list">
                      <div className="after-party-unassigned-heading">
                        미배치 참여자 <span>{seatingOverview.unassigned.length}건 · {seatingOverview.totalUnassigned}명</span>
                      </div>
                      {seatingOverview.unassigned.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>모든 참여자가 배치되었습니다.</div>
                      ) : (
                        <div className="after-party-unassigned-items" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
                      </aside>
                    </div>
                    </>)}
                  </>
                )}
              </div>
            )}

            {afterPartyToast && (
              <div className="after-party-toast" role="status" aria-live="polite">
                <span>{afterPartyToast.message}</span>
                {afterPartyToast.undo && <button type="button" onClick={undoAfterPartyToast}>실행 취소</button>}
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
