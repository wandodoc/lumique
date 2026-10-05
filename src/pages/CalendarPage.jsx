import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import './PageStyles.css';

const SONG_PARTS = [
  { key: 'vocal', label: '보컬' },
  { key: 'guitar', label: '기타' },
  { key: 'bass', label: '베이스' },
  { key: 'synth', label: '신디' },
  { key: 'drums', label: '드럼' }
];

const ASSIGNMENT_STATUSES = {
  assigned: '담당자 지정',
  unused: 'X',
  undecided: '미정'
};

const AVAILABILITY_LABELS = {
  available: '가능',
  unavailable: '불가능',
  undecided: '미정'
};

const PRACTICE_STATUS_OPTIONS = [
  { value: 'possible', label: '가능' },
  { value: 'impossible', label: '불가능' },
  { value: 'hold', label: '보류' },
  { value: 'undecided', label: '미정' }
];

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentWeekMonday = (date) => {
  const monday = new Date(date);
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const formatBandPlanningDate = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  });
};

const createDefaultAssignments = () => SONG_PARTS.reduce((assignments, part) => {
  assignments[part.key] = { status: 'undecided', memberIds: [] };
  return assignments;
}, {});

const getAssignmentsForEditor = (song) => SONG_PARTS.reduce((assignments, part) => {
  const savedAssignment = song?.assignments?.[part.key];
  const status = Object.prototype.hasOwnProperty.call(ASSIGNMENT_STATUSES, savedAssignment?.status)
    ? savedAssignment.status
    : 'undecided';
  const memberIds = Array.isArray(savedAssignment?.memberIds)
    ? savedAssignment.memberIds.map(id => String(id))
    : [];
  const participantRefs = Array.isArray(savedAssignment?.participantRefs)
    ? savedAssignment.participantRefs
    : [];

  assignments[part.key] = { status, memberIds };
  if (Array.isArray(savedAssignment?.participantRefs)) {
    assignments[part.key].participantRefs = participantRefs;
  }
  return assignments;
}, createDefaultAssignments());

export default function CalendarPage() {
  const { state, dispatch } = useApp();
  const members = state?.members || [];
  const bandMembers = state?.bandMembers || {};
  const bandMemberAvailability = state?.bandMemberAvailability || {};
  const practiceStatuses = state?.practiceStatuses || {};
  const confirmedRehearsals = state?.confirmedRehearsals || {};
  const externalBandMembers = Object.values(bandMembers)
    .filter(member => member?.type === 'external' && member.id && member.name);
  const [activeSubTab, setActiveSubTab] = useState('calendar'); // 'calendar' | 'songs' | 'band-planning' | 'band-members' | 'settlement'
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

  // --- 밴드 참여자 관리 관련 상태 및 핸들러 ---
  const [externalBandName, setExternalBandName] = useState('');
  const [editingExternalBandMemberId, setEditingExternalBandMemberId] = useState(null);

  const handleAddOfficialToBand = (memberId) => {
    const member = members.find(m => String(m.id) === String(memberId));
    if (!member) return;
    
    dispatch({
      type: 'ADD_BAND_MEMBER',
      bandMember: { id: String(member.id), type: 'official', name: member.name }
    });
  };

  const handleRemoveFromBand = (bandMemberId) => {
    if (!window.confirm('밴드 참여자 목록에서 삭제하시겠습니까? (관련 availability 데이터도 삭제됩니다)')) return;
    dispatch({ type: 'DELETE_BAND_MEMBER', bandMemberId });
  };

  const handleSaveExternalBandMember = (e) => {
    e.preventDefault();
    const name = externalBandName.trim();
    if (!name) return;

    if (editingExternalBandMemberId) {
      const existing = bandMembers[editingExternalBandMemberId];
      if (existing) {
        dispatch({
          type: 'UPDATE_BAND_MEMBER',
          bandMember: { ...existing, name },
        });
      }
    } else {
      const id = `external:ext${Date.now()}`;
      dispatch({
        type: 'ADD_BAND_MEMBER',
        bandMember: { id, type: 'external', name },
      });
    }

    setExternalBandName('');
    setEditingExternalBandMemberId(null);
  };

  const handleEditExternalBandMember = (bandMember) => {
    setEditingExternalBandMemberId(bandMember.id);
    setExternalBandName(bandMember.name || '');
  };

  const updateBandMemberAvailability = (bandMemberId, date, status) => {
    dispatch({
      type: 'UPDATE_BAND_MEMBER_AVAILABILITY',
      bandMemberId,
      date,
      status,
    });
  };

  const bandMemberList = Object.values(bandMembers || {})
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));

  // --- 곡 마스터 관련 상태 및 핸들러 ---
  const [editingSongId, setEditingSongId] = useState(null);
  const [songTitle, setSongTitle] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const [songAssignments, setSongAssignments] = useState(createDefaultAssignments);
  const [songRegularDay, setSongRegularDay] = useState('월요일');
  const [songStatus, setSongStatus] = useState('시작전');
  const [memberSearchQueries, setMemberSearchQueries] = useState({});
  const [bandPlanningDate, setBandPlanningDate] = useState(() => toDateKey(getCurrentWeekMonday(new Date())));
  const [editingRehearsalId, setEditingRehearsalId] = useState(null);
  const [rehearsalDate, setRehearsalDate] = useState(() => toDateKey(getCurrentWeekMonday(new Date())));
  const [rehearsalTime, setRehearsalTime] = useState('');
  const [rehearsalLocation, setRehearsalLocation] = useState('');
  const [rehearsalSongIds, setRehearsalSongIds] = useState([]);
  const [rehearsalMemo, setRehearsalMemo] = useState('');

  const getMemberLabel = (memberId) => {
    const member = members.find(item => String(item.id) === String(memberId));
    if (!member) return `ID: ${memberId}`;
    return member.status === 'active' ? member.name : `${member.name} (inactive)`;
  };

  const getExternalBandMemberLabel = (bandMemberId) => {
    const bandMember = externalBandMembers.find(item => String(item.id) === String(bandMemberId));
    return bandMember ? `${bandMember.name} (외부)` : `ID: ${bandMemberId} (외부)`;
  };

  const getAssignmentLabels = (assignment) => {
    const memberLabels = (assignment?.memberIds || []).map(memberId => getMemberLabel(memberId));
    const externalLabels = (assignment?.participantRefs || [])
      .filter(ref => ref?.type === 'external' && ref.id)
      .map(ref => getExternalBandMemberLabel(ref.id));
    return [...memberLabels, ...externalLabels];
  };

  const getBandPlanningParticipants = (assignment) => [
    ...(assignment?.memberIds || []).map(memberId => ({
      type: 'member',
      id: String(memberId),
      name: getMemberLabel(memberId)
    })),
    ...(assignment?.participantRefs || [])
      .filter(ref => ref?.type === 'external' && ref.id)
      .map(ref => ({
        type: 'external',
        id: String(ref.id),
        name: getExternalBandMemberLabel(ref.id)
      }))
  ];

  // 정식 회원(official)/외부 참여자 모두 밴드 참여자로 등록된 이후부터는
  // bandMemberAvailability 하나로만 availability를 관리합니다.
  const getBandPlanningAvailability = (participant) => {
    const availability = bandMemberAvailability?.[participant.id]?.[bandPlanningDate];
    return AVAILABILITY_LABELS[availability] || AVAILABILITY_LABELS.undecided;
  };

  const shiftBandPlanningDate = (amount) => {
    const nextDate = new Date(`${bandPlanningDate}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + amount);
    setBandPlanningDate(toDateKey(nextDate));
  };

  const updatePracticeStatus = (songId, status) => {
    dispatch({
      type: 'UPDATE_PRACTICE_STATUS',
      payload: {
        date: bandPlanningDate,
        songId,
        status,
      },
    });
  };

  const resetRehearsalForm = () => {
    setEditingRehearsalId(null);
    setRehearsalDate(bandPlanningDate);
    setRehearsalTime('');
    setRehearsalLocation('');
    setRehearsalSongIds([]);
    setRehearsalMemo('');
  };

  const handleRehearsalSongSelection = (event) => {
    setRehearsalSongIds(Array.from(event.target.selectedOptions, option => option.value));
  };

  const handleSaveConfirmedRehearsal = (event) => {
    event.preventDefault();
    if (!rehearsalDate || !rehearsalTime || !rehearsalLocation.trim() || rehearsalSongIds.length === 0) {
      alert('날짜, 시간, 장소, 연습 곡을 모두 입력해 주세요.');
      return;
    }

    const id = editingRehearsalId || `rehearsal-${Date.now()}`;
    const rehearsal = {
      id,
      date: rehearsalDate,
      time: rehearsalTime,
      location: rehearsalLocation.trim(),
      songIds: rehearsalSongIds,
      memo: rehearsalMemo.trim(),
      status: 'confirmed'
    };

    dispatch({
      type: editingRehearsalId ? 'UPDATE_CONFIRMED_REHEARSAL' : 'ADD_CONFIRMED_REHEARSAL',
      payload: rehearsal,
    });
    resetRehearsalForm();
  };

  const handleEditConfirmedRehearsal = (rehearsal) => {
    setEditingRehearsalId(rehearsal.id);
    setRehearsalDate(rehearsal.date || bandPlanningDate);
    setRehearsalTime(rehearsal.time || '');
    setRehearsalLocation(rehearsal.location || '');
    setRehearsalSongIds(Array.isArray(rehearsal.songIds) ? rehearsal.songIds : []);
    setRehearsalMemo(rehearsal.memo || '');
  };

  const handleDeleteConfirmedRehearsal = (rehearsalId) => {
    if (!window.confirm('확정 연습 일정을 삭제하시겠습니까?')) return;
    dispatch({
      type: 'DELETE_CONFIRMED_REHEARSAL',
      payload: { id: rehearsalId },
    });
    if (editingRehearsalId === rehearsalId) resetRehearsalForm();
  };

  const confirmedRehearsalList = Object.values(confirmedRehearsals)
    .filter(rehearsal => rehearsal?.id)
    .sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));

  const handleAssignmentStatusChange = (partKey, status) => {
    setSongAssignments(prev => ({
      ...prev,
      [partKey]: {
        ...prev[partKey],
        status
      }
    }));
  };

  const handleToggleAssignmentMember = (partKey, memberId) => {
    const normalizedId = String(memberId);
    setSongAssignments(prev => {
      const currentAssignment = prev[partKey] || { status: 'undecided', memberIds: [], participantRefs: [] };
      const currentIds = currentAssignment.memberIds || [];
      const memberIds = currentIds.includes(normalizedId)
        ? currentIds.filter(id => id !== normalizedId)
        : [...currentIds, normalizedId];
      const participantRefs = currentAssignment.participantRefs || [];
      const nextAssignment = {
        ...currentAssignment,
        status: memberIds.length > 0 || participantRefs.length > 0 ? 'assigned' : 'undecided',
        memberIds,
      };
      if (participantRefs.length > 0 || Object.prototype.hasOwnProperty.call(currentAssignment, 'participantRefs')) {
        nextAssignment.participantRefs = participantRefs;
      }

      return {
        ...prev,
        [partKey]: nextAssignment
      };
    });
  };

  const handleToggleExternalBandMember = (partKey, bandMemberId) => {
    const normalizedId = String(bandMemberId);
    setSongAssignments(prev => {
      const currentAssignment = prev[partKey] || { status: 'undecided', memberIds: [], participantRefs: [] };
      const currentRefs = Array.isArray(currentAssignment.participantRefs)
        ? currentAssignment.participantRefs
        : [];
      const isSelected = currentRefs.some(ref => ref?.type === 'external' && String(ref.id) === normalizedId);
      const participantRefs = isSelected
        ? currentRefs.filter(ref => !(ref?.type === 'external' && String(ref.id) === normalizedId))
        : [...currentRefs, { type: 'external', id: normalizedId }];
      const memberIds = currentAssignment.memberIds || [];

      return {
        ...prev,
        [partKey]: {
          ...currentAssignment,
          status: memberIds.length > 0 || participantRefs.some(ref => ref?.type === 'external' && ref.id)
            ? 'assigned'
            : 'undecided',
          participantRefs,
        }
      };
    });
  };

  const handleAddSong = (e) => {
    e.preventDefault();
    if (!songTitle.trim()) return alert('곡명을 입력해 주세요.');

    const regularPracticeDays = songRegularDay === '없음' ? [] : [songRegularDay];

    if (editingSongId) {
      saveSongs(songs.map(s => s.id === editingSongId
        ? {
            ...s,
            title: songTitle.trim(),
            artist: songArtist.trim(),
            regularPracticeDays,
            musicStatus: songStatus,
            assignments: songAssignments
          }
        : s));
    } else {
      const newSong = {
        id: `song-${Date.now()}`,
        title: songTitle.trim(),
        artist: songArtist.trim(),
        members: [],
        memberCount: 0,
        regularPracticeDays,
        musicStatus: songStatus,
        assignments: songAssignments
      };
      saveSongs([...songs, newSong]);
    }
    
    setEditingSongId(null);
    setSongTitle('');
    setSongArtist('');
    setSongAssignments(createDefaultAssignments());
    setMemberSearchQueries({});
    setSongRegularDay('없음');
    setSongStatus('시작전');
  };

  const handleEditSong = (s) => {
    setEditingSongId(s.id);
    setSongTitle(s.title);
    setSongArtist(s.artist || '');
    setSongAssignments(getAssignmentsForEditor(s));
    setMemberSearchQueries({});
    setSongRegularDay(Array.isArray(s.regularPracticeDays) && s.regularPracticeDays.length > 0 ? s.regularPracticeDays[0] : '없음');
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
          { id: 'band-planning', label: '🎸 밴드 일정 관리' },
          { id: 'band-members', label: '👥 밴드 참여자' },
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
      {/* ... (keep existing calendar tab content) */}

      {/* --- 2. 곡 마스터 관리 탭 --- */}
      {/* ... (keep existing songs tab content) */}

      {activeSubTab === 'band-members' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          <div className="card card-pad">
            <span className="card-title" style={{ fontSize: 16 }}>👥 밴드 참여자 관리</span>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>
              밴드 연습 및 일정 관리의 대상이 되는 인원을 관리합니다.
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--slate-700)', marginBottom: 8 }}>정식 회원 추가</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {members.filter(m => m.status === 'active' && !bandMembers[m.id]).map(member => (
                  <button
                    key={member.id}
                    onClick={() => handleAddOfficialToBand(member.id)}
                    style={{ background: 'var(--slate-100)', color: 'var(--slate-700)', border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    + {member.name}
                  </button>
                ))}
                {members.filter(m => m.status === 'active' && !bandMembers[m.id]).length === 0 && (
                  <span className="text-muted" style={{ fontSize: 13 }}>추가할 수 있는 활성 정식 회원이 없습니다.</span>
                )}
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--slate-100)', margin: '16px 0' }} />

            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--slate-700)', marginBottom: 8 }}>외부 참여자 등록</div>
              <form onSubmit={handleSaveExternalBandMember} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={externalBandName}
                  onChange={e => setExternalBandName(e.target.value)}
                  placeholder="외부 참여자 이름"
                  style={{ flex: 1, minWidth: 150, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--slate-200)' }}
                />
                <button type="submit" className="btn-primary">
                  {editingExternalBandMemberId ? '저장' : '추가'}
                </button>
                {editingExternalBandMemberId && (
                  <button type="button" className="btn-secondary" onClick={() => { setExternalBandName(''); setEditingExternalBandMemberId(null); }}>
                    취소
                  </button>
                )}
              </form>
            </div>
          </div>

          <div className="card card-pad">
            <span className="card-title" style={{ fontSize: 16 }}>등록된 밴드 참여자 목록</span>
            {bandMemberList.length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>등록된 밴드 참여자가 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bandMemberList.map(member => (
                  <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#ffffff', border: '1px solid var(--slate-100)', borderRadius: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--slate-800)' }}>
                        {member.name} {member.type === 'external' && <span style={{ fontSize: 11, color: 'var(--blue-500)', fontWeight: 600 }}>(외부)</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {member.type === 'external' && (
                        <button onClick={() => handleEditExternalBandMember(member)} className="btn-sm" style={{ background: 'var(--slate-50)', color: 'var(--slate-600)' }}>수정</button>
                      )}
                      <button onClick={() => handleRemoveFromBand(member.id)} className="btn-sm" style={{ background: 'var(--slate-50)', color: 'var(--red-500)' }}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'band-planning' && (
        <div className="card card-pad">
          <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <span className="card-title" style={{ margin: 0 }}>🎸 밴드 일정 관리</span>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                선택한 날짜의 인원별 availability와 곡별 연습 상태를 관리합니다.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn-sm" onClick={() => shiftBandPlanningDate(-1)}>이전 날짜</button>
              <input
                type="date"
                value={bandPlanningDate}
                onChange={e => setBandPlanningDate(e.target.value)}
                aria-label="밴드 일정 관리 날짜"
                style={{ padding: '7px 9px', border: '1px solid var(--slate-200)', borderRadius: 8, fontSize: 12 }}
              />
              <button type="button" className="btn-sm" onClick={() => shiftBandPlanningDate(1)}>다음 날짜</button>
            </div>
          </div>

          <div style={{ padding: '10px 12px', marginBottom: 16, background: 'var(--slate-50)', borderRadius: 8, color: 'var(--slate-700)', fontSize: 13, fontWeight: 700 }}>
            조회 날짜: {formatBandPlanningDate(bandPlanningDate)}
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--slate-700)', marginBottom: 12 }}>인원별 Availability</div>
            {bandMemberList.length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: '20px 0' }}>밴드 참여자를 먼저 등록해주세요.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {bandMemberList.map(member => {
                  const status = bandMemberAvailability?.[member.id]?.[bandPlanningDate] || 'undecided';
                  return (
                    <div key={member.id} style={{ padding: '10px 12px', background: '#ffffff', border: '1px solid var(--slate-100)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate-700)' }}>{member.name}</span>
                      <select
                        value={status}
                        onChange={e => updateBandMemberAvailability(member.id, bandPlanningDate, e.target.value)}
                        style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--slate-200)', fontSize: 11 }}
                      >
                        {Object.entries(AVAILABILITY_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--slate-100)', margin: '24px 0' }} />

          {/* ... (rest of band-planning content like practice status per song) */}

          {songs.length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>등록된 곡이 없습니다.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              {songs.map(song => (
                <div key={song.id} style={{ padding: 16, border: '1px solid var(--slate-100)', borderRadius: 12, background: '#ffffff' }}>
                  <div style={{ marginBottom: 14 }}>
                    <strong style={{ display: 'block', color: 'var(--slate-800)', fontSize: 16 }}>{song.title}</strong>
                    {song.artist && <span style={{ color: 'var(--slate-500)', fontSize: 13 }}>{song.artist}</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {SONG_PARTS.map(part => {
                      const assignment = getAssignmentsForEditor(song)[part.key];
                      const participants = getBandPlanningParticipants(assignment);

                      return (
                        <div key={part.key} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--slate-50)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <strong style={{ fontSize: 12, color: 'var(--slate-700)' }}>{part.label}</strong>
                            <span style={{ fontSize: 11, color: 'var(--slate-500)' }}>
                              {assignment.status === 'unused' ? 'X · 사용 안 함' : assignment.status === 'undecided' ? '미정' : '담당자 지정'}
                            </span>
                          </div>

                          {assignment.status === 'unused' ? (
                            <div style={{ color: 'var(--slate-500)', fontSize: 12 }}>이 곡에서는 사용하지 않음</div>
                          ) : assignment.status === 'undecided' || participants.length === 0 ? (
                            <div style={{ color: 'var(--slate-500)', fontSize: 12 }}>담당자 미정</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {participants.map(participant => (
                                <div key={`${participant.type}-${participant.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                  <span style={{ color: 'var(--slate-800)' }}>{participant.name}</span>
                                  <span style={{
                                    padding: '2px 7px',
                                    borderRadius: 999,
                                    background: getBandPlanningAvailability(participant) === '가능' ? '#dcfce7' : getBandPlanningAvailability(participant) === '불가능' ? '#fee2e2' : '#f1f5f9',
                                    color: getBandPlanningAvailability(participant) === '가능' ? '#166534' : getBandPlanningAvailability(participant) === '불가능' ? '#b91c1c' : 'var(--slate-600)',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {getBandPlanningAvailability(participant)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--slate-100)' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--slate-700)', marginBottom: 8 }}>연습 상태</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {PRACTICE_STATUS_OPTIONS.map(option => {
                        const selectedStatus = practiceStatuses?.[bandPlanningDate]?.[song.id] || 'undecided';
                        const isSelected = selectedStatus === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => updatePracticeStatus(song.id, option.value)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              border: `1px solid ${isSelected ? 'var(--blue-500)' : 'var(--slate-200)'}`,
                              background: isSelected ? 'var(--blue-500)' : '#ffffff',
                              color: isSelected ? '#ffffff' : 'var(--slate-600)',
                              fontSize: 12,
                              fontWeight: isSelected ? 800 : 600,
                              cursor: 'pointer'
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--slate-200)' }}>
            <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <span className="card-title" style={{ margin: 0 }}>확정 연습 일정</span>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  availability나 연습 상태와 별도로 사용자가 직접 확정한 일정입니다.
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <form onSubmit={handleSaveConfirmedRehearsal} style={{ padding: 14, border: '1px solid var(--slate-100)', borderRadius: 10, background: 'var(--slate-50)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <strong style={{ fontSize: 14, color: 'var(--slate-800)' }}>
                  {editingRehearsalId ? '연습 일정 수정' : '연습 일정 추가'}
                </strong>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-600)' }}>
                  날짜
                  <input type="date" value={rehearsalDate} onChange={e => setRehearsalDate(e.target.value)} required style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px 9px', border: '1px solid var(--slate-200)', borderRadius: 7, boxSizing: 'border-box' }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-600)' }}>
                  시간
                  <input type="time" value={rehearsalTime} onChange={e => setRehearsalTime(e.target.value)} required style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px 9px', border: '1px solid var(--slate-200)', borderRadius: 7, boxSizing: 'border-box' }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-600)' }}>
                  장소
                  <input type="text" value={rehearsalLocation} onChange={e => setRehearsalLocation(e.target.value)} placeholder="연습실 이름" required style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px 9px', border: '1px solid var(--slate-200)', borderRadius: 7, boxSizing: 'border-box' }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-600)' }}>
                  연습 곡 (여러 곡 선택 가능)
                  <select multiple value={rehearsalSongIds} onChange={handleRehearsalSongSelection} required style={{ display: 'block', width: '100%', minHeight: 96, marginTop: 5, padding: '6px 8px', border: '1px solid var(--slate-200)', borderRadius: 7, boxSizing: 'border-box', background: '#ffffff' }}>
                    {songs.map(song => (
                      <option key={song.id} value={song.id}>{song.title}{song.artist ? ` - ${song.artist}` : ''}</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-600)' }}>
                  메모 (선택)
                  <textarea value={rehearsalMemo} onChange={e => setRehearsalMemo(e.target.value)} rows={3} placeholder="연습 관련 메모" style={{ display: 'block', width: '100%', marginTop: 5, padding: '8px 9px', border: '1px solid var(--slate-200)', borderRadius: 7, boxSizing: 'border-box', resize: 'vertical' }} />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  {editingRehearsalId && (
                    <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={resetRehearsalForm}>취소</button>
                  )}
                  <button type="submit" className="btn-primary" style={{ flex: 2 }}>
                    {editingRehearsalId ? '연습 일정 저장' : '연습 일정 확정'}
                  </button>
                </div>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {confirmedRehearsalList.length === 0 ? (
                  <div className="text-muted" style={{ padding: '24px 12px', textAlign: 'center', border: '1px dashed var(--slate-200)', borderRadius: 10 }}>
                    등록된 확정 연습 일정이 없습니다.
                  </div>
                ) : (
                  confirmedRehearsalList.map(rehearsal => (
                    <div key={rehearsal.id} style={{ padding: 14, border: '1px solid var(--slate-100)', borderRadius: 10, background: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div>
                          <strong style={{ display: 'block', fontSize: 14, color: 'var(--slate-800)' }}>
                            {rehearsal.date ? formatBandPlanningDate(rehearsal.date) : '날짜 미정'} {rehearsal.time || ''}
                          </strong>
                          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--slate-600)' }}>📍 {rehearsal.location}</div>
                        </div>
                        <span style={{ padding: '3px 7px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 800 }}>확정</span>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--slate-600)' }}>
                        <strong>연습 곡</strong>
                        <ul style={{ margin: '5px 0 0 18px', padding: 0 }}>
                          {(Array.isArray(rehearsal.songIds) ? rehearsal.songIds : []).map(songId => {
                            const song = songs.find(item => item.id === songId);
                            return <li key={songId}>{song?.title || `곡 ID: ${songId}`}</li>;
                          })}
                        </ul>
                      </div>
                      {rehearsal.memo && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--slate-500)' }}>📝 {rehearsal.memo}</div>}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                        <button type="button" className="btn-secondary" style={{ padding: '5px 9px', fontSize: 11 }} onClick={() => handleEditConfirmedRehearsal(rehearsal)}>수정</button>
                        <button type="button" className="btn-secondary" style={{ padding: '5px 9px', fontSize: 11, color: 'var(--red-500)' }} onClick={() => handleDeleteConfirmedRehearsal(rehearsal.id)}>삭제</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>파트별 담당자</label>
                <p style={{ fontSize: 12, color: 'var(--slate-500)', margin: '0 0 10px' }}>
                  현재 부원은 ID로 저장하며, 기존 레거시 참여 부원 정보는 별도로 유지됩니다.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {SONG_PARTS.map(part => {
                    const assignment = songAssignments[part.key] || { status: 'undecided', memberIds: [], participantRefs: [] };
                    const selectedIds = assignment.memberIds || [];
                    const selectedParticipantRefs = Array.isArray(assignment.participantRefs)
                      ? assignment.participantRefs
                      : [];

                    const partSearchValue = memberSearchQueries[part.key] || '';
                    const query = partSearchValue.trim().toLowerCase();
                    const visibleBandMembers = bandMemberList.filter(m => 
                      !query || (m.name || '').toLowerCase().includes(query)
                    );

                    const officialBandMembers = visibleBandMembers.filter(m => m.type === 'official');
                    const externalBandMembersForPart = visibleBandMembers.filter(m => m.type === 'external');

                    return (
                      <div key={part.key} style={{ padding: 10, border: '1px solid var(--slate-100)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <strong style={{ fontSize: 13, color: 'var(--slate-700)' }}>{part.label}</strong>
                          <select
                            value={assignment.status}
                            onChange={e => handleAssignmentStatusChange(part.key, e.target.value)}
                            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--slate-200)', fontSize: 12 }}
                          >
                            {Object.entries(ASSIGNMENT_STATUSES).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </div>

                        {assignment.status === 'assigned' ? (
                          <>
                            <input
                              type="text"
                              value={partSearchValue}
                              onChange={e => setMemberSearchQueries(prev => ({ ...prev, [part.key]: e.target.value }))}
                              placeholder="이름으로 부원 검색..."
                              style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--slate-200)', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                              {officialBandMembers.length > 0 && (
                                <>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--slate-500)', marginTop: 2 }}>정식 회원</div>
                                  {officialBandMembers.map(member => (
                                    <label key={`member-${member.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={selectedIds.includes(String(member.id))}    
                                        onChange={() => handleToggleAssignmentMember(part.key, member.id)}
                                      />
                                      <span>{member.name}</span>
                                    </label>
                                  ))}
                                </>
                              )}

                              {externalBandMembersForPart.length > 0 && (
                                <>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--slate-500)', marginTop: 6 }}>외부 참여자</div>
                                  {externalBandMembersForPart.map(bandMember => (
                                    <label key={`external-${bandMember.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={selectedParticipantRefs.some(ref => ref?.type === 'external' && String(ref.id) === String(bandMember.id))}
                                        onChange={() => handleToggleExternalBandMember(part.key, bandMember.id)}
                                      />
                                      <span>{bandMember.name} (외부)</span>
                                    </label>
                                  ))}
                                </>
                              )}
                              {visibleBandMembers.length === 0 && <span style={{ fontSize: 12, color: 'var(--slate-400)' }}>검색 결과가 없습니다. (밴드 참여자를 먼저 등록해주세요)</span>}
                            </div>
                          </>
                        ) : (
                          (selectedIds.length > 0 || selectedParticipantRefs.length > 0) && (
                            <div style={{ fontSize: 11, color: 'var(--slate-500)' }}>    
                              기존 저장 담당자: {getAssignmentLabels(assignment).join(', ')}
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                  </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}> 
                  <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>정기 연습 요일</label>
                  <select value={songRegularDay} onChange={e => setSongRegularDay(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--slate-200)' }}>
                    {['없음', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'].map(day => (
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
                    setSongAssignments(createDefaultAssignments());
                    setMemberSearchQuery('');
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
                {songs.map(s => {
                  const displayAssignments = getAssignmentsForEditor(s);
                  return (
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
                      <div style={{ fontSize: 12, color: 'var(--slate-500)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span>👥 <strong>기존 참여 ({s.memberCount ?? (Array.isArray(s.members) ? s.members.length : 0)}명):</strong> {Array.isArray(s.members) && s.members.length > 0 ? s.members.join(', ') : '없음'}</span>
                        <div>
                          <strong>파트별 담당:</strong>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                            {SONG_PARTS.map(part => {
                              const assignment = displayAssignments[part.key];
                              const assignmentLabels = getAssignmentLabels(assignment);
                              const names = assignmentLabels.length > 0
                                ? assignmentLabels.join(', ')
                                : '없음';
                              return <span key={part.key} style={{ paddingLeft: 8 }}>{part.label}: {ASSIGNMENT_STATUSES[assignment.status]} · {names}</span>;
                            })}
                          </div>
                        </div>
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
                  );
                })}
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
