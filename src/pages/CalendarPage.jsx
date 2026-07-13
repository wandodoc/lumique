import { useState } from 'react';
import './PageStyles.css';

export default function CalendarPage() {
  const [schedules, setSchedules] = useState(() => {
    const saved = localStorage.getItem('lumique_schedules');
    return saved ? JSON.parse(saved) : [
      { id: 'sch-1', title: '정기 연습 (보컬/세션)', date: '2026-07-04', time: '14:00 ~ 17:00', location: '지하 A연습실', type: '정기연습' },
      { id: 'sch-2', title: '정기 연습 (댄스)', date: '2026-07-04', time: '17:00 ~ 20:00', location: '3층 거울연습실', type: '정기연습' },
      { id: 'sch-3', title: '공연 연습 및 피드백 회의', date: '2026-07-11', time: '15:00 ~ 18:00', location: '세미나실 B', type: '공연연습' },
      { id: 'sch-4', title: '정기 총회 및 뒤풀이', date: '2026-07-18', time: '18:00 ~ 21:00', location: '루미크 홀', type: '회의' },
    ];
  });

  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [newType, setNewType] = useState('정기연습');
  const [showAddModal, setShowAddModal] = useState(false);

  const saveSchedules = (list) => {
    setSchedules(list);
    localStorage.setItem('lumique_schedules', JSON.stringify(list));
  };

  const handleAddSchedule = (e) => {
    e.preventDefault();
    if (!newTitle || !newDate || !newTime) return alert('필수 입력 항목을 입력해 주세요.');
    const newItem = {
      id: `sch-${Date.now()}`,
      title: newTitle,
      date: newDate,
      time: newTime,
      location: newLoc || '장소 미정',
      type: newType
    };
    const updated = [...schedules, newItem].sort((a, b) => a.date.localeCompare(b.date));
    saveSchedules(updated);
    setNewTitle('');
    setNewDate('');
    setNewTime('');
    setNewLoc('');
    setShowAddModal(false);
  };

  const handleDelete = (id) => {
    if (!window.confirm('일정을 삭제하시겠습니까?')) return;
    const updated = schedules.filter(s => s.id !== id);
    saveSchedules(updated);
  };

  // 간단한 달력 렌더링용 연월
  const [currentYear] = useState(2026);
  const [currentMonth, setCurrentMonth] = useState(7); // 7월 고정 또는 이동 가능

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay();

  const calendarCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }

  const getTypeStyle = (type) => {
    switch (type) {
      case '정기연습': return { bg: '#e0f2fe', color: '#0369a1' };
      case '공연연습': return { bg: '#fef2f2', color: '#b91c1c' };
      case '회의': return { bg: '#f0fdf4', color: '#15803d' };
      default: return { bg: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <div className="page fade-in">
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>📅 연습 및 회의 일정</h2>
        <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>+ 일정 추가</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* 달력 그리드 */}
        <div className="card card-pad">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <span className="card-title" style={{ fontSize: 16, margin: 0 }}>
              {currentYear}년 {currentMonth}월
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-sm" onClick={() => setCurrentMonth(prev => prev === 1 ? 12 : prev - 1)} style={{ padding: '4px 8px' }}>이전</button>
              <button className="btn-sm" onClick={() => setCurrentMonth(prev => prev === 12 ? 1 : prev + 1)} style={{ padding: '4px 8px' }}>다음</button>
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
              const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const daySchedules = schedules.filter(s => s.date === dateStr);

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
                        backgroundColor: getTypeStyle(sch.type).color
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
          <span className="card-title" style={{ fontSize: 16 }}>상세 일정 목록</span>
          {schedules.length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>등록된 일정이 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {schedules.map(sch => {
                const style = getTypeStyle(sch.type);
                return (
                  <div key={sch.id} style={{
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
                          backgroundColor: style.bg,
                          color: style.color
                        }}>{sch.type}</span>
                        <strong style={{ fontSize: 14, color: 'var(--slate-800)' }}>{sch.title}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--slate-500)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span>📅 {sch.date} ({sch.time})</span>
                        <span>📍 {sch.location}</span>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(sch.id)} style={{
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

      {/* 일정 추가 모달 */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-sheet" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>🗓️ 신규 일정 추가</h3>
            <form onSubmit={handleAddSchedule} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>일정 구분</label>
                <select value={newType} onChange={e => setNewType(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }}>
                  <option value="정기연습">정기연습</option>
                  <option value="공연연습">공연연습</option>
                  <option value="회의">회의</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>일정명</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="예: 보컬 정기 피드백 연습" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>날짜</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>시간 범위</label>
                <input type="text" value={newTime} onChange={e => setNewTime(e.target.value)} placeholder="예: 14:00 ~ 17:00" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 4 }}>장소</label>
                <input type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="예: 서교동 A홀" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }} />
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
