// 공연(performance) 날짜 키 포맷/파생 유틸.
// "공연"의 단일 소스는 공연 관리(PerformancePage)의 shows 데이터이며,
// 회원 관리/캘린더 쪽 performances 목록은 날짜(key) 기준으로 여기서 파생된다.

// YYYY-MM-DD → "YYYY년 M월 D일" (기존 YYYY-MM 호환)
export function formatPerfLabel(key) {
  const parts = String(key || '').split('-');
  const y = parts[0], m = parseInt(parts[1], 10);
  if (parts.length === 3) return `${y}년 ${m}월 ${parseInt(parts[2], 10)}일`;
  return `${y}년 ${m}월`;
}

// shows[] → [{key, label, title, showId}] (날짜별 1개, 날짜 오름차순)
export function derivePerformances(shows) {
  const list = Array.isArray(shows) ? shows : [];
  const map = new Map();
  [...list]
    .filter(s => s?.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(s => {
      if (!map.has(s.date)) {
        map.set(s.date, { key: s.date, label: formatPerfLabel(s.date), title: s.title || '', showId: s.id });
      }
    });
  return [...map.values()];
}
