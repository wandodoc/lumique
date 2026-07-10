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

  return (
    <div className="perf-board-layout">
      {performances.map(p => {
        const isExpanded = !!expandedPerfs[p.key];
        const participated = members.filter(m => m.performances?.[p.key] === '참여');
        
        // 파트별 참여자 카운트
        const counts = {
          VOIX: participated.filter(m => m.part === 'VOIX').length,
          DANCE: participated.filter(m => m.part === 'DANCE').length,
          SESSION: participated.filter(m => m.part === 'SESSION').length,
        };

        const voixMembers = participated.filter(m => m.part === 'VOIX');
        const danceMembers = participated.filter(m => m.part === 'DANCE');
        const sessionMembers = participated.filter(m => m.part === 'SESSION');

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
  const { members, performances } = state;

  const [partFilter, setPartFilter] = useState('전체');
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState({});
  const [modal, setModal] = useState(null);
  const [showAddPerf, setShowAddPerf] = useState(false);
  const [view, setView] = useState(initialView);

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
          <div className="filter-bar-sticky">
            <div className="filter-bar-main">
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
            </div>
            <div className="filter-bar-sub">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={showInactive} 
                  onChange={() => setShowInactive(v => !v)} 
                />
                탈퇴 회원 포함
              </label>
              {isAdmin && (
                <button className="btn-sm" onClick={() => setModal('add')}>
                  + 회원 추가
                </button>
              )}
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
