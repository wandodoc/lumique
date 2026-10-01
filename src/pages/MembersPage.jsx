import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { sortByPartAndName } from '../utils/calculations';
import './Pages.css';

const PARTS = ['전체', 'VOIX', 'DANCE', 'SESSION'];
const VIEWS = ['회원 목록', '공연별 현황'];

// YYYY-MM-DD → "YYYY년 M월 D일" (기존 YYYY-MM 호환)
function fmtPerfLabel(key) {
  const parts = key.split('-');
  const y = parts[0], m = parseInt(parts[1], 10);
  if (parts.length === 3) return `${y}년 ${m}월 ${parseInt(parts[2], 10)}일`;
  return `${y}년 ${m}월`;
}

const AVAILABILITY_OPTIONS = [
  { value: 'available', label: '가능' },
  { value: 'unavailable', label: '불가능' },
  { value: 'undecided', label: '미정' },
];

const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getWeekStart = (date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const getWeekDates = (weekStart) => Array.from({ length: 7 }, (_, index) => {
  const date = new Date(weekStart);
  date.setDate(weekStart.getDate() + index);
  return date;
});

const formatAvailabilityDate = (date) => {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getMonth() + 1}/${date.getDate()} (${weekdays[date.getDay()]})`;
};



/* =========================================================
   회원 추가/수정 모달
   ========================================================= */
function MemberFormModal({ member, performances, onSave, onClose }) {
  const isEdit = !!member;
  const defaultPerfs = Object.fromEntries(performances.map(p => [p.key, '미참여']));
  const [form, setForm] = useState(
    member
      ? { ...member, performances: { ...defaultPerfs, ...(member.performances || {}) } }
      : { name: '', part: 'VOIX', joinDate: '', leaveDate: '', status: 'active', performances: defaultPerfs }
  );
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setPerf = (k, v) => setForm(p => ({ ...p, performances: { ...p.performances, [k]: v } }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.joinDate) return;
    onSave({
      ...form,
      id: form.id || 'm_' + Date.now(),
      status: form.leaveDate ? 'inactive' : 'active',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>
          {isEdit ? '회원 수정' : '회원 추가'}
        </h3>
        <form className="add-form" onSubmit={handleSubmit}>
          <label>이름
            <input type="text" value={form.name} placeholder="홍길동"
              onChange={e => set('name', e.target.value)} required />
          </label>
          <label>파트
            <select value={form.part} onChange={e => set('part', e.target.value)}>
              <option value="VOIX">VOIX</option>
              <option value="DANCE">DANCE</option>
              <option value="SESSION">SESSION</option>
            </select>
          </label>
          <label>가입일
            <input type="date" value={form.joinDate}
              onChange={e => set('joinDate', e.target.value)} required />
          </label>
          <label>탈퇴일 (선택)
            <input type="date" value={form.leaveDate || ''}
              onChange={e => set('leaveDate', e.target.value || null)} />
          </label>

          {performances.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate-700)', marginTop: 4 }}>공연 참여</div>
              <div className="perf-grid">
                {performances.map(p => {
                  const joinDateStr = form.joinDate || '9999-99-99';
                  const disabled = joinDateStr > p.key;
                  return (
                    <div key={p.key} className="perf-item">
                      <span className="text-muted" style={{ fontSize: 11 }}>{p.label}</span>
                      <button type="button" disabled={disabled}
                        className={`perf-toggle ${form.performances?.[p.key] === '참여' ? 'active' : ''}`}
                        style={{ opacity: disabled ? 0.3 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
                        onClick={() => !disabled && setPerf(p.key, form.performances?.[p.key] === '참여' ? '미참여' : '참여')}>
                        {disabled ? '—' : (form.performances?.[p.key] === '참여' ? '참여' : '미참여')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>
              {isEdit ? '저장' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   공연 추가 모달
   ========================================================= */
function AddPerfModal({ onSave, onClose, existing }) {
  const [date, setDate] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!date) return;
    const key = date; // YYYY-MM-DD
    if (existing.some(p => p.key === key)) { setError('이미 존재하는 공연입니다.'); return; }
    onSave({ key, label: fmtPerfLabel(key) });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>공연 일정 추가</h3>
        <form className="add-form" onSubmit={handleSubmit}>
          <label>공연 일자
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </label>
          {error && <div className="text-red" style={{ fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>추가</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   공연별 현황 뷰
   ========================================================= */
/* =========================================================
   공연별 현황 뷰 (보드/카드 레이아웃)
   ========================================================= */
function PerfView({ performances, members, onToggle }) {
  const [expandedPerfs, setExpandedPerfs] = useState({});

  const togglePerfExpand = (perfKey) => {
    setExpandedPerfs(prev => ({
      ...prev,
      [perfKey]: !prev[perfKey]
    }));
  };

  if (performances.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 40 }}>
        등록된 공연이 없습니다.
      </div>
    );
  }

  // 1. 공연 현황 최신순(내림차순) 정렬
  const sortedPerformances = [...performances].sort((a, b) => b.key.localeCompare(a.key));

  return (
    <div className="perf-board-layout">
      {sortedPerformances.map(p => {
        const isExpanded = !!expandedPerfs[p.key];
        const participated = members.filter(m => m.performances?.[p.key] === '참여');
        
        // 파트별 참여자 카운트
        const counts = {
          VOIX: participated.filter(m => m.part === 'VOIX').length,
          DANCE: participated.filter(m => m.part === 'DANCE').length,
          SESSION: participated.filter(m => m.part === 'SESSION').length,
        };

        // 2. 파트 내 가나다순(오름차순) 정렬
        const voixMembers = participated
          .filter(m => m.part === 'VOIX')
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        const danceMembers = participated
          .filter(m => m.part === 'DANCE')
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        const sessionMembers = participated
          .filter(m => m.part === 'SESSION')
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        return (
          <div key={p.key} className="perf-card-new">
            {/* 상단: 공연 명칭 및 날짜 */}
            <div className="perf-card-header">
              <div>
                <h3 className="perf-title">{p.label}</h3>
                <span className="perf-date">{p.key.replace(/-/g, '.')}</span>
              </div>
              <span className="perf-total-badge">총 {participated.length}명 참여</span>
            </div>

            {/* 중앙: 파트별 참여자 요약 */}
            <div className="perf-card-middle">
              <div className="part-summary-item">
                <span className="part-summary-label voix">VOIX</span>
                <span className="part-summary-value">{counts.VOIX}명</span>
              </div>
              <div className="part-summary-item">
                <span className="part-summary-label dance">DANCE</span>
                <span className="part-summary-value">{counts.DANCE}명</span>
              </div>
              <div className="part-summary-item">
                <span className="part-summary-label session">SESSION</span>
                <span className="part-summary-value">{counts.SESSION}명</span>
              </div>
            </div>

            {/* 하단: 참여자 명단 보기 접이식 버튼 */}
            <div className="perf-card-bottom">
              <button 
                type="button"
                className="btn-toggle-participants"
                onClick={() => togglePerfExpand(p.key)}
              >
                <span>참여자 명단 {isExpanded ? '접기' : '보기'}</span>
                <span className={`chevron-icon ${isExpanded ? 'rotated' : ''}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 9l-7 7-7-7"/></svg>
                </span>
              </button>

              <div className={`participants-accordion-content ${isExpanded ? 'expanded' : ''}`}>
                <div className="participants-accordion-inner">
                  {participated.length === 0 ? (
                    <div className="no-participants">참여한 멤버가 없습니다.</div>
                  ) : (
                    <div className="participants-by-part">
                      {voixMembers.length > 0 && (
                        <div className="part-participants-group">
                          <span className="part-title voix">VOIX</span>
                          <div className="participant-chips">
                            {voixMembers.map(m => (
                              <span key={m.id} className="participant-chip">
                                {m.name}
                                {m.status === 'inactive' && <span className="chip-inactive-label">(탈퇴)</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {danceMembers.length > 0 && (
                        <div className="part-participants-group">
                          <span className="part-title dance">DANCE</span>
                          <div className="participant-chips">
                            {danceMembers.map(m => (
                              <span key={m.id} className="participant-chip">
                                {m.name}
                                {m.status === 'inactive' && <span className="chip-inactive-label">(탈퇴)</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {sessionMembers.length > 0 && (
                        <div className="part-participants-group">
                          <span className="part-title session">SESSION</span>
                          <div className="participant-chips">
                            {sessionMembers.map(m => (
                              <span key={m.id} className="participant-chip">
                                {m.name}
                                {m.status === 'inactive' && <span className="chip-inactive-label">(탈퇴)</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
   메인 페이지
   ========================================================= */
export default function MembersPage({ initialView = '회원 목록' }) {
  const { state, dispatch } = useApp();
  const { isAdmin: rawIsAdmin, requestLogin } = useAuth();
  const isAdmin = rawIsAdmin && window.innerWidth >= 768;
  const {
    members,
    performances,
    memberAvailability = {},
    bandMembers = {},
    bandMemberAvailability = {},
  } = state;

  const [partFilter, setPartFilter] = useState('전체');
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState({});
  const [modal, setModal] = useState(null);
  const [showAddPerf, setShowAddPerf] = useState(false);
  const [view, setView] = useState(initialView);
  const [availabilityWeekStart, setAvailabilityWeekStart] = useState(() => getWeekStart(new Date()));
  const [externalBandName, setExternalBandName] = useState('');
  const [editingExternalBandMemberId, setEditingExternalBandMemberId] = useState(null);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const togglePerformance = (e, member, perfKey) => {
    e.stopPropagation();
    if (window.innerWidth < 768) return; // no edit/login on mobile
    if (!rawIsAdmin) { requestLogin(); return; }
    const current = member.performances?.[perfKey] === '참여';
    dispatch({
      type: 'UPDATE_MEMBER',
      member: { ...member, performances: { ...member.performances, [perfKey]: current ? '미참여' : '참여' } }
    });
  };

  const toggleExpand = (memberId) => {
    setExpandedMembers(prev => ({
      ...prev,
      [memberId]: !prev[memberId]
    }));
  };

  const handleSave = (member) => {
    if (members.find(m => m.id === member.id)) dispatch({ type: 'UPDATE_MEMBER', member });
    else dispatch({ type: 'ADD_MEMBER', member });
    setModal(null);
  };

  const handleAddPerf = (perf) => {
    dispatch({ type: 'ADD_PERFORMANCE', perf });
    setShowAddPerf(false);
  };

  const handleDeletePerf = (key) => {
    if (window.confirm(`"${fmtPerfLabel(key)}" 공연을 삭제하시겠습니까?`)) {
      dispatch({ type: 'DELETE_PERFORMANCE', key });
    }
  };

  const availabilityDates = getWeekDates(availabilityWeekStart);

  const shiftAvailabilityWeek = (amount) => {
    setAvailabilityWeekStart(current => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount * 7);
      return next;
    });
  };

  const updateMemberAvailability = (memberId, date, status) => {
    const payload = { memberId, date, status };
    dispatch({
      type: 'UPDATE_MEMBER_AVAILABILITY',
      payload,
      // AppContext의 현재 reducer가 읽는 필드와도 호환
      ...payload,
    });
  };

  const externalBandMembers = Object.values(bandMembers || {})
    .filter(member => member?.type === 'external' && member.id)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));

  const getNextExternalBandMemberId = () => {
    const usedNumbers = externalBandMembers
      .map(member => String(member.id).match(/^external:ext(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);
    const nextNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
    return `external:ext${String(nextNumber).padStart(2, '0')}`;
  };

  const handleSaveExternalBandMember = (e) => {
    e.preventDefault();
    const name = externalBandName.trim();
    if (!name || !isAdmin) return;

    if (editingExternalBandMemberId) {
      const existing = bandMembers[editingExternalBandMemberId];
      if (existing) {
        dispatch({
          type: 'UPDATE_BAND_MEMBER',
          bandMember: { ...existing, name },
        });
      }
    } else {
      const id = getNextExternalBandMemberId();
      dispatch({
        type: 'ADD_BAND_MEMBER',
        bandMember: { id, type: 'external', name },
      });
    }

    setExternalBandName('');
    setEditingExternalBandMemberId(null);
  };

  const handleEditExternalBandMember = (bandMember) => {
    if (!isAdmin) return;
    setEditingExternalBandMemberId(bandMember.id);
    setExternalBandName(bandMember.name || '');
  };

  const handleDeleteExternalBandMember = (bandMember) => {
    if (!isAdmin) return;
    if (!window.confirm(`외부 참여자 "${bandMember.name}"을(를) 삭제하시겠습니까?`)) return;
    dispatch({ type: 'DELETE_BAND_MEMBER', bandMemberId: bandMember.id });
    if (editingExternalBandMemberId === bandMember.id) {
      setExternalBandName('');
      setEditingExternalBandMemberId(null);
    }
  };

  const updateBandMemberAvailability = (bandMemberId, date, status) => {
    dispatch({
      type: 'UPDATE_BAND_MEMBER_AVAILABILITY',
      bandMemberId,
      date,
      status,
    });
  };

  // 파트 순 + 이름 가나다 순 + 필터 (검색어 포함)
  const filtered = sortByPartAndName(
    members
      .filter(m => showInactive || m.status === 'active')
      .filter(m => partFilter === '전체' || m.part === partFilter)
      .filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const counts = {
    total:   members.filter(m => m.status === 'active').length,
    VOIX:    members.filter(m => m.status === 'active' && m.part === 'VOIX').length,
    DANCE:   members.filter(m => m.status === 'active' && m.part === 'DANCE').length,
    SESSION: members.filter(m => m.status === 'active' && m.part === 'SESSION').length,
  };

  return (
    <div className="page fade-in">
      {/* 인원 요약 */}
      {view === '회원 목록' && (
        <div className="card card-pad">
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <span className="card-title" style={{ margin: 0 }}>인원 현황</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue-500)' }}>{counts.total}명</span>
          </div>
          <div className="member-count-row">
            <div className="member-count-chip" style={{ background: 'var(--voix-bg)', color: 'var(--voix-color)' }}>
              VOIX <strong>{counts.VOIX}</strong>
            </div>
            <div className="member-count-chip" style={{ background: 'var(--dance-bg)', color: 'var(--dance-color)' }}>
              DANCE <strong>{counts.DANCE}</strong>
            </div>
            <div className="member-count-chip" style={{ background: 'var(--session-bg)', color: 'var(--session-color)' }}>
              SESSION <strong>{counts.SESSION}</strong>
            </div>
          </div>
        </div>
      )}

      {/* 공연 목록 */}
      {view === '공연별 현황' && (
        <div className="card card-pad" style={{ paddingBottom: 14 }}>
          <div className="flex-between" style={{ marginBottom: 10 }}>
            <span className="card-title" style={{ margin: 0 }}>공연 일정</span>
            {isAdmin && (
              <button className="btn-sm" onClick={() => setShowAddPerf(true)}>+ 공연 추가</button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {performances.length === 0 && (
              <span className="text-muted">등록된 공연이 없습니다</span>
            )}
            {performances.map(p => (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--slate-100)', borderRadius: 99, padding: '4px 10px 4px 14px' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.key.replace(/-/g, '.')}</span>
                {isAdmin && (
                  <button onClick={() => handleDeletePerf(p.key)}
                    style={{ background: 'none', border: 'none', color: 'var(--slate-400)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 회원 목록 뷰 ===== */}
      {view === '회원 목록' && (
        <>
          {/* 고정(Sticky) 상단 필터 바 */}
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="flex-between" style={{ gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <span className="card-title" style={{ margin: 0 }}>밴드 참여자</span>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  정식 회원과 외부 밴드 참여자를 동아리 회원 데이터와 분리해 관리합니다.
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--slate-700)', marginBottom: 8 }}>정식 회원</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {members.filter(member => member.status === 'active').map(member => (
                  <span key={member.id} className="member-count-chip" style={{ background: 'var(--slate-100)', color: 'var(--slate-700)' }}>
                    {member.name}
                  </span>
                ))}
                {members.filter(member => member.status === 'active').length === 0 && (
                  <span className="text-muted" style={{ fontSize: 13 }}>활성 정식 회원이 없습니다.</span>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--slate-700)', marginBottom: 8 }}>외부 참여자</div>
              {externalBandMembers.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>등록된 외부 참여자가 없습니다.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {externalBandMembers.map(bandMember => (
                    <div key={bandMember.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', border: '1px solid var(--slate-100)', borderRadius: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate-800)' }}>{bandMember.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>{bandMember.id}</div>
                      </div>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button type="button" className="btn-secondary" style={{ padding: '5px 8px', fontSize: 11 }} onClick={() => handleEditExternalBandMember(bandMember)}>수정</button>
                          <button type="button" className="btn-secondary" style={{ padding: '5px 8px', fontSize: 11, color: 'var(--red-500)' }} onClick={() => handleDeleteExternalBandMember(bandMember)}>삭제</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isAdmin && (
                <form onSubmit={handleSaveExternalBandMember} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={externalBandName}
                    onChange={e => setExternalBandName(e.target.value)}
                    placeholder="외부 참여자 이름"
                    aria-label="외부 참여자 이름"
                    style={{ flex: '1 1 180px', minWidth: 0, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--slate-200)' }}
                  />
                  <button type="submit" className="btn-primary" style={{ flex: '0 0 auto' }}>
                    {editingExternalBandMemberId ? '저장' : '추가'}
                  </button>
                  {editingExternalBandMemberId && (
                    <button type="button" className="btn-secondary" onClick={() => { setExternalBandName(''); setEditingExternalBandMemberId(null); }}>
                      취소
                    </button>
                  )}
                </form>
              )}
            </div>
          </div>

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="flex-between" style={{ gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <span className="card-title" style={{ margin: 0 }}>외부 참여자 일정 가능 여부</span>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>선택한 주의 날짜별 상태를 직접 입력합니다.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button type="button" className="btn-sm" onClick={() => shiftAvailabilityWeek(-1)}>이전 주</button>
                <button type="button" className="btn-sm" onClick={() => setAvailabilityWeekStart(getWeekStart(new Date()))}>이번 주</button>
                <button type="button" className="btn-sm" onClick={() => shiftAvailabilityWeek(1)}>다음 주</button>
              </div>
            </div>

            {externalBandMembers.length === 0 ? (
              <div className="text-muted" style={{ padding: '12px 0', textAlign: 'center' }}>외부 참여자를 먼저 추가해주세요.</div>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <div style={{ minWidth: 760 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.2fr) repeat(7, minmax(82px, 1fr))', gap: 6, marginBottom: 6 }}>
                    <div style={{ padding: '8px 6px', fontSize: 12, fontWeight: 800, color: 'var(--slate-500)' }}>외부 참여자</div>
                    {availabilityDates.map(date => (
                      <div key={toDateKey(date)} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--slate-500)' }}>
                        {formatAvailabilityDate(date)}
                      </div>
                    ))}
                  </div>

                  {externalBandMembers.map(bandMember => (
                    <div key={bandMember.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.2fr) repeat(7, minmax(82px, 1fr))', gap: 6, alignItems: 'center', borderTop: '1px solid var(--slate-100)' }}>
                      <div style={{ padding: '8px 6px', minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--slate-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bandMember.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>외부 참여자</div>
                      </div>
                      {availabilityDates.map(date => {
                        const dateKey = toDateKey(date);
                        const status = bandMemberAvailability?.[bandMember.id]?.[dateKey] || 'undecided';
                        return (
                          <div key={`${bandMember.id}-${dateKey}`} style={{ padding: '6px 0' }}>
                            <select
                              value={status}
                              onChange={e => updateBandMemberAvailability(bandMember.id, dateKey, e.target.value)}
                              aria-label={`${bandMember.name} ${dateKey} 일정 가능 여부`}
                              className="search-input"
                              style={{ width: '100%', minWidth: 0, padding: '7px 4px', fontSize: 11, textAlign: 'center' }}
                            >
                              {AVAILABILITY_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="filter-bar-sticky">
            {/* 윗줄 (Top Row): 전체 너비 검색창 */}
            <div className="filter-bar-top-row">
              <div className="search-input-wrapper">
                <svg className="search-icon" viewBox="0 0 24 24">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input 
                  type="text" 
                  placeholder="이름으로 검색" 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                  className="search-input"
                />
              </div>
            </div>

            {/* 아랫줄 (Bottom Row): 파트 필터 및 토글 스위치 */}
            <div className="filter-bar-bottom-row">
              <div className="part-filters">
                {PARTS.map(p => (
                  <button 
                    key={p} 
                    className={`filter-chip ${partFilter === p ? 'active' : ''}`}
                    onClick={() => setPartFilter(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="filter-actions-right">
                <div className="toggle-switch-wrapper" onClick={() => setShowInactive(v => !v)}>
                  <span className="toggle-label">탈퇴 회원 포함</span>
                  <div className={`toggle-switch ${showInactive ? 'active' : ''}`}>
                    <div className="toggle-handle" />
                  </div>
                </div>
                {isAdmin && (
                  <button className="btn-sm" onClick={() => setModal('add')}>
                    + 회원 추가
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 회원별 일정 가능 여부 */}
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="flex-between" style={{ gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <span className="card-title" style={{ margin: 0 }}>일정 가능 여부</span>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>선택한 날짜의 회원별 상태를 직접 입력합니다.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button type="button" className="btn-sm" onClick={() => shiftAvailabilityWeek(-1)}>이전 주</button>
                <button type="button" className="btn-sm" onClick={() => setAvailabilityWeekStart(getWeekStart(new Date()))}>이번 주</button>
                <button type="button" className="btn-sm" onClick={() => shiftAvailabilityWeek(1)}>다음 주</button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 760 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.2fr) repeat(7, minmax(82px, 1fr))', gap: 6, marginBottom: 6 }}>
                  <div style={{ padding: '8px 6px', fontSize: 12, fontWeight: 800, color: 'var(--slate-500)' }}>회원</div>
                  {availabilityDates.map(date => (
                    <div key={toDateKey(date)} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--slate-500)' }}>
                      {formatAvailabilityDate(date)}
                    </div>
                  ))}
                </div>

                {filtered.length === 0 ? (
                  <div className="text-muted" style={{ padding: '18px 6px', textAlign: 'center' }}>표시할 회원이 없습니다.</div>
                ) : (
                  filtered.map(member => (
                    <div key={member.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.2fr) repeat(7, minmax(82px, 1fr))', gap: 6, alignItems: 'center', borderTop: '1px solid var(--slate-100)' }}>
                      <div style={{ padding: '8px 6px', minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--slate-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>{member.part}</div>
                      </div>
                      {availabilityDates.map(date => {
                        const dateKey = toDateKey(date);
                        const status = memberAvailability?.[member.id]?.[dateKey] || 'undecided';
                        return (
                          <div key={`${member.id}-${dateKey}`} style={{ padding: '6px 0' }}>
                            <select
                              value={status}
                              onChange={e => updateMemberAvailability(member.id, dateKey, e.target.value)}
                              aria-label={`${member.name} ${dateKey} 일정 가능 여부`}
                              className="search-input"
                              style={{ width: '100%', minWidth: 0, padding: '7px 4px', fontSize: 11, textAlign: 'center' }}
                            >
                              {AVAILABILITY_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 데스크톱 테이블 뷰 */}
          <div className="desktop-member-table">
            <div className="table-header-row">
              <div className="col-name">이름</div>
              <div className="col-part">파트</div>
              <div className="col-joindate">가입일</div>
              <div className="col-status">상태</div>
              <div className="col-action"></div>
            </div>
            <div className="table-body">
              {filtered.map(m => {
                const isExpanded = !!expandedMembers[m.id];
                const isInactive = m.status === 'inactive' || !!m.leaveDate;
                return (
                  <div key={m.id} className={`member-row-wrapper ${isInactive ? 'inactive-member' : ''}`}>
                    <div className="member-table-row" onClick={() => toggleExpand(m.id)}>
                      <div className="col-name">
                        <span className={`member-name ${isInactive ? 'strike-name' : ''}`}>{m.name}</span>
                      </div>
                      <div className="col-part">
                        <span className={`badge badge-${m.part.toLowerCase()}`}>{m.part}</span>
                      </div>
                      <div className="col-joindate">
                        {m.joinDate?.replace(/-/g, '.')}
                      </div>
                      <div className="col-status">
                        {isInactive ? (
                          <span className="badge badge-gray">탈퇴</span>
                        ) : (
                          <span className="badge badge-success-light">활동 회원</span>
                        )}
                      </div>
                      <div className="col-action">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {isAdmin && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setModal(m); }}
                              className="edit-icon-btn"
                              title="회원 수정"
                            >
                              ✎
                            </button>
                          )}
                          <span className={`chevron-icon ${isExpanded ? 'rotated' : ''}`}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 9l-7 7-7-7" />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* 데스크톱 아코디언 상세 내역 */}
                    <div className={`accordion-details ${isExpanded ? 'expanded' : ''}`}>
                      <div className="accordion-inner">
                        <div className="desktop-detail-grid">
                          <div className="detail-meta">
                            <div className="meta-item">
                              <span className="meta-label">가입일</span>
                              <span className="meta-val">{m.joinDate}</span>
                            </div>
                            {isInactive && (
                              <div className="meta-item">
                                <span className="meta-label">탈퇴일</span>
                                <span className="meta-val">{m.leaveDate || '-'}</span>
                              </div>
                            )}
                          </div>
                          <div className="detail-perfs">
                            <h4 className="detail-subtitle">역대 공연 참여 현황</h4>
                            {performances.length === 0 ? (
                              <span className="text-muted" style={{ fontSize: 12 }}>등록된 공연이 없습니다.</span>
                            ) : (
                              <div className="perf-history-grid">
                                {performances.map(p => {
                                  const joinDateStr = m.joinDate || '9999-99-99';
                                  const joinedAfter = joinDateStr > p.key;
                                  const participated = m.performances?.[p.key] === '참여';
                                  
                                  let statusText = '참여';
                                  let badgeClass = 'badge-success-light';
                                  if (joinedAfter) {
                                    statusText = '가입 전';
                                    badgeClass = 'badge-gray-light';
                                  } else if (!participated) {
                                    statusText = '미참여';
                                    badgeClass = 'badge-danger-light';
                                  }

                                  return (
                                    <div 
                                      key={p.key} 
                                      className="perf-grid-item" 
                                      onClick={(e) => togglePerformance(e, m, p.key)}
                                      style={{ cursor: 'pointer' }}
                                      title={rawIsAdmin ? "클릭하여 참여 상태 토글" : ""}
                                    >
                                      <span className="perf-label">{p.label}</span>
                                      <span className={`badge ${badgeClass}`}>
                                        {statusText}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 모바일 카드 리스트 뷰 */}
          <div className="mobile-member-list">
            {filtered.map(m => {
              const isExpanded = !!expandedMembers[m.id];
              const isInactive = m.status === 'inactive' || !!m.leaveDate;
              return (
                <div 
                  key={m.id} 
                  className={`member-mobile-card ${isInactive ? 'inactive-member' : ''}`}
                  onClick={() => toggleExpand(m.id)}
                >
                  <div className="card-summary-row">
                    <div className="card-left-info">
                      <span className={`badge badge-${m.part.toLowerCase()}`}>{m.part}</span>
                      <span className={`member-name ${isInactive ? 'strike-name' : ''}`}>{m.name}</span>
                      <span className="join-date-sub">({m.joinDate?.slice(2).replace(/-/g, '.')})</span>
                    </div>
                    <div className="card-right-info">
                      {isInactive && <span className="badge badge-gray" style={{ fontSize: 9, padding: '2px 4px' }}>탈퇴</span>}
                      <span className={`chevron-icon ${isExpanded ? 'rotated' : ''}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  
                  {/* 모바일 아코디언 상세 내역 */}
                  <div className={`accordion-details ${isExpanded ? 'expanded' : ''}`} onClick={e => e.stopPropagation()}>
                    <div className="accordion-inner">
                      <div className="member-details-info">
                        <p><strong>가입일 :</strong> {m.joinDate}</p>
                        {isInactive && <p><strong>탈퇴일 :</strong> {m.leaveDate || '-'}</p>}
                      </div>
                      <div className="divider" />
                      <h4 className="detail-subtitle">역대 공연 참여 현황</h4>
                      {performances.length === 0 ? (
                        <div className="text-muted" style={{ fontSize: 12, padding: '8px 0' }}>등록된 공연이 없습니다.</div>
                      ) : (
                        <div className="perf-history-list">
                          {performances.map(p => {
                            const joinDateStr = m.joinDate || '9999-99-99';
                            const joinedAfter = joinDateStr > p.key;
                            const participated = m.performances?.[p.key] === '참여';
                            
                            let statusText = '참여';
                            let badgeClass = 'badge-success-light';
                            if (joinedAfter) {
                              statusText = '가입 전';
                              badgeClass = 'badge-gray-light';
                            } else if (!participated) {
                              statusText = '미참여';
                              badgeClass = 'badge-danger-light';
                            }

                            return (
                              <div key={p.key} className="perf-history-item">
                                <span className="perf-label">{p.label}</span>
                                <span className={`badge ${badgeClass}`} style={{ whiteSpace: 'nowrap' }}>{statusText}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {isAdmin && (
                        <div className="mobile-admin-actions">
                          <button 
                            type="button"
                            className="btn-secondary btn-sm-action"
                            onClick={(e) => { e.stopPropagation(); setModal(m); }}
                          >
                            회원 정보 수정
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ===== 공연별 현황 뷰 ===== */}
      {view === '공연별 현황' && (
        <PerfView performances={performances} members={members} onToggle={togglePerformance} />
      )}

      {modal && (
        <MemberFormModal
          member={modal === 'add' ? null : modal}
          performances={performances}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {showAddPerf && (
        <AddPerfModal
          existing={performances}
          onSave={handleAddPerf}
          onClose={() => setShowAddPerf(false)}
        />
      )}
    </div>
  );
}
// Trigger HMR
