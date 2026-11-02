const REQUIRED_ARRAY_FIELDS = ['members', 'transactions', 'performances', 'shows', 'orders'];
const OPTIONAL_ARRAY_FIELDS = ['songs', 'activities'];
const OBJECT_FIELDS = [
  'performanceParticipants',
  'memberAvailability',
  'bandMembers',
  'bandMemberAvailability',
  'practiceStatuses',
  'confirmedRehearsals',
  'performanceBandMembers',
  'performanceSetlists',
];

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Missing core lists are ambiguous on an existing document: treating them as
// empty could make the AppContext autosave replace valid data with defaults.
export function validateExistingMainState(state) {
  if (!isRecord(state)) return '문서 데이터가 객체가 아닙니다.';

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(state[field])) return `필수 배열 필드 '${field}'가 없거나 올바르지 않습니다.`;
  }

  for (const field of OPTIONAL_ARRAY_FIELDS) {
    if (field in state && !Array.isArray(state[field])) return `배열 필드 '${field}'의 형식이 올바르지 않습니다.`;
  }

  for (const field of OBJECT_FIELDS) {
    if (field in state && !isRecord(state[field])) return `객체 필드 '${field}'의 형식이 올바르지 않습니다.`;
  }

  return null;
}

export function classifyMainStateRead(state) {
  if (state === undefined) return { kind: 'read-failed' };
  if (state === null) return { kind: 'missing' };
  const error = validateExistingMainState(state);
  return error ? { kind: 'invalid', error } : { kind: 'existing' };
}

export function isFirestoreDocumentAbsent(snapshot) {
  return Boolean(snapshot) && !snapshot.exists();
}
