import { useState, useEffect } from 'react';
import './PageStyles.css';

// 1. 초기 실데이터 (Notion Seed Data) 정의
const INITIAL_SONGS = [
  { id: 'song-1', title: '소녀시대', memberCount: 5, members: ['강가연', '김민경', '장성윤', '조에스더', '한예린'], regularDay: '토요일', musicStatus: '진행중' },
  { id: 'song-2', title: '내 얘길 들어봐', memberCount: 4, members: ['강가연', '김예은', '박진희', '조에스더'], regularDay: '일요일', musicStatus: '진행중' },
  { id: 'song-3', title: '이효리', memberCount: 6, members: ['김민경', '오정주', '오지영', '이연주', '조에스더', '한예린'], regularDay: '토요일', musicStatus: '완료' },
];

const INITIAL_ACTIVITIES = [
  { id: 'act-1', title: '왕십리_브리츠_대형A 연습', date: '2026-07-04', location: '왕십리_브리츠_대형A', songId: 'song-1', round: 1, plan: '소녀시대 1절 동선 피드백', cost: 18000, booker: '조에스더', status: '정산완료' },
  { id: 'act-2', title: '을지로_연습실 정기연습', date: '2026-07-04', location: '을지로_연습실', songId: 'song-3', round: 2, plan: '이효리 안무 디테일 강화', cost: 19000, booker: '이연주', status: '정산완료' },
  { id: 'act-3', title: '경희대_제이엔터_F홀 전체연습', date: '2026-07-11', location: '경희대_제이엔터_F홀', songId: '', round: 1, plan: '보컬 라이브 조율', cost: 19800, booker: '김민경', status: '정산완료' },
  // 정산대기 테스트 데이터 (2026년 7월분 추가)
  { id: 'act-4', title: '네오관 정기대관 연습', date: '2026-07-18', location: '네오관', songId: 'song-1', round: 3, plan: '소녀시대 완곡 동선 연습', cost: 19000, booker: '조에스더', status: '정산대기' },
  { id: 'act-5', title: '합정 드림홀 연습실 대관', date: '2026-07-20', location: '합정 드림홀 연습실', songId: 'song-2', round: 1, plan: '내 얘길 들어봐 인트로 연습', cost: 20000, booker: '조에스더', status: '정산대기' },
  { id: 'act-6', title: '을지로_연습실 파트연습', date: '2026-07-22', location: '을지로_연습실', songId: 'song-3', round: 3, plan: '이효리 후렴 댄스 연습', cost: 19000, booker: '이연주', status: '정산대기' },
];

export default function CalendarPage() {
  // Songs 마스터 데이터 State
  const [songs] = useState(() => {
    const saved = localStorage.getItem('lumique_songs');
    if (!saved) {
      localStorage.setItem('lumique_songs', JSON.stringify(INITIAL_SONGS));
      return INITIAL_SONGS;
    }
    return JSON.parse(saved);
  });

  // Activities (연습/공연 일정) State
  const [activities, setActivities] = useState(() => {
    const saved = localStorage.getItem('lumique_activities');
    if (!saved) {
      localStorage.setItem('lumique_activities', JSON.stringify(INITIAL_ACTIVITIES));
      return INITIAL_ACTIVITIES;
    }
    return JSON.parse(saved);
  });

  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'settlement' | 'songs'

  // 신규 일정 폼 State
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [newSongId, setNewSongId] = useState('');
  const [newRound, setNewRound] = useState(1);
  const [newPlan, setNewPlan] = useState('');
  const [newCost, setNewCost] = useState(0);
  const [newBooker, setNewBooker] = useState('');
  const [newStatus, setNewStatus] = useState('정산대기');
  const [showAddModal, setShowAddModal] = useState(false);

  // 정산용 필터 연/월
  const [settlementYear, setSettlementYear] = useState(2026);
  const [settlementMonth, setSettlementMonth] = useState(7);

  // 달력용 연/월
  const [calYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(7);

  const saveActivities = (list) => {
    setActivities(list);
    localStorage.setItem('lumique_activities', JSON.stringify(list));
  };

  // 일정 추가 핸들러 (네오관 5회 대관 초과 체크 포함)
  const handleAddActivity = (e) => {
    e.preventDefault();
    if (!newTitle || !newDate || !newLoc) {
      return alert('일정명, 날짜, 장소는 필수 입력 항목입니다.');
    }

    // 네오관 대관 제한 로직
    const isNeo = newLoc.includes('네오관');
    if (isNeo) {
      const targetDate = new Date(newDate);
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth() + 1;

      // 해당 월의 네오관 대관 횟수 카운팅
      const neoCount = activities.filter(act => {
        if (!act.location.includes('네오관')) return false;
        const actDate = new Date(act.date);
        return actDate.getFullYear() === targetYear && (actDate.getMonth() + 1) === targetMonth;
      }).length;

      if (neoCount >= 5) {
        return alert('월 대관 제한 5회를 초과했습니다. 네오관 대관 일정을 추가할 수 없습니다.');
      }
    }

    const newItem = {
      id: `act-${Date.now()}`,
      title: newTitle,
      date: newDate,
      location: newLoc,
      songId: newSongId,
      round: Number(newRound),
      plan: newPlan,
      cost: Number(newCost),
      booker: newBooker || '운영진',
      status: newStatus
    };

    const updated = [...activities, newItem].sort((a, b) => a.date.localeCompare(b.date));
    saveActivities(updated);
    
    // 폼 초기화
    setNewTitle('');
    setNewDate('');
    setNewLoc('');
    setNewSongId('');
    setNewRound(1);
    setNewPlan('');
    setNewCost(0);
    setNewBooker('');
    setNewStatus('정산대기');
    setShowAddModal(false);
  };

  const handleDeleteActivity = (id) => {
    if (!window.confirm('일정을 정말 삭제하시겠습니까?')) return;
    const updated = activities.filter(act => act.id !== id);
    saveActivities(updated);
  };

  // 캘린더 렌더링 도우미
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstDayIndex = new Date(calYear, calMonth - 1, 1).getDay();

  const calendarCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }

  // 정산 대상 리스트 추출 (연/월 기준 & status: '정산대기')
  const getSettlementData = () => {
    const filtered = activities.filter(act => {
      if (act.status !== '정산대기') return false;
      const actDate = new Date(act.date);
      return actDate.getFullYear() === Number(settlementYear) && (actDate.getMonth() + 1) === Number(settlementMonth);
    });

    // booker별로 그룹화
    const groups = {};
    filtered.forEach(act => {
      const b = act.booker || '기타';
      if (!groups[b]) {
        groups[b] = { booker: b, count: 0, totalCost: 0, items: [] };
      }
      groups[b].count += 1;
      groups[b].totalCost += act.cost;
      groups[b].items.push(act.id);
    });

    return Object.values(groups);
  };

  // 일괄 정산 완료 처리 핸들러
  const handleCompleteSettlement = (booker, itemIds) => {
    if (!window.confirm(`${booker}님의 ${itemIds.length}건 정산을 완료 처리하시겠습니까?`)) return;
    const updated = activities.map(act => {
      if (itemIds.includes(act.id)) {
        return { ...act, status: '정산완료' };
      }
      return act;
    });
    saveActivities(updated);
  };

  const settlementList = getSettlementData();

  return (
    <div className="page fade-in">
      {/* 상단 통합 헤더 및 탭 전환 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--slate-100)', paddingBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setActiveTab('calendar')} style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            backgroundColor: activeTab === 'calendar' ? 'var(--blue-500)' : '#f1f5f9',
            color: activeTab === 'calendar' ? '#ffffff' : 'var(--slate-600)',
            transition: 'all 0.2s'
          }}>
            📅 연습 일정 및 달력
          </button>
          <button onClick={() => setActiveTab('settlement')} style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            backgroundColor: activeTab === 'settlement' ? 'var(--blue-500)' : '#f1f5f9',
            color: activeTab === 'settlement' ? '#ffffff' : 'var(--slate-600)',
            transition: 'all 0.2s'
          }}>
            💸 연습실 월말 정산 센터
          </button>
          <button onClick={() => setActiveTab('songs')} style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            backgroundColor: activeTab === 'songs' ? 'var(--blue-500)' : '#f1f5f9',
            color: activeTab === 'songs' ? '#ffffff' : 'var(--slate-600)',
            transition: 'all 0.2s'
          }}>
            🎵 세트리스트 곡 마스터
          </button>
        </div>

        {activeTab === 'calendar' && (
          <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>+ 일정 추가</span>
          </button>
        )}
      </div>

      {/* 탭 1: 연습 일정 캘린더 뷰 */}
      {activeTab === 'calendar' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* 달력 */}
          <div className="card card-pad">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <span className="card-title" style={{ fontSize: 16, margin: 0 }}>
                {calYear}년 {calMonth}월
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-sm" onClick={() => setCalMonth(prev => prev === 1 ? 12 : prev - 1)} style={{ padding: '4px 8px' }}>이전</button>
                <button className="btn-sm" onClick={() => setCalMonth(prev => prev === 12 ? 1 : prev + 1)} style={{ padding: '4px 8px' }}>다음</button>
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
                  return <div key={`empty-${index}`} style={{ aspectRatio: '1', background: '#f8fafc', borderRadius: 8 }} />;
                }
                const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const daySchedules = activities.filter(s => s.date === dateStr);

                return (
                  <div key={`day-${day}`} style={{
                    aspectRatio: '1',
                    background: '#ffffff',
                    border: '1px solid var(--slate-100)',
                    borderRadius: 8,
                    padding: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative'
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate-600)' }}>{day}</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {daySchedules.map(sch => (
                        <span key={sch.id} style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          backgroundColor: '#3b82f6'
                        }} title={sch.title} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 일정 리스트 */}
          <div className="card card-pad">
            <span className="card-title" style={{ fontSize: 16 }}>연습 일정 목록</span>
            {activities.length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>등록된 일정이 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '500px', overflowY: 'auto' }}>
                {activities.map(act => {
                  const song = songs.find(s => s.id === act.songId);
                  return (
                    <div key={act.id} style={{
                      padding: 14,
                      borderRadius: 12,
                      border: '1px solid var(--slate-100)',
                      background: '#ffffff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: act.status === '정산완료' ? '#f0fdf4' : '#fffbeb',
                            color: act.status === '정산완료' ? '#16a34a' : '#d97706'
                          }}>{act.status}</span>
                          <strong style={{ fontSize: 14, color: 'var(--slate-800)' }}>{act.title}</strong>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--slate-500)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span>📅 {act.date} | 📍 {act.location}</span>
                          {song && <span>🎵 곡: {song.title} | {act.round}회차</span>}
                          <span>🪙 대여비: {act.cost.toLocaleString()}원 ({act.booker} 예약)</span>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteActivity(act.id)} style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--red-500)',
                        fontSize: 13,
                        cursor: 'pointer',
                        fontWeight: 600
                      }}>삭제</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 탭 2: 연습실 월말 정산 센터 */}
      {activeTab === 'settlement' && (
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0', color: 'var(--slate-800)' }}>💸 연습실 월말 정산 센터</h3>
              <p style={{ fontSize: 13, color: 'var(--slate-500)', margin: 0 }}>각 멤버가 지불한 연습실 사비 지출을 정산대기 상태 기준으로 합산 계산합니다.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={settlementYear} onChange={e => setSettlementYear(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--slate-200)', fontSize: 13 }}>
                <option value="2026">2026년</option>
                <option value="2027">2027년</option>
              </select>
              <select value={settlementMonth} onChange={e => setSettlementMonth(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--slate-200)', fontSize: 13 }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </div>
          </div>

          {settlementList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', border: '1px dashed var(--slate-200)', borderRadius: 16 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--slate-700)', margin: '0 0 4px 0' }}>정산할 내역이 없습니다!</h4>
              <p style={{ fontSize: 12, color: 'var(--slate-400)', margin: 0 }}>해당 월의 모든 연습실 사비 지출 정산이 이미 완료되었거나 대기 중인 건이 없습니다.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {settlementList.map(item => (
                <div key={item.booker} style={{
                  padding: 16,
                  borderRadius: 16,
                  border: '1px solid var(--slate-100)',
                  backgroundColor: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12
                }}>
                  <div>
                    <strong style={{ fontSize: 16, color: 'var(--slate-800)', display: 'block', marginBottom: 4 }}>👤 {item.booker}</strong>
                    <span style={{ fontSize: 13, color: 'var(--slate-500)' }}>
                      정산 필요 건수: <strong>{item.count}건</strong> | 정산 필요 금액: <strong style={{ color: 'var(--blue-600)', fontSize: 15 }}>{item.totalCost.toLocaleString()}원</strong>
                    </span>
                  </div>
                  <button className="btn-primary" onClick={() => handleCompleteSettlement(item.booker, item.items)} style={{ background: 'var(--emerald-600)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>지급 완료 (정산 완료 처리)</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 탭 3: 세트리스트 곡 마스터 */}
      {activeTab === 'songs' && (
        <div className="card card-pad">
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0', color: 'var(--slate-800)' }}>🎵 세트리스트 곡 마스터 정보</h3>
            <p style={{ fontSize: 13, color: 'var(--slate-500)', margin: 0 }}>각 세트리스트별 참여 인원 및 정기 연습 스케줄 요일 정보입니다.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {songs.map(song => (
              <div key={song.id} style={{
                padding: 16,
                borderRadius: 16,
                border: '1px solid var(--slate-100)',
                background: '#ffffff'
              }}>
                <div className="flex-between" style={{ marginBottom: 8 }}>
                  <strong style={{ fontSize: 16, color: 'var(--slate-800)' }}>{song.title}</strong>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: song.musicStatus === '완료' ? '#f0fdf4' : '#eff6ff',
                    color: song.musicStatus === '완료' ? '#16a34a' : '#1d4ed8'
                  }}>{song.musicStatus}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--slate-600)' }}>
                  <div style={{ marginBottom: 4 }}>📅 정기 연습: <strong>매주 {song.regularDay}</strong></div>
                  <div>👥 참여 부원 ({song.memberCount}명): {song.members.join(', ')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 신규 일정 추가 모달 */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-sheet" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>🗓️ 신규 일정 추가</h3>
            <form onSubmit={handleAddActivity} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>일정명</label>
                <input type="text" required value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="예: 소녀시대 파트 피드백 연습" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>날짜</label>
                  <input type="date" required value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>장소</label>
                  <input type="text" required value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="예: 네오관" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>연동 세트리스트 곡</label>
                  <select value={newSongId} onChange={e => setNewSongId(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }}>
                    <option value="">곡 선택 없음</option>
                    {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>연습 회차</label>
                  <input type="number" min="1" value={newRound} onChange={e => setNewRound(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>예약자명 (사비 선지출 멤버)</label>
                <input type="text" value={newBooker} onChange={e => setNewBooker(e.target.value)} placeholder="예: 조에스더" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>연습실 대여 비용 (원)</label>
                  <input type="number" min="0" value={newCost} onChange={e => setNewCost(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>정산 상태</label>
                  <select value={newStatus} onChange={e => setNewStatus(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }}>
                    <option value="정산대기">정산대기</option>
                    <option value="정산완료">정산완료</option>
                    <option value="해당없음">해당없음</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>연습 계획 및 메모</label>
                <input type="text" value={newPlan} onChange={e => setNewPlan(e.target.value)} placeholder="예: 1절 안무 조율 및 피드백 회의" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddModal(false)}>취소</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }}>추가하기</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
