import { useEffect, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { firebaseStorage } from '../utils/firebaseStorage';
import { LS_SHOWS, LS_SHOWS_PENDING, LS_SHOWS_BACKUP } from '../utils/localBackup';

// 공연 데이터 복구 페이지 (/recover)
// 2026-10-24 Firestore 공연 레코드 유실 이후, 다른 기기(아이패드 등) 브라우저의 localStorage에
// 남아 있을 수 있는 공연 사본을 서버로 되살리기 위한 페이지다.
//  1) 페이지를 열면 이 기기의 로컬 사본을 그대로 Firestore의 별도 문서(club_ledger/recovery_*)에 보존한다.
//     main_state는 건드리지 않으므로 아무 위험이 없다.
//  2) 원본으로 보이는 공연이 있으면 버튼 한 번으로 서버의 해당 공연을 이 사본으로 교체할 수 있다.
// AppProvider 바깥에서 렌더링되므로 다른 동기화 로직이 끼어들지 않는다.

const parse = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { raw: null, items: [] };
    const v = JSON.parse(raw);
    return { raw, items: Array.isArray(v) ? v : [] };
  } catch {
    return { raw: null, items: [] };
  }
};

const SOURCES = [
  { key: LS_SHOWS, label: '현재 사본' },
  { key: LS_SHOWS_PENDING, label: '미동기화 사본' },
  { key: LS_SHOWS_BACKUP, label: '시작 시 자동 백업' },
];

const count = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);

// 복구 가치가 있는 사본인지 가늠하는 점수. 테이블 배치/좌석 지정/사진/설명이 있을수록 원본일 가능성이 높다.
const richness = (s) => count(s.tables) * 10 + count(s.seatAssignments) + count(s.participantSeatAssignments)
  + count(s.performerSeatAssignments) + count(s.imageUrls) * 5 + (s.description ? 3 : 0) + count(s.customSections) * 2;

const fmtKB = (n) => `${Math.round(n / 1024)} KB`;

export default function RecoveryPage() {
  const [sources] = useState(() => SOURCES.map(s => ({ ...s, ...parse(s.key) })));
  const [server, setServer] = useState(undefined); // undefined 로딩중, null 실패, [] 정상
  const [backupStatus, setBackupStatus] = useState('이 기기의 사본을 서버 보관함으로 보내는 중...');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const addLog = (m) => setLog(l => [...l, `${new Date().toLocaleTimeString()} ${m}`]);

  // 기기별로 한 번만 쓰는 보관 문서 id (새로고침해도 같은 문서에 덮어씀)
  const deviceTag = useMemo(() => {
    try {
      const k = 'lumique_recovery_device_tag';
      let t = localStorage.getItem(k);
      if (!t) { t = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; localStorage.setItem(k, t); }
      return t;
    } catch {
      return `tmp-${Date.now().toString(36)}`;
    }
  }, []);

  const hasAnything = sources.some(s => s.items.length > 0);

  // 1) 로컬 사본을 별도 문서로 보존 (main_state는 건드리지 않음)
  useEffect(() => {
    (async () => {
      if (!hasAnything) { setBackupStatus('이 기기에는 공연 사본이 저장되어 있지 않습니다.'); return; }
      const payload = {
        savedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        origin: location.origin,
        sources: Object.fromEntries(sources.map(s => [s.key, s.raw])),
      };
      const size = JSON.stringify(payload).length;
      const ref = doc(db, 'club_ledger', `recovery_${deviceTag}`);
      try {
        if (size > 950_000) {
          // Firestore 문서 1MiB 제한. 사진(base64)을 떼어낸 버전으로 먼저 보존한다.
          const slim = Object.fromEntries(sources.map(s => [s.key, s.raw ? JSON.stringify(s.items.map(({ imageUrls, imageUrl, ...rest }) => ({ ...rest, imageCount: count(imageUrls), hadImage: Boolean(imageUrl) }))) : null]));
          await setDoc(ref, { ...payload, sources: slim, note: `원본 ${fmtKB(size)} — 용량 때문에 사진 제외` });
          setBackupStatus(`서버 보관함에 저장됨 (사진 제외, 원본 ${fmtKB(size)}). 문서: recovery_${deviceTag}`);
        } else {
          await setDoc(ref, payload);
          setBackupStatus(`서버 보관함에 저장됨 (${fmtKB(size)}). 문서: recovery_${deviceTag}`);
        }
      } catch (e) {
        setBackupStatus(`서버 보관함 저장 실패: ${e.message}. 아래 "JSON 보기"로 내용을 복사해 전달해 주세요.`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 서버의 현재 공연 목록
  const reloadServer = async () => {
    setServer(undefined);
    const list = await firebaseStorage.loadConcerts();
    setServer(list);
  };
  useEffect(() => { reloadServer(); }, []);

  // 로컬 사본들에서 공연 id별로 가장 풍부한 버전을 고른다
  const candidates = useMemo(() => {
    const byId = new Map();
    sources.forEach(src => src.items.forEach(s => {
      if (!s || !s.id) return;
      const prev = byId.get(s.id);
      if (!prev || richness(s) > richness(prev.show)) byId.set(s.id, { show: s, from: src.label });
    }));
    return [...byId.values()].sort((a, b) => richness(b.show) - richness(a.show));
  }, [sources]);

  const serverById = useMemo(() => new Map((server || []).map(s => [s.id, s])), [server]);

  // 2) 서버의 같은 id 공연을 이 기기의 사본으로 교체
  const restore = async (cand) => {
    if (busy) return;
    const { show } = cand;
    const onServer = serverById.get(show.id);
    const msg = onServer
      ? `서버의 공연 "${onServer.title || show.id}"(${onServer.date || '-'})을(를) 이 기기의 사본으로 교체합니다.\n\n사본: 테이블 ${count(show.tables)}개, 좌석 지정 ${count(show.seatAssignments) + count(show.participantSeatAssignments) + count(show.performerSeatAssignments)}건, 사진 ${count(show.imageUrls)}장\n\n계속할까요?`
      : `서버에 없는 공연 "${show.title || show.id}"을(를) 이 기기의 사본으로 추가합니다. 계속할까요?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const current = await firebaseStorage.loadConcerts();
      if (current === null) throw new Error('서버 공연 목록을 읽지 못했습니다. 네트워크를 확인해 주세요.');
      const restored = {
        ...show,
        // 유실 후 임시로 넣어둔 복구 메모는 제거하고, 어디서 복원됐는지만 남긴다
        restoreNote: undefined,
        restoredFromDeviceAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      delete restored.restoreNote;
      const saved = await firebaseStorage.upsertShow(restored);
      const ok = Array.isArray(saved);
      if (!ok) throw new Error('저장이 거부되었습니다. (용량 초과 또는 네트워크 오류)');
      addLog(`✅ "${show.title || show.id}" 복원 완료`);
      await reloadServer();
    } catch (e) {
      addLog(`❌ 복원 실패: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const copyJson = async () => {
    const text = JSON.stringify(Object.fromEntries(sources.map(s => [s.key, s.items])), null, 2);
    try { await navigator.clipboard.writeText(text); addLog('JSON을 클립보드에 복사했습니다.'); }
    catch { setShowJson(true); addLog('클립보드 복사가 막혀 있어 아래에 표시합니다. 길게 눌러 전체 선택 후 복사해 주세요.'); }
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif', color: '#111', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>공연 데이터 복구</h1>
      <p style={{ color: '#555', marginTop: 0 }}>이 기기 브라우저에 저장된 공연 사본을 확인하고 서버로 되살립니다.</p>

      <section style={card}>
        <strong>1단계 · 사본 보존</strong>
        <div style={{ marginTop: 6 }}>{backupStatus}</div>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#555', fontSize: 14 }}>
          {sources.map(s => <li key={s.key}>{s.label}: {s.items.length}건 {s.raw ? `(${fmtKB(s.raw.length)})` : '(없음)'}</li>)}
        </ul>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn} onClick={copyJson} disabled={!hasAnything}>JSON 복사</button>
          <button style={btn} onClick={() => setShowJson(v => !v)} disabled={!hasAnything}>{showJson ? 'JSON 숨기기' : 'JSON 보기'}</button>
        </div>
        {showJson && (
          <textarea readOnly value={JSON.stringify(Object.fromEntries(sources.map(s => [s.key, s.items])))}
            style={{ width: '100%', height: 160, marginTop: 10, fontSize: 11, fontFamily: 'monospace' }} onFocus={e => e.target.select()} />
        )}
      </section>

      <section style={card}>
        <strong>2단계 · 서버 공연과 비교 후 복원</strong>
        <div style={{ marginTop: 6, color: '#555', fontSize: 14 }}>
          서버 공연 목록: {server === undefined ? '불러오는 중...' : server === null ? <span style={{ color: '#b91c1c' }}>읽기 실패 (복원 불가, 새로고침 후 재시도)</span> : `${server.length}건`}
        </div>
        {!hasAnything && <p style={{ color: '#b91c1c' }}>이 기기에는 복원할 사본이 없습니다. 공연을 등록·수정하거나 좌석 배치를 저장했던 다른 기기에서 이 주소를 열어 주세요.</p>}
        {candidates.map(c => {
          const s = c.show;
          const srv = serverById.get(s.id);
          const seats = count(s.seatAssignments) + count(s.participantSeatAssignments) + count(s.performerSeatAssignments);
          const valuable = richness(s) > 0;
          return (
            <div key={s.id} style={{ ...row, borderColor: valuable ? '#16a34a' : '#ddd' }}>
              <div style={{ fontWeight: 600 }}>{s.title || '(제목 없음)'} <span style={{ color: '#777', fontWeight: 400 }}>· {s.date || '-'} {s.time || ''}</span></div>
              <div style={{ fontSize: 13, color: '#444' }}>장소 {s.location || '-'} · 테이블 {count(s.tables)}개 · 좌석 지정 {seats}건 · 사진 {count(s.imageUrls)}장 · 가격 구간 {count(s.priceTiers)}개 · 출처: {c.from}</div>
              <div style={{ fontSize: 12, color: '#777', wordBreak: 'break-all' }}>{s.id}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {server === undefined ? null : srv
                  ? <>서버 현재: "{srv.title}" · 테이블 {count(srv.tables)}개 · 좌석 지정 {count(srv.seatAssignments) + count(srv.participantSeatAssignments) + count(srv.performerSeatAssignments)}건{srv.restoreNote ? ' · (유실 후 임시 복구된 상태)' : ''}</>
                  : <span style={{ color: '#b45309' }}>서버에 없는 공연</span>}
              </div>
              <button style={{ ...btn, marginTop: 8, background: valuable ? '#16a34a' : '#999' }} disabled={busy || !Array.isArray(server)} onClick={() => restore(c)}>
                {srv ? '이 사본으로 서버 공연 교체' : '서버에 추가'}
              </button>
            </div>
          );
        })}
      </section>

      {log.length > 0 && (
        <section style={card}>
          <strong>기록</strong>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '6px 0 0' }}>{log.join('\n')}</pre>
        </section>
      )}
    </div>
  );
}

const card = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginTop: 14, background: '#fff' };
const row = { border: '2px solid #ddd', borderRadius: 8, padding: 10, marginTop: 10 };
const btn = { background: '#2563eb', color: '#fff', border: 0, borderRadius: 6, padding: '8px 14px', fontSize: 14, cursor: 'pointer' };
