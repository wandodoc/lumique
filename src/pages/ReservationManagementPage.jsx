import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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


  // 뒤풀이 관리 섹션 — 탭/정리함/토스트 상태
  const [mappingErrorMsg, setMappingErrorMsg] = useState('');
  const [afterPartyTab, setAfterPartyTab] = useState('groups'); // 'groups' | 'tables'
  const [afterPartyToast, setAfterPartyToast] = useState(null);
  const afterPartyToastTimer = useRef(null);
  const [isPerformerPanelOpen, setIsPerformerPanelOpen] = useState(false);
  const [inboxIndex, setInboxIndex] = useState(0);
  const [applyToAllMatching, setApplyToAllMatching] = useState(true);
  const [inboxSelectValue, setInboxSelectValue] = useState('');
  const [cellEdit, setCellEdit] = useState(null); // 셀 입력: { teamId, query }
  const [teamDragId, setTeamDragId] = useState(null); // 격자에서 드래그 중인 팀(그룹) id
  const [menuHover, setMenuHover] = useState(null); // 셀 입력 메뉴: 마우스가 올라간 "다른 팀" 인원 (원래 자리 하이라이트용)
  const [unitDrag, setUnitDrag] = useState(null); // 팀 안에서 드래그 중인 사람 셀 { teamId, key }
  const [cellInfo, setCellInfo] = useState(null); // 이름 클릭 시 정보 팝오버 { teamId, key, anchor }
  const [foldedSections, setFoldedSections] = useState({}); // 긴 페이지 대응: 섹션 접기 { orders, settlement, afterparty }
  const toggleFold = (key) => setFoldedSections(prev => ({ ...prev, [key]: !prev[key] }));

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
    // 팀/좌석은 그룹에서 파생되므로 연결 변경 시 집계가 자동으로 따라온다 (별도 좌석 정리 불필요).
    await patchCurrentShow({ afterPartyPerformerOrderIds: next });
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

  // ── 뒤풀이 테이블 배치 — 공연자 매핑과는 완전히 독립된 데이터(콘서트 레코드에 저장) ──
  // tables: [{ id, name, capacity, shape, x, y, width, height, rotation }], seatAssignments: { [orderId]: tableId }
  const afterPartyTables = useMemo(
    () => (Array.isArray(currentShow?.tables) ? currentShow.tables : []),
    [currentShow]
  );

  // 콘서트 레코드에 테이블/배치 패치를 저장한다. 서버 최신 목록을 읽어 해당 공연 1건에만 병합하므로
  // 오래 열어 둔 탭의 옛 목록이 다른 기기의 저장을 덮어쓰지 않는다. 실패 시 화면에도 반영하지 않고 오류를 알린다.
  const saveSeatingPatchNow = useCallback(async (patch) => {
    if (!isAdmin || dataLoadFailed || !currentShow || !concertId) return false;
    setMappingErrorMsg('');
    try {
      // Firestore가 오프라인 상태로 판단하면 쓰기가 완료도 실패도 없이 무한정 걸린다.
      // 이 저장은 순차 대기열이라 하나가 걸리면 이후 저장까지 전부 막히므로 15초 제한을 둔다.
      const list = await Promise.race([
        firebaseStorage.patchShow(currentShow.id, patch),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 15000)),
      ]);
      if (list === 'timeout') {
        setMappingErrorMsg('저장 응답이 없어 중단했습니다. 네트워크를 확인하고 새로고침한 뒤 배치가 저장됐는지 확인해 주세요.');
        return false;
      }
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

  // ── 팀(=그룹) 좌석 배치: tables 레코드는 그룹별 정원·격자 위치만 저장한다(groupKey로 그룹과 연결).
  // 과거 배치도의 좌표·좌석 데이터는 지우지 않고 그대로 보존한다. ──
  const upsertGroupTables = (upserts) => {
    const tables = [...afterPartyTables];
    upserts.forEach(({ groupId, name, patch }) => {
      const idx = tables.findIndex(t => t.groupKey === groupId);
      if (idx >= 0) tables[idx] = { ...tables[idx], ...patch };
      else tables.push({ id: `table-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, capacity: Math.max(1, Math.floor(Number(currentShow?.afterPartyTableSize)) || 6), groupKey: groupId, ...patch });
    });
    return saveSeatingPatch({ tables });
  };

  // 직접 만든 그룹(=팀) 이름 변경: 소속 예매·공연자 매핑·팀 레코드를 한 번에 바꾼다 (그룹 탭과 동기화).
  const renameTeamLabel = async (card, newLabel) => {
    const oldLabel = card.name;
    if (!newLabel || newLabel === oldLabel || card.kind !== 'group') return;
    const targetOrders = orders.filter(o => o.isAfterParty && o.inviterGroupLabel === oldLabel);
    const nextMapping = { ...performerGroupMapping };
    Object.entries(nextMapping).forEach(([mId, grp]) => { if (grp === oldLabel) nextMapping[mId] = newLabel; });
    if (targetOrders.length > 0) await assignGroupLabel(targetOrders.map(o => o.id), newLabel);
    const tables = afterPartyTables.map(t => (t.groupKey === `group:${oldLabel}` ? { ...t, name: newLabel, groupKey: `group:${newLabel}` } : t));
    await patchCurrentShow({ performerGroupMapping: nextMapping, tables });
    showAfterPartyToast(`그룹 "${oldLabel}" → "${newLabel}"(으)로 변경됨`);
  };

  const removeTeam = async (card) => {
    if (!window.confirm(`"${card.name}" 팀(그룹)을 삭제할까요?\n팀에 있던 예매는 "초대자 없음"(미배치)으로, 공연자는 본인 팀으로 돌아갑니다.`)) return;
    const orderIds = (card.orders || []).map(o => o.id);
    const nextMapping = { ...performerGroupMapping };
    Object.entries(nextMapping).forEach(([mId, grp]) => { if (grp === card.name) delete nextMapping[mId]; });
    if (orderIds.length > 0) await clearInviterClassification(orderIds);
    await patchCurrentShow({ performerGroupMapping: nextMapping, tables: afterPartyTables.filter(t => t.groupKey !== card.id) });
    showAfterPartyToast(`"${card.name}" 팀이 삭제됨`);
  };

  // ── 참석자별 보기: 예매 건과 직접 참석 공연자를 한 행씩 평평하게 나열한다 ──
  const groupOptionLabels = useMemo(() => {
    const set = new Set(existingGroupLabels);
    // 'member:<id>' 값은 "다른 공연자 그룹에 합류" 표시라 직접 만든 그룹 이름이 아니다.
    Object.values(performerGroupMapping).forEach(label => { if (label && !String(label).startsWith('member:')) set.add(label); });
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
      // 매핑 값: 직접 만든 그룹 이름 | 'member:<호스트 id>'(다른 공연자 그룹에 합류) | 없음(본인 그룹)
      const mapping = String(performerGroupMapping[id] || '');
      const hostId = mapping.startsWith('member:') ? mapping.slice('member:'.length) : '';
      const host = hostId ? findPerformer(hostId) : null;
      const label = hostId ? '' : mapping;
      rows.push({
        key: `performer:${id}`, kind: 'performer', memberId: id, member: m,
        name: m.name, phone: m.phone || '', count: 1,
        type: label ? 'group' : 'performer',
        groupLabel: label || (host ? host.name : '공연자 본인'),
        selectValue: label ? `group:${label}` : host ? `member:${hostId}` : 'self',
        originalInviterName: '', createdAt: '',
      });
    });
    return rows;
  }, [orders, concertId, effectiveAfterPartyCount, afterPartyPerformerIds, members, bandMembers, performerGroupMapping, performerOptions, findPerformer]);

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
  // 예매 내역에서 뒤풀이 참여 여부/인원을 직접 바꾼다 (신청 후 "안 간다/가고 싶다" 변경 대응).
  // 불참 처리하면 좌석·테이블 배정도 함께 해제한다. 정원이 넘게 되면 관리자에게 한 번 확인받는다.
  const setOrderAfterParty = async (order, value) => {
    const count = Math.max(0, Math.min(Math.floor(Number(value) || 0), Math.max(1, Number(order.ticketCount) || 1)));
    const prevCount = order.isAfterParty ? (Number(order.afterPartyCount) || 1) : 0;
    if (count === prevCount) return;
    if (count > prevCount) {
      const limit = Math.floor(Number(currentShow?.afterPartyLimit) || 0);
      if (limit > 0) {
        const nextTotal = afterPartySummary.total - prevCount + count;
        if (nextTotal > limit && !window.confirm(`뒤풀이 정원 ${limit}명을 초과하게 됩니다 (변경 후 ${nextTotal}명). 그래도 변경할까요?`)) return;
      }
    }
    const previous = { isAfterParty: order.isAfterParty === true, afterPartyCount: Number(order.afterPartyCount) || 0 };
    const patch = count > 0 ? { isAfterParty: true, afterPartyCount: count } : { isAfterParty: false, afterPartyCount: 0 };
    // 신청자가 예매할 때 입력한 값은 처음 바꾸는 순간에 한 번만 보존해, 수정 후에도 "원래 입력값"을 보여줄 수 있게 한다.
    if (order.originalAfterPartyCount === undefined) patch.originalAfterPartyCount = prevCount;
    const result = await applyAfterPartyPatch([order.id], patch, '뒤풀이 참여 변경 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
    if (result !== 'firebase') return;
    showAfterPartyToast(
      `${order.audienceName || '(이름없음)'} 뒤풀이 ${count > 0 ? `${count}명 참여` : '불참'}로 변경됨`,
      () => applyAfterPartyPatch([order.id], previous, '실행 취소에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.')
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
      const mapping = String(performerGroupMapping[memberId] || '');
      const card = mapping.startsWith('member:') ? perfCard(mapping.slice('member:'.length))
        : mapping ? groupCard(mapping) : perfCard(memberId);
      card.performers.push(findPerformer(memberId) || { id: memberId, name: memberId, part: '' });
      card.directCount += 1;
      card.totalCount += 1;
    });
    groupOptionLabels.forEach(label => groupCard(label)); // 아직 비어 있는 직접 만든 그룹도 카드로 보여 준다
    // 좌석 배치에서 "+ 팀 추가"로 만든 빈 팀도 그룹 카드로 노출한다 (그룹 ↔ 팀 1:1 동기화).
    afterPartyTables.forEach(t => { if (typeof t.groupKey === 'string' && t.groupKey.startsWith('group:')) groupCard(t.groupKey.slice('group:'.length)); });

    return [...cards.values()].sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name));
  }, [afterPartyEntries, afterPartyPerformerIds, performerGroupMapping, groupOptionLabels, ordersById, findPerformer, afterPartyTables]);

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
      case 'afterParty': {
        const maxAfterParty = Math.max(1, Number(o.ticketCount) || 1);
        const currentAfterParty = o.isAfterParty ? (Number(o.afterPartyCount) || 1) : 0;
        const originalAfterParty = o.originalAfterPartyCount !== undefined ? Math.max(0, Number(o.originalAfterPartyCount) || 0) : null;
        const originalNote = originalAfterParty !== null && originalAfterParty !== currentAfterParty
          ? <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginTop: 3, whiteSpace: 'nowrap' }}>신청: {originalAfterParty > 0 ? `${originalAfterParty}명` : '불참'}</div>
          : null;
        return (
          <td key={colId} style={{ padding: '14px 8px', textAlign: 'center', width: cellWidth, boxSizing: 'border-box' }}>
            {isAdmin && !checkinMode ? (
              <select value={currentAfterParty} aria-label="뒤풀이 참여 변경" title="뒤풀이 참여 여부/인원을 바로 바꿀 수 있어요"
                onChange={e => setOrderAfterParty(o, e.target.value)}
                style={{ padding: '5px 6px', borderRadius: 7, border: '1px solid #e2e8f0', background: currentAfterParty > 0 ? '#fff' : '#f8fafc', fontSize: 12, fontWeight: 700, color: currentAfterParty > 0 ? '#111827' : '#94a3b8', cursor: 'pointer' }}>
                <option value={0}>불참</option>
                {Array.from({ length: maxAfterParty }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}명</option>)}
                {currentAfterParty > maxAfterParty && <option value={currentAfterParty}>{currentAfterParty}명</option>}
              </select>
            ) : (
              <div style={{ fontWeight: 700, fontSize: 13, color: o.isAfterParty ? '#111827' : '#94a3b8' }}>
                {o.isAfterParty ? (o.afterPartyCount || 1) : 0}
              </div>
            )}
            {originalNote}
          </td>
        );
      }
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

          <div className="reservation-list-heading" role="button" tabIndex={0} onClick={() => toggleFold('orders')} title={foldedSections.orders ? '펼치기' : '접기'} style={{ cursor: 'pointer' }}>
            <div>
              <div className="reservation-section-kicker">RESERVATIONS</div>
              <h2>예매 내역</h2>
              <p>예매 정보와 입금·입장 상태를 확인하고 관리합니다.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="reservation-heading-count"><strong>{visibleOrders.length}</strong><span>건</span></div>
              <span aria-hidden="true" style={{ fontSize: 14, color: '#94a3b8', fontWeight: 800 }}>{foldedSections.orders ? '▸' : '▾'}</span>
            </div>
          </div>

          {!foldedSections.orders && (<>

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
            <div className="reservation-mobile-list">
              {visibleReservationPage.map(o => {
                const paid = o.depositStatus === '입금 완료';
                const inviterInfo = classifyAfterPartyOrder(o);
                return (
                  <div key={`m-${o.id}`} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 14, color: '#111827', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.audienceName || '(이름없음)'} <span style={{ color: '#64748b', fontWeight: 700 }}>· {o.ticketCount}매</span></strong>
                      <button type="button" disabled={!isAdmin} onClick={() => toggleDeposit(o)}
                        style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: paid ? '#059669' : '#e2e8f0', color: paid ? '#fff' : '#475569', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', cursor: isAdmin ? 'pointer' : 'default' }}>{paid ? '✓ 입금 완료' : (o.depositStatus || '입금 대기')}</button>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                      <span>{o.phone || '-'}</span>
                      <span>{totalPriceFor(o).toLocaleString()}원</span>
                      {o.isAfterParty ? <span style={{ color: '#2563eb', fontWeight: 700 }}>뒤풀이 {effectiveAfterPartyCount(o)}명{inviterInfo && (inviterInfo.type === 'performer' || inviterInfo.type === 'group') ? ` · ${inviterInfo.label}` : ''}</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{o.createdAt && Number.isFinite(Date.parse(o.createdAt)) ? new Date(o.createdAt).toLocaleString('ko-KR') : ''}</div>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>세부 수정(뒤풀이 인원·입장·회비 충당·삭제)은 PC 화면에서 할 수 있어요.</div>
            </div>
            </>
          )}
          </>)}
        </div>


        {/* ── 공연 정산표: 쓸 수 있는 돈(티켓·부원 회비·후원금)과 든 돈(지출)을 한 표로 본다 ── */}
        {currentShow && (
          <ShowSettlementCard
            show={currentShow}
            isAdmin={isAdmin}
            collapsed={!!foldedSections.settlement}
            onToggleCollapse={() => toggleFold('settlement')}
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
                <p>신청자 명단을 확인하고, 좌석 배치에서 팀(그룹)을 관리합니다.</p>
              </div>
              <button type="button" onClick={() => toggleFold('afterparty')} aria-label={foldedSections.afterparty ? '뒤풀이 관리 펼치기' : '뒤풀이 관리 접기'}
                style={{ alignSelf: 'flex-start', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {foldedSections.afterparty ? '▸ 펼치기' : '▾ 접기'}
              </button>
              <div className="after-party-tabs" role="tablist" aria-label="뒤풀이 관리 작업">
                {[
                  { value: 'groups', step: '1', label: '신청자 명단' },
                  { value: 'tables', step: '2', label: '좌석 배치' },
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

            {!foldedSections.afterparty && (<>
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
                {isAdmin && currentShow ? (
                  <span style={{ fontWeight: 700, color: Number(currentShow.afterPartyLimit) > 0 && afterPartySummary.total >= Number(currentShow.afterPartyLimit) ? '#dc2626' : '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                    / 정원
                    <input type="number" min="1" aria-label="뒤풀이 정원" title="비우면 제한 없음 · 칸을 벗어나면 저장됩니다"
                      key={`aplimit:${Number(currentShow.afterPartyLimit) || 0}`}
                      defaultValue={Number(currentShow.afterPartyLimit) > 0 ? Number(currentShow.afterPartyLimit) : ''}
                      placeholder="없음"
                      onBlur={e => {
                        const v = Math.floor(Number(e.target.value) || 0);
                        const next = v > 0 ? v : null;
                        const current = Number(currentShow.afterPartyLimit) > 0 ? Number(currentShow.afterPartyLimit) : null;
                        if (next !== current) patchCurrentShow({ afterPartyLimit: next });
                      }}
                      style={{ width: 64, padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', fontSize: 13, fontWeight: 700, textAlign: 'right' }} />
                    명
                  </span>
                ) : (Number(currentShow?.afterPartyLimit) > 0 && (
                  <span style={{ fontWeight: 700, color: afterPartySummary.total >= Number(currentShow.afterPartyLimit) ? '#dc2626' : '#64748b' }}> / 정원 {Number(currentShow.afterPartyLimit)}명</span>
                ))}
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

                {/* 2. 뒤풀이 신청자 명단 — 그룹/팀 변경은 좌석 배치 탭에서 한다 */}
                {(() => {
                  const rows = afterPartyAttendeeRows
                    .filter(r => r.kind === 'order')
                    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
                  const total = rows.reduce((sum, r) => sum + r.count, 0);
                  const badge = (r) => {
                    if (r.type === 'performer') return { text: r.groupLabel || '공연자 초대', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
                    if (r.type === 'group') return { text: `🏷 ${r.groupLabel}`, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
                    if (r.type === 'unmapped') return { text: '확인 필요', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };
                    return { text: '초대자 없음', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
                  };
                  return (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 15, color: '#18181b' }}>뒤풀이 신청자 {rows.length}건 · {total}명</strong>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>그룹(팀) 변경과 좌석은 ② 좌석 배치에서 관리합니다</span>
                      </div>
                      {rows.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>뒤풀이 참여로 신청한 예매가 아직 없습니다.</div>
                      ) : (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                          <div className="after-party-roster-row" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 800, color: '#64748b' }}>
                            <span>이름</span><span style={{ textAlign: 'center' }}>인원</span><span>연락처</span><span>그룹(팀)</span><span>신청 시간</span>
                          </div>
                          {rows.map(r => {
                            const b = badge(r);
                            return (
                              <div key={r.key} className="after-party-roster-row" style={{ borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                                <span style={{ fontWeight: 700, color: '#111827', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                                <span style={{ textAlign: 'center', fontWeight: 700, color: '#334155' }}>{r.count}</span>
                                <span style={{ fontSize: 12, color: '#475569', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.phone || '-'}</span>
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 800, color: b.color, background: b.bg, border: `1px solid ${b.border}` }}>{b.text}</span>
                                  {r.type === 'unmapped' && r.originalInviterName ? <small style={{ display: 'block', marginTop: 2, color: '#b45309', fontWeight: 700 }}>"{r.originalInviterName}"</small> : null}
                                </span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.createdAt && Number.isFinite(Date.parse(r.createdAt)) ? new Date(r.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) + ' ' + new Date(r.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>공연자 본인 참석 {afterPartyPerformerIds.length}명은 신청자와 별도로 집계되며 좌석 배치 탭에서 관리합니다.</div>
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
                    {(() => {
                      // ── 팀 = 그룹. 그룹 탭의 그룹이 곧 좌석 배치의 팀이며, 어느 쪽에서 바꿔도 함께 바뀐다. ──
                      const cards = afterPartyGroupsList;
                      const unitsForCard = (card) => {
                        const units = [];
                        [...card.performers].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko')).forEach(m => units.push({ key: `p:${m.id}`, kind: 'perf', memberId: m.id, name: m.name, isHost: card.kind === 'perf' && m.id === card.memberId }));
                        [...(card.orders || [])].sort((a, b) => String(a.audienceName || '').localeCompare(String(b.audienceName || ''), 'ko')).forEach(o => {
                          const count = effectiveAfterPartyCount(o);
                          const nm = o.audienceName || '(이름없음)';
                          for (let i = 0; i < count; i += 1) units.push({ key: `a:${o.id}:${i}`, kind: 'att', order: o, name: count > 1 ? `${nm} (${i + 1})` : nm, orderCount: count });
                        });
                        // 관리자가 드래그로 정한 자리 순서가 있으면 그 순서를 우선하고, 나머지는 가나다순으로 뒤에 붙인다.
                        const seatOrder = afterPartyTables.find(tb => tb.groupKey === card.id)?.seatOrder;
                        if (Array.isArray(seatOrder) && seatOrder.length > 0) {
                          const pos = new Map(seatOrder.map((k, idx) => [k, idx]));
                          units.sort((a, b) => (pos.has(a.key) ? pos.get(a.key) : seatOrder.length) - (pos.has(b.key) ? pos.get(b.key) : seatOrder.length));
                        }
                        return units;
                      };
                      const unitsByCard = new Map(cards.map(card => [card.id, unitsForCard(card)]));
                      // 뒤풀이 장소/테이블 기본 정원 — 공연마다 저장된다 (가게가 바뀌면 여기만 고치면 됨)
                      const venueName = String(currentShow?.afterPartyVenueName || '');
                      const defaultCap = Math.max(1, Math.floor(Number(currentShow?.afterPartyTableSize)) || 6);
                      // 가게가 보유한 테이블 구성 (예: 4인 테이블 10개 + 6인 테이블 4개)
                      const tableInventory = (Array.isArray(currentShow?.afterPartyTableInventory) ? currentShow.afterPartyTableInventory : [])
                        .map(row => ({ size: Math.max(1, Math.floor(Number(row?.size)) || 0), count: Math.max(0, Math.floor(Number(row?.count)) || 0) }))
                        .filter(row => row.size > 0 && row.count > 0);
                      const inventoryTableCount = tableInventory.reduce((sum, row) => sum + row.count, 0);
                      const inventorySeatCount = tableInventory.reduce((sum, row) => sum + row.size * row.count, 0);
                      const saveInventory = (rows) => saveSeatingPatch({ afterPartyTableInventory: rows.filter(row => row.size > 0 && row.count > 0) });
                      // 좌석 슬롯: seatOrder(자리 지정, null = 비워 둔 자리)를 반영해 팀의 실제 좌석 배열을 만든다.
                      // 앞에서부터 자동으로 채우지 않으므로 테이블마다 3명씩 앉히는 식의 자유 배치가 유지된다.
                      const slotsByCard = new Map(cards.map(card => {
                        const units = unitsByCard.get(card.id) || [];
                        const stored = afterPartyTables.find(tb => tb.groupKey === card.id)?.seatOrder;
                        const order = Array.isArray(stored) ? stored : [];
                        const unitByKey = new Map(units.map(u => [u.key, u]));
                        const slots = [];
                        const used = new Set();
                        order.forEach((k, idx) => {
                          if (k && unitByKey.has(k) && !used.has(k)) { slots[idx] = unitByKey.get(k); used.add(k); }
                        });
                        units.forEach(u => {
                          if (used.has(u.key)) return;
                          let i = 0;
                          while (slots[i]) i += 1;
                          slots[i] = u;
                          used.add(u.key);
                        });
                        const savedTableCount = Math.max(1, Math.floor(Number(afterPartyTables.find(tb => tb.groupKey === card.id)?.tableCount)) || 1);
                        let n = Math.max(slots.length, units.length, savedTableCount * defaultCap, 1);
                        n = Math.ceil(n / defaultCap) * defaultCap;
                        return [card.id, Array.from({ length: n }, (_, i) => slots[i] || null)];
                      }));
                      // 사람이 앉은 자리와 관리자가 직접 추가한 빈 테이블을 함께 반영한다.
                      const tableCountFor = (card) => {
                        const slots = slotsByCard.get(card.id) || [];
                        let last = -1;
                        slots.forEach((slot, i) => { if (slot) last = i; });
                        const saved = Math.max(1, Math.floor(Number(afterPartyTables.find(tb => tb.groupKey === card.id)?.tableCount)) || 1);
                        return Math.max(saved, Math.ceil(Math.max(last + 1, 1) / Math.max(1, defaultCap)));
                      };
                      const totalTables = cards.reduce((sum, card) => sum + tableCountFor(card), 0);
                      const poolOrders = [
                        ...afterPartyEntries.individuals,
                        ...afterPartyEntries.groups.filter(g => g.type === 'unmapped').flatMap(g => g.attendees),
                      ].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
                      const poolCount = poolOrders.reduce((sum, p) => sum + p.count, 0);
                      // 격자: 저장된 크기(기본 2×3). 팀이 넘치면 줄만 자동으로 늘려 보여준다.
                      const storedGrid = (currentShow?.seatingGrid && typeof currentShow.seatingGrid === 'object') ? currentShow.seatingGrid : {};
                      const gridCols = Math.max(1, Math.min(8, Math.floor(Number(storedGrid.cols)) || 3));
                      const baseRows = Math.max(1, Math.min(20, Math.floor(Number(storedGrid.rows)) || 2));
                      const posByCard = new Map();
                      const taken = new Set();
                      cards.forEach(card => {
                        const t = afterPartyTables.find(tb => tb.groupKey === card.id);
                        if (t && Number.isInteger(t.gridRow) && Number.isInteger(t.gridCol) && t.gridRow >= 0 && t.gridCol >= 0 && t.gridCol < gridCols) {
                          const k = `${t.gridRow}:${t.gridCol}`;
                          if (!taken.has(k)) { posByCard.set(card.id, [t.gridRow, t.gridCol]); taken.add(k); }
                        }
                      });
                      let scan = 0;
                      cards.forEach(card => {
                        if (posByCard.has(card.id)) return;
                        while (taken.has(`${Math.floor(scan / gridCols)}:${scan % gridCols}`)) scan += 1;
                        const r = Math.floor(scan / gridCols);
                        const c = scan % gridCols;
                        taken.add(`${r}:${c}`);
                        posByCard.set(card.id, [r, c]);
                      });
                      const neededRows = posByCard.size ? Math.max(...[...posByCard.values()].map(([r]) => r)) + 1 : 0;
                      const gridRows = Math.max(baseRows, neededRows);
                      const cardAt = (r, c) => cards.find(card => { const pos = posByCard.get(card.id); return pos && pos[0] === r && pos[1] === c; });
                      const dropTeam = (r, c) => {
                        const dropped = cards.find(x => x.id === teamDragId);
                        setTeamDragId(null);
                        if (!dropped) return;
                        const prev = posByCard.get(dropped.id);
                        if (prev && prev[0] === r && prev[1] === c) return;
                        const occupant = cardAt(r, c);
                        const ups = [{ groupId: dropped.id, name: dropped.name, patch: { gridRow: r, gridCol: c } }];
                        if (occupant && occupant.id !== dropped.id && prev) ups.push({ groupId: occupant.id, name: occupant.name, patch: { gridRow: prev[0], gridCol: prev[1] } });
                        upsertGroupTables(ups);
                      };
                      const addTeam = () => {
                        const label = String(window.prompt('새 팀(그룹) 이름을 입력하세요') || '').trim();
                        if (!label) return;
                        if (cards.some(x => x.name === label)) { window.alert('같은 이름의 팀이 이미 있습니다.'); return; }
                        upsertGroupTables([{ groupId: `group:${label}`, name: label, patch: {} }]);
                      };
                      // 같은 팀 안 드래그: 빈 자리에 놓으면 그 자리로 이동(원래 자리는 비워 둠), 사람 위에 놓으면 서로 교체.
                      const saveSlots = (card, slots) => {
                        const keys = slots.map(slot => (slot ? slot.key : null));
                        while (keys.length && keys[keys.length - 1] === null) keys.pop();
                        upsertGroupTables([{ groupId: card.id, name: card.name, patch: { seatOrder: keys } }]);
                      };
                      const addTable = (card) => {
                        const nextCount = tableCountFor(card) + 1;
                        upsertGroupTables([{ groupId: card.id, name: card.name, patch: { tableCount: nextCount } }]);
                        showAfterPartyToast(`${card.name} 테이블을 ${nextCount}개로 추가했습니다.`);
                      };
                      const moveUnitToSeat = (card, dragKey, targetIdx) => {
                        const slots = [...(slotsByCard.get(card.id) || [])];
                        const from = slots.findIndex(slot => slot && slot.key === dragKey);
                        if (from < 0 || from === targetIdx) return;
                        while (slots.length <= targetIdx) slots.push(null);
                        const target = slots[targetIdx] || null;
                        slots[targetIdx] = slots[from];
                        slots[from] = target;
                        saveSlots(card, slots);
                      };
                      // 자동완성/다른 팀 드래그로 들어온 인원을 지정한 자리부터 (빈 자리를 찾아) 채운다.
                      const placeKeysAt = (card, keys, slotIdx) => {
                        const slots = (slotsByCard.get(card.id) || []).map(slot => (slot ? slot.key : null));
                        let pos = Math.max(0, slotIdx);
                        keys.forEach(k => {
                          while (slots[pos]) pos += 1;
                          slots[pos] = k;
                          pos += 1;
                        });
                        while (slots.length && slots[slots.length - 1] === null) slots.pop();
                        upsertGroupTables([{ groupId: card.id, name: card.name, patch: { seatOrder: slots } }]);
                      };
                      // 셀을 다른 팀 위에 떨어뜨리면 그 팀(그룹)으로 이동한다. 예매는 동반 인원까지 함께 움직인다.
                      const moveUnitToTeam = (drag, card, slotIdx = null) => {
                        const srcUnit = (unitsByCard.get(drag.teamId) || []).find(u => u.key === drag.key);
                        if (!srcUnit) return;
                        const item = srcUnit.kind === 'perf'
                          ? { kind: 'perf', memberId: srcUnit.memberId, name: srcUnit.name, count: 1 }
                          : { kind: 'att', order: srcUnit.order, name: srcUnit.order.audienceName || '(이름없음)', count: srcUnit.orderCount || 1 };
                        placeItem(item, card, slotIdx);
                      };
                      const placeItem = async (item, card, slotIdx = null) => {
                        setCellEdit(null);
                        setMenuHover(null);
                        if (item.kind === 'seat') {
                          if (slotIdx !== null && slotIdx !== undefined) moveUnitToSeat(card, item.unitKey, slotIdx);
                          return;
                        }
                        if (item.from && !window.confirm(`${item.name}은(는) 지금 "${item.from}" 팀에 있어요. "${card.name}" 팀으로 옮길까요?`)) return;
                        if (item.kind === 'perf') {
                          const prevLabel = performerGroupMapping[item.memberId] || null;
                          const target = card.kind === 'perf' ? (card.memberId === item.memberId ? null : `member:${card.memberId}`) : card.name;
                          const res = await setPerformerGroup(item.memberId, target);
                          if (res === 'firebase') showAfterPartyToast(`${item.name} → ${card.name}`, () => setPerformerGroup(item.memberId, prevLabel));
                        } else {
                          const o = item.order;
                          const prev = { inviterMemberId: o.inviterMemberId ?? null, inviterGroupLabel: o.inviterGroupLabel ?? null, inviterExtraMemberIds: Array.isArray(o.inviterExtraMemberIds) ? o.inviterExtraMemberIds : [] };
                          const res = card.kind === 'perf' ? await assignPerformer([o.id], card.memberId) : await assignGroupLabel([o.id], card.name);
                          if (res === 'firebase') showAfterPartyToast(`${item.name} → ${card.name}`, () => applyAfterPartyPatch([o.id], prev, '실행 취소에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.'));
                        }
                        if (slotIdx !== null && slotIdx !== undefined) {
                          const keys = item.kind === 'perf'
                            ? [`p:${item.memberId}`]
                            : Array.from({ length: Math.max(1, item.count || 1) }, (_, i) => `a:${item.order.id}:${i}`);
                          placeKeysAt(card, keys, slotIdx);
                        }
                      };
                      const removeUnit = (unit) => {
                        if (unit.kind === 'perf') {
                          if (unit.isHost) {
                            if (window.confirm(`${unit.name} 공연자의 뒤풀이 참석을 취소할까요?`)) removePerformerFromAfterParty(unit.memberId);
                          } else {
                            handleRemovePerformerFromGroup(unit.memberId, unit.name);
                          }
                        } else {
                          handleRemoveOrderFromGroup(unit.order);
                        }
                      };
                      // 테이블 대표 지정/해제 — 팀(테이블) 레코드의 repIds에 셀 키를 저장한다 (여러 명 가능).
                      const toggleRep = (card, unitKey) => {
                        const t = afterPartyTables.find(tb => tb.groupKey === card.id);
                        const cur = Array.isArray(t?.repIds) ? t.repIds : [];
                        const next = cur.includes(unitKey) ? cur.filter(k => k !== unitKey) : [...cur, unitKey];
                        upsertGroupTables([{ groupId: card.id, name: card.name, patch: { repIds: next } }]);
                      };
                      const menuItemsFor = (card) => {
                        const items = [];
                        poolOrders.forEach(p => {
                          const o = ordersById[p.orderId];
                          if (!o) return;
                          items.push({ key: `o:${p.orderId}`, kind: 'att', order: o, name: p.name, count: p.count, hint: p.originalInviterName || '', from: '' });
                        });
                        cards.forEach(other => {
                          if (other.id === card.id) return;
                          (other.orders || []).forEach(o => {
                            items.push({ key: `o:${o.id}`, kind: 'att', order: o, name: o.audienceName || '(이름없음)', count: effectiveAfterPartyCount(o), hint: '', from: other.name });
                          });
                          other.performers.forEach(m => {
                            items.push({ key: `p:${m.id}`, kind: 'perf', memberId: m.id, name: m.name, count: 1, hint: '', from: other.name });
                          });
                        });
                        // 같은 팀 사람을 선택하면 그 빈 자리로 "자리 이동"한다 (모바일에서 드래그 대체).
                        (unitsByCard.get(card.id) || []).forEach(u2 => {
                          items.push({ key: `seat:${u2.key}`, kind: 'seat', unitKey: u2.key, name: u2.name, count: 1, hint: '', from: '', seatMove: true });
                        });
                        const grp = (x) => (x.seatMove ? 1 : x.from ? 2 : 0);
                        items.sort((a, b) => (grp(a) - grp(b)) || String(a.name).localeCompare(String(b.name), 'ko'));
                        return items;
                      };
                      const cellBase = { minHeight: 34, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', minWidth: 0 };
                      return (
                        <>
                          <div className="after-party-seating-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                            <StatCard label="팀 배정 완료" value={`${Math.max(0, afterPartySummary.total - poolCount)}명`} color="#059669" />
                            <StatCard label="미배치" value={`${poolCount}명`} color="#b45309" />
                            <StatCard label="팀" value={`${cards.length}개`} color="#111827" />
                            <StatCard label="필요 테이블" value={inventoryTableCount > 0 ? `${totalTables} / ${inventoryTableCount}개` : `${totalTables}개`} color={inventoryTableCount > 0 && totalTables > inventoryTableCount ? '#dc2626' : '#334155'} />
                          </div>
                          <div className="after-party-seating-note" style={{ fontSize: 11, color: '#64748b' }}>{venueName ? `📍 ${venueName} · ` : ''}{inventoryTableCount > 0 ? `보유 ${tableInventory.map(row => `${row.size}인×${row.count}`).join(', ')} (총 ${inventoryTableCount}개 · ${inventorySeatCount}석) · ` : ''}전체 {afterPartySummary.total}명 (공연자 포함) · 팀은 그룹 탭의 그룹과 같습니다 — 어느 쪽에서 바꿔도 함께 바뀝니다. 셀의 ☆을 누르면 테이블 대표로 지정되고(여러 명 가능) 주황색으로 표시됩니다.</div>

                          {isAdmin && (
                            <div className="after-party-seating-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <button type="button" onClick={addTeam}
                                style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#111827', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                              >+ 팀 추가</button>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>가게 격자</span>
                              <label style={{ fontSize: 12, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                행 <input type="number" min="1" max="20" key={`gr:${baseRows}`} defaultValue={baseRows} aria-label="격자 행 수"
                                  onBlur={e => { const n = Math.max(1, Math.min(20, Math.floor(Number(e.target.value)) || baseRows)); if (n !== baseRows) saveSeatingPatch({ seatingGrid: { rows: n, cols: gridCols } }); }}
                                  style={{ width: 46, padding: '5px 6px', border: '1px solid #cbd5e1', borderRadius: 7, fontWeight: 800, textAlign: 'center', fontSize: 12 }} />
                              </label>
                              ×
                              <label style={{ fontSize: 12, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                열 <input type="number" min="1" max="8" key={`gc:${gridCols}`} defaultValue={gridCols} aria-label="격자 열 수"
                                  onBlur={e => { const n = Math.max(1, Math.min(8, Math.floor(Number(e.target.value)) || gridCols)); if (n !== gridCols) saveSeatingPatch({ seatingGrid: { rows: baseRows, cols: n } }); }}
                                  style={{ width: 46, padding: '5px 6px', border: '1px solid #cbd5e1', borderRadius: 7, fontWeight: 800, textAlign: 'center', fontSize: 12 }} />
                              </label>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>팀 머리글(⠿)을 잡아 원하는 칸으로 드래그하면 가게 테이블 위치대로 배치됩니다. 두 팀을 겹치면 자리를 서로 바꿉니다.</span>
                              <span style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>뒤풀이 장소</span>
                                <input type="text" aria-label="뒤풀이 장소 이름" key={`vn:${venueName}`} defaultValue={venueName} placeholder="예: OO호프 2층"
                                  onBlur={e => { const v = e.target.value.trim(); if (v !== venueName) saveSeatingPatch({ afterPartyVenueName: v }); }}
                                  style={{ width: 170, padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12, fontWeight: 700 }} />
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>테이블 기본 정원</span>
                                <input type="number" min="1" max="99" aria-label="테이블 기본 정원" key={`dc:${defaultCap}`} defaultValue={defaultCap}
                                  onBlur={e => { const n = Math.max(1, Math.min(99, Math.floor(Number(e.target.value)) || defaultCap)); if (n !== defaultCap) saveSeatingPatch({ afterPartyTableSize: n }); }}
                                  style={{ width: 52, padding: '5px 6px', border: '1px solid #cbd5e1', borderRadius: 7, fontWeight: 800, textAlign: 'center', fontSize: 12 }} />
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>팀 정원과 테이블 수는 인원에 맞춰 자동 계산됩니다</span>
                              </span>
                              <span style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>보유 테이블</span>
                                {tableInventory.map((row, idx) => (
                                  <span key={`inv-${idx}-${row.size}-${row.count}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 7px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 700, color: '#334155' }}>
                                    <input type="number" min="1" max="99" aria-label="테이블 자리 수" defaultValue={row.size}
                                      onBlur={e => { const n = Math.max(1, Math.min(99, Math.floor(Number(e.target.value)) || row.size)); if (n !== row.size) saveInventory(tableInventory.map((r, i) => (i === idx ? { ...r, size: n } : r))); }}
                                      style={{ width: 36, padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, fontWeight: 800, textAlign: 'center' }} />
                                    인 ×
                                    <input type="number" min="1" max="99" aria-label="테이블 개수" defaultValue={row.count}
                                      onBlur={e => { const n = Math.max(1, Math.min(99, Math.floor(Number(e.target.value)) || row.count)); if (n !== row.count) saveInventory(tableInventory.map((r, i) => (i === idx ? { ...r, count: n } : r))); }}
                                      style={{ width: 36, padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, fontWeight: 800, textAlign: 'center' }} />
                                    개
                                    <button type="button" aria-label="이 테이블 종류 삭제" onClick={() => saveInventory(tableInventory.filter((_, i) => i !== idx))}
                                      style={{ border: 'none', background: 'none', color: '#dc2626', fontWeight: 800, cursor: 'pointer', padding: '0 1px', fontSize: 12 }}>✕</button>
                                  </span>
                                ))}
                                <button type="button" onClick={() => saveSeatingPatch({ afterPartyTableInventory: [...tableInventory, { size: defaultCap, count: 1 }] })}
                                  style={{ padding: '4px 9px', borderRadius: 8, border: '1px dashed #cbd5e1', background: '#fff', color: '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ 종류 추가</button>
                                {inventoryTableCount > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>총 {inventoryTableCount}개 · {inventorySeatCount}석</span>}
                              </span>
                            </div>
                          )}

                          {/* 공연자 참석 관리 */}
                          <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#1e3a8a' }}>🎸 뒤풀이 참석 공연자 {afterPartyPerformerIds.length}명 — 참석으로 표시해야 팀 명단에 나옵니다</span>
                              {isAdmin && <button type="button" onClick={() => setIsPerformerPanelOpen(prev => !prev)} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #93c5fd', background: '#fff', color: '#1d4ed8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{isPerformerPanelOpen ? '닫기' : '공연자 참석 관리'}</button>}
                            </div>
                            {isAdmin && isPerformerPanelOpen && (
                              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                {currentShowParticipantIds.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                    {currentShowParticipantIds.map(memberId => {
                                      const m = findPerformer(memberId) || { id: memberId, name: memberId, part: '' };
                                      const attending = afterPartyPerformerIds.includes(memberId);
                                      return (
                                        <button key={memberId} type="button" onClick={() => (attending ? removePerformerFromAfterParty(memberId) : addPerformerToAfterParty(memberId))}
                                          style={{ padding: '4px 9px', borderRadius: 10, border: `1.5px solid ${attending ? '#2563eb' : '#cbd5e1'}`, background: attending ? '#2563eb' : '#fff', color: attending ? '#fff' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                          {attending ? '✓ ' : '+ '}{m.name}{m.part ? ` (${m.part})` : ''}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {currentShowParticipantIds.length > 0 && (
                                    <>
                                      <button type="button" onClick={() => patchCurrentShow({ afterPartyPerformerIds: Array.from(new Set([...afterPartyPerformerIds, ...currentShowParticipantIds])) })} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #93c5fd', background: '#fff', color: '#1d4ed8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>전원 참석</button>
                                      <button type="button" onClick={() => patchCurrentShow({ afterPartyPerformerIds: afterPartyPerformerIds.filter(id => !currentShowParticipantIds.includes(id)) })} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>전원 해제</button>
                                    </>
                                  )}
                                  <AddPerformerPicker members={performerOptions} excludeIds={afterPartyPerformerIds} onAdd={(memberId) => addPerformerToAfterParty(memberId)} triggerText="+ 공연자 직접 추가" />
                                </div>
                                {afterPartyPerformerIds.length > 0 && (
                                  <div style={{ display: 'grid', gap: 4 }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e' }}>공연자 본인이 예매도 했다면 연결하세요 — 예매 인원에서 1명을 빼서 중복 집계를 막습니다</div>
                                    {afterPartyPerformerIds.map(memberId => {
                                      const m = findPerformer(memberId) || { id: memberId, name: memberId };
                                      const selectedOrderId = afterPartyPerformerOrderIds[memberId] || '';
                                      const availableOrders = (concertId ? filterOrdersForShow(orders, concertId) : orders).filter(order => {
                                        if (!order.isAfterParty) return false;
                                        if (order.id === selectedOrderId) return true;
                                        return (performerDuplicateCountByOrder[order.id] || 0) < (Number(order.afterPartyCount) || 1);
                                      });
                                      return (
                                        <label key={memberId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#78350f', flexWrap: 'wrap' }}>
                                          <strong style={{ minWidth: 56 }}>{m.name}</strong>
                                          <select value={selectedOrderId} onChange={event => setPerformerDuplicateOrder(memberId, event.target.value)} style={{ minWidth: 180, padding: '4px 7px', borderRadius: 7, border: '1px solid #fcd34d', background: '#fff', fontSize: 12 }}>
                                            <option value="">별도 참석 (중복 없음)</option>
                                            {availableOrders.map(order => <option key={order.id} value={order.id}>{order.audienceName || '이름 없음'} · 뒤풀이 {Number(order.afterPartyCount) || 1}명</option>)}
                                          </select>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 미배치 풀 */}
                          <div style={{ padding: '10px 12px', border: '1.5px dashed #cbd5e1', borderRadius: 10, background: '#f8fafc' }}>
                            <b style={{ fontSize: 12, color: poolCount ? '#b45309' : '#047857' }}>{poolCount ? `미배치 ${poolCount}명 — 팀의 빈 칸에 이름을 입력해 배치하세요 (배치하면 그룹도 함께 지정됩니다)` : '✅ 모두 팀에 배정됐어요'}</b>
                            {poolOrders.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                                {poolOrders.map(p => (
                                  <span key={p.orderId} style={{ padding: '4px 9px', borderRadius: 14, border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', fontSize: 12, fontWeight: 700 }}>
                                    {p.name}{p.count > 1 ? ` (${p.count}명)` : ''}
                                    {p.originalInviterName ? <small style={{ color: '#b45309', fontWeight: 700 }}> · "{p.originalInviterName}"</small> : null}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 팀 격자 */}
                          <div className="after-party-team-grid" style={{ '--team-grid-cols': gridCols }}>
                            {cards.length === 0 && (
                              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>아직 팀이 없습니다. '+ 팀 추가'를 누르거나 그룹 탭에서 그룹을 만들면 여기 나타납니다.</div>
                            )}
                            {cards.length > 0 && Array.from({ length: gridRows * gridCols }, (_, idx) => {
                              const r = Math.floor(idx / gridCols);
                              const c = idx % gridCols;
                              const card = cardAt(r, c);
                              if (!card) {
                                return (
                                  <div key={`slot-${r}-${c}`}
                                    onDragOver={isAdmin ? (e => e.preventDefault()) : undefined}
                                    onDrop={isAdmin ? (e => { e.preventDefault(); dropTeam(r, c); }) : undefined}
                                    className="after-party-grid-slot"
                                    style={{ minHeight: 110, border: '1.5px dashed #cbd5e1', borderRadius: 12, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 12, fontWeight: 700 }}>
                                    빈 자리
                                  </div>
                                );
                              }
                              const units = unitsByCard.get(card.id) || [];
                              const slots = slotsByCard.get(card.id) || [];
                              const cap = tableCountFor(card) * Math.max(1, defaultCap);
                              const displayName = card.kind === 'perf' && card.performers.length > 1
                                ? card.performers.map(member => member.name).join(' · ')
                                : card.name;
                              const isEditing = cellEdit?.teamId === card.id;
                              const query = (cellEdit?.query || '').replace(/\s+/g, '').toLowerCase();
                              const menuItems = isEditing ? menuItemsFor(card).filter(it => !query || it.name.replace(/\s+/g, '').toLowerCase().includes(query)) : [];
                              return (
                                <div key={card.id}
                                  onDragOver={isAdmin ? (e => e.preventDefault()) : undefined}
                                  onDrop={isAdmin ? (e => { e.preventDefault(); if (unitDrag) { if (unitDrag.teamId !== card.id) moveUnitToTeam(unitDrag, card); setUnitDrag(null); return; } dropTeam(r, c); }) : undefined}
                                  style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', minWidth: 0, opacity: teamDragId === card.id ? 0.5 : 1 }}>
                                  <div draggable={isAdmin}
                                    onDragStart={isAdmin ? (() => setTeamDragId(card.id)) : undefined}
                                    onDragEnd={isAdmin ? (() => setTeamDragId(null)) : undefined}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', borderRadius: '12px 12px 0 0', cursor: isAdmin ? 'grab' : 'default' }}>
                                    {isAdmin && <span aria-hidden="true" style={{ color: '#94a3b8', fontSize: 13 }}>⠿</span>}
                                    {card.kind === 'group' && isAdmin ? (
                                      <input type="text" aria-label="팀 이름" key={`tn:${card.id}:${card.name}`} defaultValue={card.name}
                                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== card.name) renameTeamLabel(card, v); }}
                                        style={{ flex: 1, minWidth: 0, border: '1px solid transparent', background: 'transparent', fontWeight: 800, fontSize: 13, borderRadius: 6, padding: '3px 5px' }} />
                                    ) : (
                                      <span title={card.kind === 'perf' ? '함께 배치된 공연자를 모두 표시합니다' : undefined} style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 13, padding: '3px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.kind === 'perf' ? '🎤 ' : '🏷️ '}{displayName}</span>
                                    )}
                                    <span title="정원은 기본 정원 × 테이블 수로 자동 계산됩니다" style={{ fontSize: 12, fontWeight: 800, color: units.length === cap ? '#047857' : '#475569', whiteSpace: 'nowrap' }}>{units.length}/{cap}</span>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', whiteSpace: 'nowrap' }}>{tableCountFor(card)}테이블</span>
                                    {isAdmin && <button type="button" aria-label={`${displayName} 테이블 추가`} title="빈 테이블을 하나 추가합니다" onClick={() => addTable(card)} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 6, cursor: 'pointer', padding: '2px 6px', fontSize: 11, fontWeight: 800 }}>+ 테이블</button>}
                                    {isAdmin && card.kind === 'group' && (
                                      <button type="button" aria-label="팀 삭제" title="이 팀(그룹)을 삭제합니다" onClick={() => removeTeam(card)} style={{ border: 'none', background: 'none', color: '#dc2626', fontWeight: 800, cursor: 'pointer', padding: '0 2px', fontSize: 13 }}>✕</button>
                                    )}
                                  </div>
                                  {(() => {
                                    // ── 테이블 단위 박스: 기본 정원만큼씩 끊어 실제 테이블 1개를 테두리로 보여준다.
                                    // 셀을 드래그해서 같은 팀 안의 다른 자리(다른 테이블 포함)로 옮길 수 있다. ──
                                    const tableSeats = Math.max(1, defaultCap);
                                    const totalCells = slots.length;
                                    const chunkCount = Math.max(1, Math.ceil(totalCells / tableSeats));
                                    const teamTable = afterPartyTables.find(tb => tb.groupKey === card.id);
                                    const repIds = Array.isArray(teamTable?.repIds) ? teamTable.repIds : [];
                                    const renderUnitCell = (u, globalIdx, idxInChunk) => {
                                      const isRep = repIds.includes(u.key);
                                      const isMoveTarget = !!menuHover && ((menuHover.kind === 'att' && u.kind === 'att' && u.order.id === menuHover.orderId) || (menuHover.kind === 'perf' && u.kind === 'perf' && u.memberId === menuHover.memberId));
                                      const isDragging = unitDrag?.teamId === card.id && unitDrag?.key === u.key;
                                      return (
                                        <div key={u.key}
                                          draggable={isAdmin}
                                          onDragStart={isAdmin ? (e => { e.stopPropagation(); setUnitDrag({ teamId: card.id, key: u.key }); }) : undefined}
                                          onDragEnd={isAdmin ? (() => setUnitDrag(null)) : undefined}
                                          onDragOver={isAdmin ? (e => { if (unitDrag) { e.preventDefault(); e.stopPropagation(); } }) : undefined}
                                          onDrop={isAdmin ? (e => { if (!unitDrag) return; e.preventDefault(); e.stopPropagation(); if (unitDrag.teamId === card.id) moveUnitToSeat(card, unitDrag.key, globalIdx); else moveUnitToTeam(unitDrag, card, globalIdx); setUnitDrag(null); }) : undefined}
                                          style={{ ...cellBase, background: isMoveTarget ? '#fef9c3' : isRep ? '#ffedd5' : '#fff', boxShadow: isMoveTarget ? 'inset 0 0 0 2px #f59e0b' : 'none', borderRight: idxInChunk % 2 === 0 ? '1px solid #f1f5f9' : 'none', borderTop: idxInChunk >= 2 ? cellBase.borderTop : 'none', opacity: isDragging ? 0.4 : 1, cursor: isAdmin ? 'grab' : 'default' }}>
                                          <span role="button" tabIndex={0} title="눌러서 정보 보기"
                                            onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); setCellInfo(prev => (prev?.key === u.key && prev?.teamId === card.id ? null : { teamId: card.id, key: u.key, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } })); }}
                                            style={{ flex: 1, padding: '7px 2px 7px 10px', fontSize: 13, fontWeight: 700, color: isRep ? '#9a3412' : '#111827', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>{u.kind === 'perf' ? '🎤 ' : ''}{u.name}</span>
                                          {cellInfo?.teamId === card.id && cellInfo?.key === u.key && (() => {
                                            const a = cellInfo.anchor || { left: 0, top: 0, bottom: 0 };
                                            const openUp = window.innerHeight - a.bottom < 220 && a.top > 220;
                                            const popStyle = { position: 'fixed', left: Math.max(8, Math.min(a.left, window.innerWidth - 272)), zIndex: 70, width: 256, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, boxShadow: '0 10px 26px rgba(15,23,42,.18)', padding: '10px 26px 10px 12px', fontSize: 12, color: '#334155', ...(openUp ? { bottom: window.innerHeight - a.top + 2 } : { top: a.bottom + 2 }) };
                                            const infoRow = (label, value) => (
                                              <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                                                <span style={{ color: '#94a3b8', fontWeight: 700, minWidth: 76, flexShrink: 0 }}>{label}</span>
                                                <span style={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
                                              </div>
                                            );
                                            let body;
                                            if (u.kind === 'perf') {
                                              const m = findPerformer(u.memberId) || { name: u.name, part: '' };
                                              const linkedOrderId = afterPartyPerformerOrderIds[u.memberId] || '';
                                              const linked = linkedOrderId ? ordersById[linkedOrderId] : null;
                                              body = (
                                                <>
                                                  <div style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>🎤 {m.name}{m.part ? ` (${m.part})` : ''}</div>
                                                  {infoRow('구분', '공연자 본인 참석')}
                                                  {infoRow('현재 팀', card.name)}
                                                  {infoRow('본인 예매', linked ? `${linked.audienceName || '이름 없음'} 예매와 연결됨` : '연결 없음')}
                                                </>
                                              );
                                            } else {
                                              const o = u.order;
                                              const rawInviter = (o.inviterName && o.inviterName !== '없음') ? o.inviterName : '';
                                              body = (
                                                <>
                                                  <div style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>{o.audienceName || '(이름없음)'} · 뒤풀이 {u.orderCount}명</div>
                                                  {infoRow('초대자(원문)', rawInviter || '입력 안 함')}
                                                  {infoRow('현재 팀', card.name)}
                                                  {infoRow('연락처', o.phone || '-')}
                                                  {infoRow('입금', o.depositStatus || '-')}
                                                  {infoRow('신청', o.createdAt && Number.isFinite(Date.parse(o.createdAt)) ? new Date(o.createdAt).toLocaleString('ko-KR') : '-')}
                                                </>
                                              );
                                            }
                                            return (
                                              <div style={popStyle} onClick={e => e.stopPropagation()}>
                                                <button type="button" aria-label="정보 닫기" onClick={() => setCellInfo(null)} style={{ position: 'absolute', top: 6, right: 8, border: 'none', background: 'none', color: '#94a3b8', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>✕</button>
                                                {body}
                                                {isAdmin && cards.length > 1 && (
                                                  <select value="" aria-label="다른 팀으로 이동"
                                                    onChange={e => { const target = cards.find(c2 => c2.id === e.target.value); if (target) { setCellInfo(null); moveUnitToTeam({ teamId: card.id, key: u.key }, target); } }}
                                                    style={{ marginTop: 8, width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700, background: '#fff' }}>
                                                    <option value="">다른 팀으로 이동…</option>
                                                    {cards.filter(c2 => c2.id !== card.id).map(c2 => <option key={c2.id} value={c2.id}>{c2.name}</option>)}
                                                  </select>
                                                )}
                                              </div>
                                            );
                                          })()}
                                          {isAdmin && (
                                            <button type="button" aria-label={`${u.name} 테이블 대표 ${isRep ? '해제' : '지정'}`} title="테이블 대표 지정/해제 (여러 명 가능)" onClick={() => toggleRep(card, u.key)}
                                              style={{ border: 'none', background: 'none', color: isRep ? '#f59e0b' : '#d1d5db', cursor: 'pointer', padding: '0 2px', fontWeight: 800, fontSize: 13 }}>{isRep ? '★' : '☆'}</button>
                                          )}
                                          {isAdmin && (
                                            <button type="button" aria-label={`${u.name} 빼기`} title={u.kind === 'att' && u.orderCount > 1 ? '동반 인원까지 예매 단위로 함께 빠집니다' : undefined} onClick={() => removeUnit(u)}
                                              style={{ border: 'none', background: 'none', color: '#fca5a5', cursor: 'pointer', padding: '0 8px', fontWeight: 800, fontSize: 12 }}>✕</button>
                                          )}
                                        </div>
                                      );
                                    };
                                    const renderEmptyCell = (globalIdx, idxInChunk) => (
                                      <div key={`empty-${globalIdx}`}
                                        onDragOver={isAdmin ? (e => { if (unitDrag) { e.preventDefault(); e.stopPropagation(); } }) : undefined}
                                        onDrop={isAdmin ? (e => { if (!unitDrag) return; e.preventDefault(); e.stopPropagation(); if (unitDrag.teamId === card.id) moveUnitToSeat(card, unitDrag.key, globalIdx); else moveUnitToTeam(unitDrag, card, globalIdx); setUnitDrag(null); }) : undefined}
                                        style={{ ...cellBase, position: 'relative', borderRight: idxInChunk % 2 === 0 ? '1px solid #f1f5f9' : 'none', borderTop: idxInChunk >= 2 ? cellBase.borderTop : 'none' }}>
                                        {isEditing && cellEdit?.slotIdx === globalIdx ? (
                                          <>
                                            <input autoFocus type="text" value={cellEdit.query} placeholder="이름 입력" aria-label="배치할 이름 검색"
                                              onChange={e => setCellEdit(prev => ({ ...prev, teamId: card.id, query: e.target.value }))}
                                              onBlur={() => { setMenuHover(null); setTimeout(() => setCellEdit(prev => (prev?.teamId === card.id ? null : prev)), 150); }}
                                              style={{ width: '100%', border: 'none', background: '#fffbeb', padding: '7px 10px', fontSize: 13, outline: 'none', fontWeight: 700 }} />
                                            <div style={(() => {
                                              const base = { zIndex: 60, width: 230, overflowY: 'auto', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, boxShadow: '0 10px 26px rgba(15,23,42,.18)', padding: 4 };
                                              const a = cellEdit?.anchor;
                                              if (!a) return { ...base, position: 'absolute', left: 4, top: 'calc(100% - 2px)', maxHeight: 200 };
                                              const spaceBelow = window.innerHeight - a.bottom;
                                              const openUp = spaceBelow < 170 && a.top > spaceBelow;
                                              const fixedBase = { ...base, position: 'fixed', left: Math.max(8, Math.min(a.left, window.innerWidth - 246)) };
                                              return openUp
                                                ? { ...fixedBase, bottom: window.innerHeight - a.top + 2, maxHeight: Math.min(220, a.top - 16) }
                                                : { ...fixedBase, top: a.bottom + 2, maxHeight: Math.min(220, Math.max(120, spaceBelow - 16)) };
                                            })()}>
                                              {menuItems.map(it => (
                                                <button key={it.key} type="button" onMouseDown={() => placeItem(it, card, cellEdit?.slotIdx ?? null)}
                                                  onMouseEnter={() => setMenuHover(it.from ? { kind: it.kind, orderId: it.kind === 'att' ? it.order.id : null, memberId: it.kind === 'perf' ? it.memberId : null } : null)}
                                                  onMouseLeave={() => setMenuHover(null)}
                                                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '6px 8px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer', color: '#1e293b' }}>
                                                  {it.kind === 'perf' ? '🎤 ' : ''}{it.name}{it.kind === 'att' && it.count > 1 ? ` (${it.count}명)` : ''}
                                                  {it.seatMove ? <small style={{ color: '#2563eb', fontWeight: 700 }}> · 이 자리로 이동</small> : null}
                                                  {it.from ? <small style={{ color: '#94a3b8', fontWeight: 700 }}> · {it.from}에서 이동</small> : null}
                                                  {it.hint ? <small style={{ color: '#b45309', fontWeight: 700 }}> · "{it.hint}"</small> : null}
                                                </button>
                                              ))}
                                              {menuItems.length === 0 && <div style={{ padding: '6px 8px', fontSize: 12, color: '#94a3b8' }}>일치하는 인원이 없습니다</div>}
                                            </div>
                                          </>
                                        ) : (
                                          isAdmin ? (
                                            <button type="button" onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); setCellEdit({ teamId: card.id, query: '', slotIdx: globalIdx, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } }); }}
                                              style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '7px 10px', fontSize: 13, color: '#cbd5e1', cursor: 'text', fontWeight: 600 }}>+ 이름 입력</button>
                                          ) : null
                                        )}
                                      </div>
                                    );
                                    return (
                                      <div style={{ display: 'grid', gap: 6, padding: 6 }}>
                                        {Array.from({ length: chunkCount }, (_, ti) => {
                                          const startIdx = ti * tableSeats;
                                          const count = Math.min(tableSeats, totalCells - startIdx);
                                          return (
                                            <div key={`tbl-${ti}`} style={{ border: '1.5px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                                              {chunkCount > 1 && <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', padding: '2px 8px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>테이블 {ti + 1}</div>}
                                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                                {Array.from({ length: count }, (_, k) => {
                                                  const gi = startIdx + k;
                                                  const slotUnit = slots[gi];
                                                  return slotUnit ? renderUnitCell(slotUnit, gi, k) : renderEmptyCell(gi, k);
                                                })}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
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
            </>)}
          </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontWeight: 500 }}>
          관리자만 상태 토글이 가능합니다. 모든 데이터는 브라우저 로컬 스토리지 및 데이터베이스에 안전하게 보관됩니다.
        </div>
      </div>
    </div>
  );
}
