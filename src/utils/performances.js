// 공연(performance) 날짜 키 포맷/파생 유틸.
// "공연"의 단일 소스는 공연 관리(PerformancePage)의 shows 데이터이며,
// 회원 관리/캘린더 쪽 performances 목록은 날짜(key) 기준으로 여기서 파생된다.

// YYYY-MM-DD → "YYYY년 M월 D일" (기존 YYYY-MM 호환)
// Keep previously shared public form URLs stable when a dated legacy show record is backfilled.
const PUBLIC_FORM_ID_BY_DATE = {
  '2026-12-04': 'show-1785978583307-jl1y9',
};

// Explicit aliases for identifiers that are known to refer to the same show.
// Do not infer aliases from matching dates: different shows may share a date.
const CANONICAL_SHOW_ID_BY_ALIAS = {
  'show-legacy-2026-12-04': 'show-1785978583307-jl1y9',
};

export function getRelatedShowIds(showOrId) {
  const show = showOrId && typeof showOrId === 'object' ? showOrId : null;
  const requestedId = show ? show.id : showOrId;
  const ids = new Set();
  if (requestedId) ids.add(String(requestedId));
  if (show?.publicFormId) ids.add(String(show.publicFormId));

  const canonicalId = CANONICAL_SHOW_ID_BY_ALIAS[String(requestedId)] || String(requestedId || '');
  if (canonicalId) ids.add(canonicalId);
  Object.entries(CANONICAL_SHOW_ID_BY_ALIAS).forEach(([alias, canonical]) => {
    if (canonical === canonicalId || alias === String(requestedId)) ids.add(alias);
  });
  return [...ids].filter(Boolean);
}

// Backfill eligibility is identity-based. A matching date alone never means
// that an existing show is the same record; known aliases are explicit above.
export function shouldBackfillLegacyPerformance(performance, shows) {
  if (!performance?.key) return false;
  const existingIds = new Set((Array.isArray(shows) ? shows : []).map(show => String(show?.id || '')));
  const candidateId = `show-legacy-${performance.key}`;
  return !getRelatedShowIds(candidateId).some(relatedId => existingIds.has(relatedId));
}

export function resolveShowByAnyId(shows, requestedId) {
  const list = Array.isArray(shows) ? shows : [];
  const ids = getRelatedShowIds(requestedId);
  const canonicalId = CANONICAL_SHOW_ID_BY_ALIAS[String(requestedId)] || String(requestedId || '');
  return list.find(show => String(show.id) === canonicalId && !show.deletedAt)
    || list.find(show => ids.includes(String(show.id)) && !show.deletedAt)
    || null;
}

export function filterOrdersForShow(orders, showOrId) {
  const ids = new Set(getRelatedShowIds(showOrId));
  return (Array.isArray(orders) ? orders : []).filter(order => ids.has(String(order.concertId)));
}

export function getPublicFormId(show) {
  return PUBLIC_FORM_ID_BY_DATE[show?.date] || show?.publicFormId || show?.id || '';
}

export function resolveShowByFormId(shows, formId) {
  const list = Array.isArray(shows) ? shows : [];
  const direct = resolveShowByAnyId(list, formId);
  if (direct) return direct;
  const aliasedDate = Object.entries(PUBLIC_FORM_ID_BY_DATE).find(([, id]) => id === String(formId))?.[0];
  const publicId = PUBLIC_FORM_ID_BY_DATE[aliasedDate];
  return publicId ? resolveShowByAnyId(list, publicId) : null;
}

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
