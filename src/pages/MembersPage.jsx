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
function PerfView({ performances, members, onToggle }) {
  const [selectedPerf, setSelectedPerf] = useState(performances[0]?.key ?? null);

  if (performances.length === 0) {
    return (
      <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--slate-400)', padding: 40 }}>
        등록된 공연이 없습니다.
      </div>
    );
  }

  const perf = performances.find(p => p.key === selectedPerf);

  // 해당 공연 시점에 가입해 있던 회원만 대상
  const eligible = sortByPartAndName(members.filter(m => {
    const joinDateStr = m.joinDate || '9999-99-99';
    return joinDateStr <= selectedPerf;
  }));
  const participated  = eligible.filter(m => m.performances?.[selectedPerf] === '참여');
  const notParticipated = eligible.filter(m => m.performances?.[selectedPerf] !== '참여');

  const pct = eligible.length > 0 ? Math.round((participated.length / eligible.length) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 공연 탭 선택 */}
      <div className="segmented-control" style={{ overflowX: 'auto', whiteSpace: 'nowrap', display: 'flex' }}>
        {performances.map(p => (
          <button key={p.key}
            className={`segment-btn ${selectedPerf === p.key ? 'active' : ''}`}
            onClick={() => setSelectedPerf(p.key)}>
            {p.key.replace(/-/g, '.')}
          </button>
        ))}
      </div>

      {perf && (
        <>
          {/* 요약 카드 */}
          <div className="card card-pad">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{perf.key.replace(/-/g, '.')}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue-500)' }}>{pct}%</span>
            </div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--blue-500)' }} /></div>
            <div className="flex-between" style={{ marginTop: 10, fontSize: 13, color: 'var(--slate-500)' }}>
              <span>대상 <strong style={{ color: 'var(--slate-700)' }}>{eligible.length}명</strong></span>
              <span>참여 <strong style={{ color: 'var(--emerald-500)' }}>{participated.length}명</strong></span>
              <span>미참여 <strong style={{ color: 'var(--rose-500)' }}>{notParticipated.length}명</strong></span>
            </div>
          </div>

          {/* 참여자 목록 */}
          <div className="card">
            <div style={{ padding: '10px 16px', background: 'var(--emerald-50)', borderBottom: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--emerald-600)' }}>✓ 참여</span>
              <span className="badge badge-success">{participated.length}명</span>
            </div>
            {participated.length === 0
              ? <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: 'var(--slate-400)' }}>참여자 없음</div>
              : participated.map(m => (
                  <div key={m.id} 
                       style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--slate-100)', cursor: (window.innerWidth >= 768) ? 'pointer' : 'default' }}
                       onClick={(e) => onToggle(e, m, selectedPerf)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                      {m.status === 'inactive' && <span className="badge badge-gray">탈퇴</span>}
                    </div>
                    <span className={`badge badge-${m.part.toLowerCase()}`}>{m.part}</span>
                  </div>
                ))
            }
          </div>

          {/* 미참여자 목록 */}
          <div className="card">
            <div style={{ padding: '10px 16px', background: 'var(--rose-50)', borderBottom: '1px solid #fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rose-600)' }}>✗ 미참여</span>
              <span className="badge badge-danger">{notParticipated.length}명</span>
            </div>
            {notParticipated.length === 0
              ? <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: 'var(--slate-400)' }}>전원 참여</div>
              : notParticipated.map(m => (
                  <div key={m.id} 
                       style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--slate-100)', cursor: (window.innerWidth >= 768) ? 'pointer' : 'default' }}
                       onClick={(e) => onToggle(e, m, selectedPerf)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                      {m.status === 'inactive' && <span className="badge badge-gray">탈퇴</span>}
                    </div>
                    <span className={`badge badge-${m.part.toLowerCase()}`}>{m.part}</span>
                  </div>
                ))
            }
          </div>
        </>
      )}
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
  const [showInactive, setShowInactive] = useState(false);
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

  // 파트 순 + 이름 가나다 순 + 필터
  const filtered = sortByPartAndName(
    members
      .filter(m => showInactive || m.status === 'active')
      .filter(m => partFilter === '전체' || m.part === partFilter)
  );

  const grouped = {
    VOIX:    filtered.filter(m => m.part === 'VOIX'),
    DANCE:   filtered.filter(m => m.part === 'DANCE'),
    SESSION: filtered.filter(m => m.part === 'SESSION'),
  };

  const counts = {
    total:   members.filter(m => m.status === 'active').length,
    VOIX:    members.filter(m => m.status === 'active' && m.part === 'VOIX').length,
    DANCE:   members.filter(m => m.status === 'active' && m.part === 'DANCE').length,
    SESSION: members.filter(m => m.status === 'active' && m.part === 'SESSION').length,
  };

  return (
    <div className="page fade-in">
      {/* 뷰 전환 탭 (맨 상단으로 이동) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <div className="segmented-control">
          {VIEWS.map(v => (
            <button key={v}
              className={`segment-btn ${view === v ? 'active' : ''}`}
              onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
      </div>

      {/* 인원 요약 */}
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

      {/* 공연 목록 */}
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

      {/* ===== 회원 목록 뷰 ===== */}
      {view === '회원 목록' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {PARTS.map(p => (
                <button key={p} className={`filter-chip ${partFilter === p ? 'active' : ''}`}
                  style={{ padding: '6px 12px', fontSize: 12, margin: 0 }}
                  onClick={() => setPartFilter(p)}>{p}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--slate-600)', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={showInactive} onChange={() => setShowInactive(v => !v)} style={{ width: 14, height: 14, accentColor: 'var(--blue-500)', cursor: 'pointer' }} />
                탈퇴 포함
              </label>
              {isAdmin && <button className="btn-sm" onClick={() => setModal('add')}>+ 추가</button>}
            </div>
          </div>

          {Object.entries(grouped).map(([part, list]) => (
            list.length > 0 && (
              <div key={part} className="card" style={{ overflowX: 'auto' }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', background: 'var(--slate-50)', borderBottom: '1px solid var(--slate-100)', minWidth: 'max-content' }}>
                  <div style={{ width: 80, flexShrink: 0 }}>
                    <span className={`badge badge-${part.toLowerCase()}`} style={{ padding: '2px 6px', fontSize: 10 }}>{part}</span>
                    <span className="text-muted" style={{ fontSize: 11, marginLeft: 4 }}>{list.length}명</span>
                  </div>
                  <div style={{ width: 75, flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--slate-500)', textAlign: 'center', letterSpacing: '.2px' }}>가입일</div>
                  {performances.map(p => (
                    <div key={p.key} style={{ width: 64, flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--slate-500)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</div>
                  ))}
                  <div style={{ width: 30, flexShrink: 0 }} />
                </div>

                {/* 행 */}
                {list.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--slate-100)', minWidth: 'max-content', transition: 'background .12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--slate-50)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    {/* 이름 */}
                    <div style={{ width: 80, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                      {m.status === 'inactive' && <span className="badge badge-gray" style={{ fontSize: 9, padding: '1px 3px' }}>탈퇴</span>}
                    </div>
                    {/* 가입일 */}
                    <div style={{ width: 75, flexShrink: 0, fontSize: 11, color: 'var(--slate-500)', textAlign: 'center' }}>
                      {m.joinDate?.slice(2).replace(/-/g, '.')}
                    </div>
                    {/* 공연 참여 토글 */}
                    {performances.map(p => {
                      const joinDateStr = m.joinDate || '9999-99-99';
                      const joinedAfter = joinDateStr > p.key;
                      const participated = m.performances?.[p.key] === '참여';
                      return (
                        <div key={p.key} style={{ width: 64, flexShrink: 0, textAlign: 'center' }}>
                          {joinedAfter ? (
                            <span style={{ fontSize: 11, color: 'var(--slate-300)', fontWeight: 500 }}>—</span>
                          ) : (
                            <button
                              onClick={(e) => togglePerformance(e, m, p.key)}
                              style={{
                                padding: '2px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700, border: 'none',
                                cursor: (window.innerWidth >= 768) ? 'pointer' : 'default',
                                background: participated ? 'var(--emerald-50)' : 'var(--rose-50)',
                                color: participated ? 'var(--emerald-600)' : 'var(--rose-400)',
                                transition: 'all .15s',
                                minWidth: 40,
                              }}>
                              {participated ? '참여' : '미참'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {/* 수정 버튼 */}
                    <div style={{ width: 30, flexShrink: 0, textAlign: 'right' }}>
                      {isAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); setModal(m); }}
                          style={{ background: 'none', border: 'none', color: 'var(--slate-400)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✎</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ))}
        </>
      )}

      {/* ===== 공연별 현황 뷰 ===== */}
      {view === '공연별 현황' && (
        <PerfView performances={performances} members={members.filter(m => showInactive || m.status === 'active')} onToggle={togglePerformance} />
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
