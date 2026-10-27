// 공연 목록의 로컬 사본 키와, 앱 시작 시 한 번만 찍어두는 보호용 백업.
// 2026-10-24 서버 공연 레코드 유실 뒤, 각 기기 브라우저에 남은 사본이 유일한 원본이 될 수 있다.
// 이후 이 기기에서 공연/좌석을 저장하면 현재 사본(LS_SHOWS)이 덮어써지므로,
// 처음 발견한 사본을 별도 키에 보관해 두고 절대 덮어쓰지 않는다. (/recover 페이지에서 사용)
export const LS_SHOWS = 'lumique_concerts';
export const LS_SHOWS_PENDING = 'lumique_concerts_pending_sync';
export const LS_SHOWS_BACKUP = 'lumique_concerts_backup_v1';

export function snapshotLocalShowsOnce() {
  try {
    if (localStorage.getItem(LS_SHOWS_BACKUP)) return;
    const raw = localStorage.getItem(LS_SHOWS_PENDING) || localStorage.getItem(LS_SHOWS);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    localStorage.setItem(LS_SHOWS_BACKUP, raw);
  } catch {
    // 저장 공간 부족·비공개 모드 등은 무시 (앱 동작에 영향 없음)
  }
}
