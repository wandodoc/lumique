import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import './PageStyles.css';

export default function CalendarPage() {
  const { state } = useApp();
  const members = state?.members || [];
  const [activeSubTab, setActiveSubTab] = useState('calendar'); // 'calendar' | 'songs' | 'settlement'
  const { id: detailId } = useParams();
  const navigate = useNavigate();

  // 1. 곡 마스터 데이터 (Clean State)
  const [songs, setSongs] = useState(() => {
    const saved = localStorage.getItem('lumique_songs');
    return saved ? JSON.parse(saved) : [];
  });

  // 2. 일정 데이터 (Clean State)
  const [activities, setActivities] = useState(() => {
    const saved = localStorage.getItem('lumique_activities');
    return saved ? JSON.parse(saved) : [];
  });

  const saveSongs = (list) => {
    setSongs(list);
    localStorage.setItem('lumique_songs', JSON.stringify(list));
  };

  const saveActivities = (list) => {
    setActivities(list);
    localStorage.setItem('lumique_activities', JSON.stringify(list));
  };

  // --- 곡 마스터 관련 상태 및 핸들러 ---
  const [editingSongId, setEditingSongId] = useState(null);
  const [songTitle, setSongTitle] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const [selectedSongMembers, setSelectedSongMembers] = useState([]);
  const [songRegularDay, setSongRegularDay] = useState('월요일');
  const [songStatus, setSongStatus] = useState('시작전');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const handleToggleMember = (memberName) => {
    setSelectedSongMembers(prev => 
      prev.includes(memberName) 
        ? prev.filter(m => m !== memberName) 
        : [...prev, memberName]
    );
  };

  const handleAddSong = (e) => {
    e.preventDefault();
    if (!songTitle.trim()) return alert('곡명을 입력해 주세요.');

    const newSong = {
      id: editingSongId || `song-${Date.now()}`,
      title: songTitle.trim(),
      artist: songArtist.trim(),
      members: selectedSongMembers,
      memberCount: selectedSongMembers.length,
      regularDay: songRegularDay,
      musicStatus: songStatus
    };

    if (editingSongId) {
      saveSongs(songs.map(s => s.id === editingSongId ? newSong : s));
    } else {
      saveSongs([...songs, newSong]);
    }
    
    setEditingSongId(null);
    setSongTitle('');
    setSongArtist('');
    setSelectedSongMembers([]);
    setSongRegularDay('월요일');
    setSongStatus('시작전');
  };

  const handleEditSong = (s) => {
    setEditingSongId(s.id);
    setSongTitle(s.title);
    setSongArtist(s.artist || '');
    setSelectedSongMembers(s.members || []);
    setSongRegularDay(s.regularDay || '월요일');
    setSongStatus(s.musicStatus || '시작전');
    setActiveSubTab('songs');
    window.scrollTo(0, 0);
  };

  const handleDeleteSong = (id) => {
    if (!window.confirm('곡 마스터를 삭제하시겠습니까? 관련 일정의 곡 정보는 유지됩니다.')) return;
    saveSongs(songs.filter(s => s.id !== id));
  };

  // --- 일정 관련 상태 및 핸들러 ---
  const [actTitle, setActTitle] = useState('');
  const [actDate, setActDate] = useState('');
  const [actLocation, setActLocation] = useState('');
  const [actSongId, setActSongId] = useState('');
  const [actRound, setActRound] = useState(1);
  const [actPlan, setActPlan] = useState('');
  const [actCost, setActCost] = useState(0);
  const [actBooker, setActBooker] = useState('');
  const [actStatus, setActStatus] = useState('해당없음');
  const [showAddActModal, setShowAddActModal] = useState(false);
  const [editingActId, setEditingActId] = useState(null);
  const [isActSaving, setIsActSaving] = useState(false);

  const handleEditActivity = (act) => {
    setEditingActId(act.id);
    setActTitle(act.title);
    setActDate(act.date);
    setActLocation(act.location);
    setActSongId(act.songId === '해당없음' ? '' : act.songId);
    setActRound(act.round);
    setActPlan(act.plan || '');
    setActCost(act.cost || 0);
    setActBooker(act.booker || '');
    setActStatus(act.status || '해당없음');
    setShowAddActModal(true);
  };
  
  // 곡 필터 상태
  const [filterSongId, setFilterSongId] = useState('');

  // 네오관 5회 대관 초과 검증 로직
  const checkNeoLimit = (dateStr, locationStr, currentActId = null) => {
    if (!locationStr.includes('네오관')) return true;

    // 해당 연월 계산 (YYYY-MM)
    const targetYm = dateStr.slice(0, 7);

    // 해당 월의 기존 네오관 대여 횟수 합산 (현재 수정 중인 일정 ID는 제외)
    const neoActsInMonth = activities.filter(act => {
      if (currentActId && act.id === currentActId) return false;
      return act.date.slice(0, 7) === targetYm && act.location.includes('네오관');
    });

    // 이번 추가/수정을 포함하여 5회를 초과하게 되는지 검증 (기존 건수 + 1)
    if (neoActsInMonth.length + 1 > 5) {
      alert('학교 연습실(네오관)은 월 대관 제한 5회를 초과할 수 없습니다.');
      return false;
    }
    return true;
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!actTitle.trim() || !actDate || !actLocation.trim()) {
      return alert('필수 항목(일정명, 일시, 장소)을 입력해 주세요.');
    }

    // 네오관 대관 횟수 한도 체크
    if (!checkNeoLimit(actDate, actLocation, editingActId)) return;

    setIsActSaving(true);

    const newAct = {
      id: editingActId || `act-${Date.now()}`,
      title: actTitle.trim(),
      date: actDate,
      location: actLocation.trim(),
      songId: actSongId || '해당없음',
      round: Number(actRound) || 1,
      plan: actPlan.trim(),
      cost: Number(actCost) || 0,
      booker: actBooker.trim() || '해당없음',
      status: actStatus
    };

    // 로딩 시뮬레이션 (UX 향상)
    await new Promise(resolve => setTimeout(resolve, 300));

    if (editingActId) {
      saveActivities(activities.map(a => a.id === editingActId ? newAct : a).sort((a, b) => a.date.localeCompare(b.date)));
    } else {
      saveActivities([...activities, newAct].sort((a, b) => a.date.localeCompare(b.date)));
    }
    
    // 상태 초기화
    setEditingActId(null);
    setActTitle('');
    setActDate('');
    setActLocation('');
    setActSongId('');
    setActRound(1);
    setActPlan('');
    setActCost(0);
    setActBooker('');
    setActStatus('해당없음');
    setShowAddActModal(false);
    setIsActSaving(false);
  };

  const handleDeleteActivity = (id) => {
    if (!window.confirm('일정을 삭제하시겠습니까?')) return;
    saveActivities(activities.filter(a => a.id !== id));
  };

  // --- 월말 정산 센터 관련 상태 및 로직 ---
  const [settleYear, setSettleYear] = useState(2026);
  const [settleMonth, setSettleMonth] = useState(7);

  // 연월에 필터링된 정산대기 대상
  const targetYmStr = `${settleYear}-${String(settleMonth).padStart(2, '0')}`;
  const pendingSettles = activities.filter(act => 
    act.date.slice(0, 7) === targetYmStr && act.status === '정산대기'
  );

  // booker별 그룹핑 및 집계
  const bookerSummary = {};
  pendingSettles.forEach(act => {
    const booker = act.booker || '예약자 미정';
    if (!bookerSummary[booker]) {
      bookerSummary[booker] = { count: 0, totalCost: 0, actIds: [] };
    }
    bookerSummary[booker].count += 1;
    bookerSummary[booker].totalCost += act.cost;
    bookerSummary[booker].actIds.push(act.id);
  });

  const handleSettleComplete = (bookerName, actIds) => {
    if (!window.confirm(`[${bookerName}] 님의 대상 거래들을 '정산완료'로 일괄 변경 처리하시겠습니까?`)) return;
    
    const updated = activities.map(act => 
      actIds.includes(act.id) ? { ...act, status: '정산완료' } : act
    );
    saveActivities(updated);
    alert('정산 처리가 완료되었습니다.');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  // --- 캘린더 날짜 렌더링용 ---
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(7);

  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstDayIndex = new Date(calYear, calMonth - 1, 1).getDay();

  const calendarCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }

  return (
    <div className="page fade-in">
      {/* 서브 탭 네비게이션 */}
      <div className="calendar-tabs">
        {[
          { id: 'calendar', label: '📅 캘린더' },
          { id: 'songs', label: '🎼 셋리스트' },
          { id: 'settlement', label: '💸 월말 정산' }
        ].map(tab => (
          <button key={tab.id}
            onClick={() => {
              setActiveSubTab(tab.id);
              if (tab.id === 'calendar') setFilterSongId(''); // 캘린더 이동 시 필터 리셋
            }}
            className="calendar-tab-btn"
            style={{
              background: activeSubTab === tab.id ? 'var(--blue-500)' : 'transparent',
              color: activeSubTab === tab.id ? '#ffffff' : 'var(--slate-500)'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* --- 1. 연습/공연 캘린더 탭 --- */}
      {activeSubTab === 'calendar' && (
        <div>
          <div className="calendar-main-header">
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, whiteSpace: 'nowrap' }}>📅 연습 & 공연 캘린더</h2>
            
            <div className="calendar-header-controls">
              {/* 곡별 필터 드롭다운 */}
              <select
                value={filterSongId}
                onChange={e => setFilterSongId(e.target.value)}
                className="calendar-select"
              >
                <option value="">🚫 전체 곡 보기</option>
                {songs.map(s => (
                  <option key={s.id} value={s.id}>🎼 {s.title}</option>
                ))}
              </select>

              <button className="calendar-btn calendar-btn-primary" onClick={() => {
                setEditingActId(null);
                setActTitle('');
                setActDate('');
                setActLocation('');
                setActSongId('');
                setActRound(1);
                setActPlan('');
                setActCost(0);
                setActBooker('');
                setActStatus('해당없음');
                setShowAddActModal(true);
              }}>
                + 일정 등록
              </button>
            </div>
          </div>

          <div className="calendar-grid-container">
            {/* 달력 판넬 */}
            <div className="card card-pad calendar-left-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span className="card-title" style={{ fontSize: 16, margin: 0 }}>
                  {calYear}년 {calMonth}월
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-sm" onClick={() => {
                    const today = new Date();
                    setCalYear(today.getFullYear());
                    setCalMonth(today.getMonth() + 1);
                  }} style={{ background: 'var(--slate-100)', color: 'var(--slate-700)', border: 'none' }}>오늘</button>
                  <button className="btn-sm" onClick={() => {
                    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); }
                    else { setCalMonth(m => m - 1); }
                  }}>이전</button>
                  <button className="btn-sm" onClick={() => {
                    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); }
                    else { setCalMonth(m => m + 1); }
                  }}>다음</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--slate-500)', marginBottom: 8 }}>
                {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                  <span key={day} style={{ color: idx === 0 ? 'var(--red-500)' : idx === 6 ? 'var(--blue-500)' : 'inherit' }}>{day}</span>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {calendarCells.map((day, index) => {
                  if (day === null) {
                    return <div key={`empty-${index}`} style={{ aspectRatio: '1', background: '#f8fafc', borderRadius: 8, boxSizing: 'border-box' }} />;
                  }

                  const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayActs = activities.filter(a => {
                    const matchDate = a.date === dateStr;
                    const matchSong = filterSongId ? a.songId === filterSongId : true;
                    return matchDate && matchSong;
                  });

                  const todayObj = new Date();
                  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
                  const isToday = dateStr === todayStr;

                  return (
                    <div key={`day-${day}`} style={{
                      aspectRatio: '1 / 1',
                      background: isToday ? '#eff6ff' : '#ffffff',
                      border: '1px solid',
                      borderColor: isToday ? '#3b82f6' : 'var(--slate-100)',
                      boxShadow: isToday ? 'inset 0 0 0 1px #3b82f6' : 'none',
                      boxSizing: 'border-box',
                      borderRadius: 8,
                      padding: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      overflow: 'hidden',
                      alignItems: 'flex-start'
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isToday ? '#1d4ed8' : 'var(--slate-600)' }}>{day}</span>
                      {dayActs.length > 0 && (
                        <div style={{ 
                          fontSize: '10px', 
                          padding: '2px 4px', 
                          borderRadius: '4px', 
                          backgroundColor: '#f1f5f9',
                          color: '#475569',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer'
                        }} onClick={() => navigate(`/calendar/detail/${dayActs[0].id}`)}>
                          <span style={{ fontWeight: 700, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dayActs[0].title}</span>
                          <small style={{ display: 'block', fontSize: '10px', marginTop: 2, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dayActs[0].location}</small>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 일정 리스트 */}
            <div className="card card-pad calendar-right-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="card-title" style={{ fontSize: 16 }}>일정 리스트 ({calYear}년 {calMonth}월)</span>
              {/* ... (rest of the schedule listing) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {activities
                    .filter(a => {
                      const matchMonth = a.date.slice(0, 7) === `${calYear}-${String(calMonth).padStart(2, '0')}`;
                      const matchSong = filterSongId ? a.songId === filterSongId : true;
                      return matchMonth && matchSong;
                    })
                    .map(act => {
                      const linkedSong = songs.find(s => s.id === act.songId);
                      return (
                        <div key={act.id} style={{
                          padding: 16,
                          borderRadius: 12,
                          border: '1px solid var(--slate-100)',
                          background: '#ffffff',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                backgroundColor: act.location.includes('네오관') ? '#fee2e2' : '#f0f9ff',
                                color: act.location.includes('네오관') ? '#ef4444' : '#0284c7'
                              }}>{act.round}회차</span>
                              <strong style={{ fontSize: 15, color: 'var(--slate-800)' }}>{act.title}</strong>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--slate-500)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span>📅 <strong>일시:</strong> {act.date}</span>
                              <span>📍 <strong>장소:</strong> {act.location}</span>
                              {linkedSong && <span>🎼 <strong>관련 곡:</strong> {linkedSong.title}</span>}
                              {act.plan && <span>📝 <strong>계획:</strong> {act.plan}</span>}
                              {act.cost > 0 && <span>🪙 <strong>대여비:</strong> {(act.cost || 0).toLocaleString()}원 ({act.booker} 예약 / 정산: {act.status})</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 16, paddingLeft: 8 }}>
                            <button onClick={() => handleEditActivity(act)} style={{ background: 'none', border: 'none', color: 'var(--blue-600)', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '8px' }}>수정</button>
                            <button onClick={() => handleDeleteActivity(act.id)} style={{ background: 'none', border: 'none', color: 'var(--red-500)', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '8px' }}>삭제</button>
                          </div>
                        </div>
                      );
                    })}
                </div>
            </div>
          </div>
        </div>
      )}

      {/* --- 2. 곡 마스터 관리 탭 --- */}

      {activeSubTab === 'songs' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* 곡 신규 등록 */}
          <div className="card card-pad">
            <span className="card-title" style={{ fontSize: 16, marginBottom: 0 }}>🎼 {editingSongId ? '곡 마스터 수정' : '신규 곡 마스터 등록'}</span>
            <hr style={{ border: 'none', borderTop: '1px solid var(--slate-100)', margin: '14px 0 20px 0' }} />
            <form onSubmit={handleAddSong} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>곡명 (Title) *</label>
                  <input type="text" value={songTitle} onChange={e => setSongTitle(e.target.value)} placeholder="예: Hype Boy" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>가수 (Artist)</label>
                  <input type="text" value={songArtist} onChange={e => setSongArtist(e.target.value)} placeholder="예: NewJeans" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)', outline: 'none' }} />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>참여 부원 선택 (활동 부원만 대상)</label>
                
                {/* 1. 선택된 부원 칩(Chip) 영역 */}
                {selectedSongMembers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {selectedSongMembers.map(name => (
                      <span key={name} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        backgroundColor: '#f3f4f6',
                        color: '#1f2937',
                        fontSize: '13px',
                        fontWeight: '500',
                        border: '1px solid #e5e7eb'
                      }}>
                        {name}
                        <button type="button" onClick={() => handleToggleMember(name)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '0 0 0 6px', fontSize: '14px', fontWeight: 'bold', lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Autocomplete 컨테이너 */}
                <div style={{ position: 'relative' }}>
                  {/* 2. 이름 검색창 */}
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={e => setMemberSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                    placeholder="🔍 이름으로 부원 검색..."
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--slate-200)',
                      fontSize: 12,
                      outline: 'none'
                    }}
                  />

                  {/* 3. 검색 추천 absolute 드롭다운 */}
                  {(isSearchFocused || memberSearchQuery.trim() !== '') && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: '100%',
                      marginTop: '4px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      zIndex: 50,
                      maxHeight: '192px',
                      overflowY: 'auto',
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      {(() => {
                        const activeMembers = (members || []).filter(m => m.status === 'active');
                        const filtered = activeMembers.filter(m => 
                          m.name.toLowerCase().includes(memberSearchQuery.toLowerCase())
                        );

                        if (filtered.length > 0) {
                          return filtered.map(m => (
                            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }} onMouseDown={e => e.preventDefault()}>
                              <input
                                type="checkbox"
                                checked={selectedSongMembers.includes(m.name)}
                                onChange={() => handleToggleMember(m.name)}
                              />
                              <span>{m.name} ({m.part})</span>
                            </label>
                          ));
                        } else {
                          return <span style={{ fontSize: 12, color: 'var(--slate-400)' }}>검색 결과가 없습니다.</span>;
                        }
                      })()}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>정기 연습 요일</label>
                  <select value={songRegularDay} onChange={e => setSongRegularDay(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }}>
                    {['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'].map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>진행 상태</label>
                  <select value={songStatus} onChange={e => setSongStatus(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }}>
                    <option value="시작전">시작전</option>
                    <option value="진행중">진행중</option>
                    <option value="완료">완료</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                {editingSongId && (
                  <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => {
                    setEditingSongId(null);
                    setSongTitle('');
                    setSongArtist('');
                    setSelectedSongMembers([]);
                    setSongRegularDay('월요일');
                    setSongStatus('시작전');
                  }}>취소</button>
                )}
                <button type="submit" className="btn-primary" style={{ flex: 2 }}>{editingSongId ? '곡 수정하기' : '곡 등록하기'}</button>
              </div>
            </form>
          </div>

          {/* 곡 리스트 */}
          <div className="card card-pad">
            <span className="card-title" style={{ fontSize: 16 }}>등록된 곡 마스터 목록</span>
            {songs.length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>등록된 곡이 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {songs.map(s => (
                  <div key={s.id} style={{
                    padding: 14,
                    borderRadius: 12,
                    border: '1px solid var(--slate-100)',
                    background: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <strong style={{ fontSize: 15, color: 'var(--slate-800)', display: 'block', marginBottom: 4 }}>{s.title} {s.artist && <span style={{ color: 'var(--slate-500)', fontSize: 13 }}>- {s.artist}</span>}</strong>
                      <div style={{ fontSize: 12, color: 'var(--slate-500)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span>👥 <strong>참여 ({s.memberCount}명):</strong> {s.members.join(', ')}</span>
                        <span>📅 <strong>요일:</strong> {s.regularDay}</span>
                        <span>🏷️ <strong>상태:</strong> {s.musicStatus}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleEditSong(s)} style={{ background: 'none', border: 'none', color: 'var(--blue-600)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                        수정
                      </button>
                      <button onClick={() => handleDeleteSong(s.id)} style={{ background: 'none', border: 'none', color: 'var(--red-500)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- 3. 연습실 월말 정산 센터 탭 --- */}
      {activeSubTab === 'settlement' && (
        <div className="card card-pad">
          <div className="flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span className="card-title" style={{ fontSize: 16, margin: 0 }}>💸 연습실 월말 정산 센터</span>
              <p style={{ fontSize: 12, color: 'var(--slate-500)', margin: '4px 0 0 0' }}>예약자별 사비 대관료 내역을 자동 합산하여 일괄 정산 처리합니다.</p>
            </div>
            {/* 정산 연월 선택 */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={settleYear} onChange={e => setSettleYear(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid var(--slate-200)', borderRadius: 8 }}>
                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select value={settleMonth} onChange={e => setSettleMonth(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid var(--slate-200)', borderRadius: 8 }}>
                {Array.from({ length: 12 }, (_, idx) => idx + 1).map(m => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            {Object.keys(bookerSummary).length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: '40px 0' }}>
                {settleYear}년 {settleMonth}월에 해당하는 '정산대기' 상태의 사비 일정 내역이 없습니다.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(bookerSummary).map(([booker, data]) => (
                  <div key={booker} style={{
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--slate-100)',
                    background: 'var(--slate-50)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <strong style={{ fontSize: 16, color: 'var(--slate-800)' }}>👤 {booker}</strong>
                      <span style={{ fontSize: 14, color: 'var(--slate-500)', marginLeft: 12 }}>
                        대관 {data.count}건 / <strong>{(data.totalCost || 0).toLocaleString()}원</strong> 정산 필요
                      </span>
                    </div>
                    <button className="btn-primary"
                      onClick={() => handleSettleComplete(booker, data.actIds)}
                      style={{ padding: '8px 16px', fontSize: 13, background: 'var(--emerald-600)', borderColor: 'var(--emerald-600)' }}
                    >
                      지급 완료
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 일정 등록 모달 */}
      {showAddActModal && (
        <div className="modal-overlay" onClick={() => setShowAddActModal(false)}>
          <div className="modal-sheet" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 0 }}>🗓️ {editingActId ? '연습/공연 일정 수정' : '신규 연습/공연 일정 등록'}</h3>
            <hr style={{ border: 'none', borderTop: '1px solid var(--slate-100)', margin: '14px 0 16px 0' }} />
            <form onSubmit={handleAddActivity} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>일정명 *</label>
                <input type="text" value={actTitle} onChange={e => setActTitle(e.target.value)} placeholder="예: 댄스 파트 보강 연습" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>일시 *</label>
                  <input type="date" value={actDate} onChange={e => setActDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>회차 (Round)</label>
                  <input type="number" value={actRound} onChange={e => setActRound(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>장소 * (네오관 포함 시 월 5회 제한 적용)</label>
                <input type="text" value={actLocation} onChange={e => setActLocation(e.target.value)} placeholder="예: 학교 네오관 4층 세미나룸" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>관련 곡 마스터 매핑</label>
                <select value={actSongId} onChange={e => setActSongId(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }}>
                  <option value="">해당없음</option>
                  {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>연습 계획 (Plan)</label>
                <input type="text" value={actPlan} onChange={e => setActPlan(e.target.value)} placeholder="연습 피드백 범위 및 계획 기술" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>대여 금액 (사비 대관료)</label>
                  <input type="number" value={actCost} onChange={e => setActCost(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>예약자명 (Booker)</label>
                  <input type="text" value={actBooker} onChange={e => setActBooker(e.target.value)} placeholder="예: 조에스더" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>정산 대상 구분</label>
                <select value={actStatus} onChange={e => setActStatus(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }}>
                  <option value="해당없음">해당없음 (공동 지출 등)</option>
                  <option value="정산대기">정산대기 (예약자 선지불 사비건)</option>
                  <option value="정산완료">정산완료</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddActModal(false)} disabled={isActSaving}>취소</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={isActSaving}>
                  {isActSaving ? '저장 중...' : editingActId ? '일정 수정하기' : '일정 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 일정 상세 보기 모달 */}
      {detailId && (() => {
        const act = activities.find(a => a.id === detailId);
        if (!act) return null;
        const linkedSong = songs.find(s => s.id === act.songId);
        
        return (
          <div className="modal-overlay" onClick={() => navigate('/calendar')}>
            <div className="modal-sheet" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
              <div className="modal-handle" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>🗓️ 일정 상세 보기</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--slate-500)' }}>등록된 일정의 세부 정보를 확인합니다.</p>
                </div>
                <button type="button" onClick={() => navigate('/calendar')} className="btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 12 }}>닫기</button>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--slate-100)', margin: '14px 0 16px 0' }} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, backgroundColor: act.location.includes('네오관') ? '#fee2e2' : '#f0f9ff', color: act.location.includes('네오관') ? '#ef4444' : '#0284c7' }}>
                      {act.round}회차
                    </span>
                    <strong style={{ fontSize: 16 }}>{act.title}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                    <span>📅 <strong>일시:</strong> {act.date}</span>
                    <span>📍 <strong>장소:</strong> {act.location}</span>
                    {linkedSong && <span>🎼 <strong>관련 곡:</strong> {linkedSong.title} {linkedSong.artist && `- ${linkedSong.artist}`}</span>}
                    {act.plan && <span>📝 <strong>계획:</strong> {act.plan}</span>}
                    {act.cost > 0 && <span>🪙 <strong>대여비:</strong> {(act.cost || 0).toLocaleString()}원 ({act.booker} 예약 / 정산: {act.status})</span>}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => navigate('/calendar')} className="btn-primary" style={{ flex: 1 }}>확인</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
