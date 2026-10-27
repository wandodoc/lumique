import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { firebaseStorage } from '../utils/firebaseStorage';
import './Pages.css';

const REGULATIONS = [
  { label: '계좌', value: '토스뱅크 1001-7629-3105' },
  { label: '납부 기준', value: '매월 5일 10,000원' },
  { label: '신규 부원', value: '15일 이후 가입 시 익월부터 납부' },
];

const INCOME_CATS = [
  { cat: '회비수익', part: '파트별', desc: '부원들이 정기적으로 납부하는 정기 회비 (월 1회)' },
  { cat: '사업수익', part: '공통', desc: '공연 티켓 수익, 외부 찬조금 등 고유 사업 수익' },
  { cat: '기타수익', part: '공통', desc: '통장 금융 이자 및 기타 일회성 소액 수익' },
];

const EXPENSE_CATS = [
  { cat: '임차료', part: '파트별', desc: '연습실 대여비, 무대 대관료' },
  { cat: '외주비', part: '공통', desc: '스태프 사례비, 플레이어 및 스태프 공연 주차비 등' },
  { cat: '복리후생비', part: '공통/파트', desc: '연습 및 공연 식대, MT 및 뒤풀이 행사 일부 지원금' },
  { cat: '비품', part: '공통/파트', desc: '조명, 연무기, DI 박스 등 무대 효과 장치 및 장비 구매비' },
  { cat: '소모품비', part: '공통/파트', desc: '공연 홍보물 제작, MC 의상 구매비' },
];

export default function SettingsPage() {
  const { state } = useApp();
  const { transactions } = state;
  const { isAdmin, runWithAdmin, logout, changePassword } = useAuth();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      return alert('모든 비밀번호 필드를 입력해주세요.');
    }
    if (newPassword !== confirmPassword) {
      return alert('새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.');
    }
    if (newPassword.length < 4) {
      return alert('새 비밀번호는 4자리 이상이어야 합니다.');
    }
    try {
      const success = await changePassword(oldPassword, newPassword);
      if (success) {
        alert('비밀번호가 변경되었습니다. 모든 기기에 바로 적용됩니다.');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        alert('기존 비밀번호가 일치하지 않습니다.');
      }
    } catch (err) {
      alert(err.message || '서버에 연결할 수 없어 비밀번호를 변경하지 못했습니다.');
    }
  };

  // 백업 = 서버(Firestore) 문서 전체를 내려받는다. (이 기기의 로컬 저장소에는 데이터가 없다)
  const handleBackup = async () => {
    const data = await firebaseStorage.loadData();
    if (!data) {
      alert('서버에서 데이터를 불러오지 못해 백업 파일을 만들 수 없습니다. 네트워크를 확인해 주세요.');
      return;
    }
    const payload = { format: 'lumique-firestore-v1', exportedAt: new Date().toISOString(), main_state: data };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lumique_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 복원 = 백업 파일의 내용을 서버에 쓴다. 되돌릴 수 없으므로 현재 서버 건수와 파일 건수를 보여주고 확인받는다.
  const handleRestore = (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // reset
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const incoming = parsed?.format === 'lumique-firestore-v1' ? parsed.main_state : parsed;
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('bad');
        const ALLOWED = ['members', 'transactions', 'performances', 'performanceParticipants', 'memberAvailability', 'bandMembers',
          'bandMemberAvailability', 'practiceStatuses', 'confirmedRehearsals', 'performanceBandMembers', 'performanceSetlists',
          'shows', 'orders', 'songs', 'activities', 'lastUpdated'];
        const fields = Object.fromEntries(Object.entries(incoming).filter(([k]) => ALLOWED.includes(k)));
        if (Object.keys(fields).length === 0) throw new Error('bad');
        const current = await firebaseStorage.loadData();
        if (current === undefined) {
          alert('서버 상태를 확인할 수 없어 복원을 중단했습니다. 네트워크를 확인해 주세요.');
          return;
        }
        const count = (v) => (Array.isArray(v) ? `${v.length}건` : v && typeof v === 'object' ? `${Object.keys(v).length}개` : '-');
        const summary = ['transactions', 'members', 'shows', 'orders']
          .filter(k => k in fields)
          .map(k => `${k}: 서버 ${count(current?.[k])} → 파일 ${count(fields[k])}`)
          .join('\n');
        if (!window.confirm(`서버 데이터를 백업 파일 내용으로 덮어씁니다. 되돌릴 수 없습니다.\n\n${summary}\n\n진행할까요?`)) return;
        const ok = await firebaseStorage.saveData(fields);
        if (!ok) {
          alert('서버 저장에 실패해 복원되지 않았습니다.');
          return;
        }
        alert('복원 완료. 페이지를 새로고침합니다.');
        window.location.reload();
      } catch {
        alert('잘못된 백업 파일입니다.');
      }
    };
    reader.readAsText(file);
  };

  const rawEquipments = [];
  transactions.forEach(tx => {
    const isIncome = tx.type === 'income';
    const sign = isIncome ? -1 : 1;
    
    const isMemberSplit = tx.splitItems && tx.splitItems.some(it => it.memberId || it.linkedTxId);
    
    if (tx.splitItems && tx.splitItems.length > 0 && !isMemberSplit) {
      tx.splitItems.forEach(it => {
        if (it.category === '비품') {
          const rawName = it.desc || tx.note || tx.description;
          rawEquipments.push({
            date: tx.datetime.slice(0, 10),
            part: it.part || tx.part || '공통',
            rawName,
            rawNote: (tx.note && tx.note !== rawName) ? tx.note : '',
            price: (Number(it.amount) || 0) * sign
          });
        }
      });
    } else {
      if (tx.category === '비품') {
        const rawName = tx.note || tx.description;
        rawEquipments.push({
          date: tx.datetime.slice(0, 10),
          part: tx.part || '공통',
          rawName,
          rawNote: '',
          price: (Number(tx.amount) || 0) * sign
        });
      }
    }
  });

  const grouped = {};
  rawEquipments.forEach(item => {
    let qty = 1;
    let name = item.rawName;
    
    if (item.rawNote) {
      const m = item.rawNote.match(/(\d+)\s*(?:EA|개|세트)/i);
      if (m) qty = parseInt(m[1], 10);
    }
    
    const nm = name.match(/[\(\[\s]*(\d+)\s*(?:EA|개|세트)[\)\]\s]*/i);
    if (nm) {
      qty = parseInt(nm[1], 10);
      name = name.replace(nm[0], '').trim();
    }
    
    if (!name) name = item.rawName;
    
    const key = `${name.toLowerCase()}_${item.part}`;
    if (!grouped[key]) {
      grouped[key] = {
        name,
        part: item.part,
        date: item.date,
        qty: 0,
        price: 0
      };
    }
    
    grouped[key].qty += (qty * (item.price < 0 ? -1 : 1));
    grouped[key].price += item.price;
    
    if (item.date > grouped[key].date) {
      grouped[key].date = item.date;
    }
  });

  const equipmentList = Object.values(grouped)
    .filter(g => g.price > 0 || g.qty > 0)
    .map(g => ({
      date: g.date,
      part: g.part,
      name: g.name,
      price: g.price,
      note: g.qty > 0 ? `${g.qty}EA` : ''
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="page fade-in">
      {/* 관리자 로그인 (모바일에서는 사이드바가 없어 여기가 유일한 로그인 진입점) */}
      <div className="card card-pad">
        <span className="card-title" style={{ fontSize: 18, fontWeight: 800, display: 'block', marginBottom: 16 }}>👤 관리자 계정</span>
        {isAdmin ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--emerald-500)' }} />
              <span style={{ fontSize: 15, fontWeight: 700 }}>관리자로 접속 중</span>
            </div>
            <button type="button" className="btn-secondary" style={{ padding: '8px 14px', borderRadius: 8, fontSize: 14 }} onClick={logout}>
              로그아웃
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-primary"
            style={{ width: '100%', height: 48, borderRadius: 8, fontWeight: 700, fontSize: 15 }}
            onClick={() => runWithAdmin(() => {})}
          >
            관리자 로그인
          </button>
        )}
      </div>

      {/* 회비 운영 세칙 */}
      <div className="card card-pad">
        <span className="card-title" style={{ fontSize: 18, fontWeight: 800, display: 'block', marginBottom: 16 }}>📋 회비 운영 세칙</span>
        {REGULATIONS.map(r => (
          <div key={r.label} className="reg-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="reg-label" style={{ fontSize: 15, fontWeight: 600 }}>{r.label}</span>
            <span className="reg-value" style={{ fontSize: 15, textAlign: 'right' }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* 수입 계정과목 */}
      <div className="card card-pad">
        <span className="card-title" style={{ fontSize: 18, fontWeight: 800, display: 'block', marginBottom: 16 }}>💰 수입 계정과목</span>
        {INCOME_CATS.map(c => (
          <div key={c.cat} className="reg-row">
            <div>
              <strong style={{ fontSize: 15 }}>{c.cat}</strong>
            </div>
            <span className="reg-value" style={{ fontSize: 14, color: 'var(--gray-500)' }}>{c.desc}</span>
          </div>
        ))}
      </div>

      {/* 지출 계정과목 */}
      <div className="card card-pad">
        <span className="card-title" style={{ fontSize: 18, fontWeight: 800, display: 'block', marginBottom: 16 }}>💸 지출 계정과목</span>
        {EXPENSE_CATS.map(c => (
          <div key={c.cat} className="reg-row">
            <div>
              <strong style={{ fontSize: 15 }}>{c.cat}</strong>
            </div>
            <span className="reg-value" style={{ fontSize: 14, color: 'var(--gray-500)' }}>{c.desc}</span>
          </div>
        ))}
      </div>

      {/* 공용 비품 */}
      <div className="card card-pad">
        <span className="card-title" style={{ fontSize: 18, fontWeight: 800, display: 'block', marginBottom: 16 }}>🛒 공용 비품 목록</span>
        {equipmentList.length === 0 && (
          <p className="text-muted" style={{ textAlign: 'center', padding: '16px 0', fontSize: 14 }}>등록된 비품 내역이 없습니다.</p>
        )}
        {equipmentList.map((e, i) => (
          <div key={i} className="equip-row">
            <div className="equip-info">
              <strong style={{ fontSize: 15 }}>{e.name}</strong>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                <span style={{ fontSize: 13, color: 'var(--slate-400)' }}>{e.date}</span>
                {e.note && <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>| {e.note}</span>}
              </div>
            </div>
            <div className="equip-right">
              <span className={`badge badge-${e.part === '공통' ? 'common' : e.part.toLowerCase()}`} style={{ fontSize: 12 }}>{e.part}</span>
              <strong style={{ fontSize: 15 }}>{(e.price || 0).toLocaleString()}원</strong>
            </div>
          </div>
        ))}
        <div className="equip-total">
          <span>합계</span>
          <strong style={{ fontSize: 16 }}>{(equipmentList.reduce((s, e) => s + (e.price || 0), 0)).toLocaleString()}원</strong>
        </div>
      </div>

      {/* 공용 비밀번호 변경 */}
      <div className="card card-pad">
        <span className="card-title" style={{ fontSize: 18, fontWeight: 800, display: 'block', marginBottom: 16 }}>🔒 공용 비밀번호 변경</span>
        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate-600)' }}>기존 비밀번호</label>
            <input
              type="password"
              placeholder="기존 비밀번호 입력"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--slate-200)',
                fontSize: 15,
                outline: 'none',
                background: 'white'
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate-600)' }}>새 비밀번호</label>
            <input
              type="password"
              placeholder="새 비밀번호 입력"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--slate-200)',
                fontSize: 15,
                outline: 'none',
                background: 'white'
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate-600)' }}>새 비밀번호 확인</label>
            <input
              type="password"
              placeholder="새 비밀번호 확인 입력"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--slate-200)',
                fontSize: 15,
                outline: 'none',
                background: 'white'
              }}
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            style={{
              marginTop: 8,
              height: 48,
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 15
            }}
          >
            비밀번호 변경하기
          </button>
        </form>
      </div>

      {/* 데이터 백업/복구 (관리자 도구) */}
      <div className="card card-pad">
        <span className="card-title" style={{ fontSize: 18, fontWeight: 800, display: 'block', marginBottom: 16 }}>💾 시스템 데이터 관리 (로컬)</span>
        <p style={{ fontSize: 14, color: 'var(--slate-500)', marginBottom: 12 }}>
          브라우저에 저장된 모든 루미크 데이터를 안전하게 백업하거나, 이전 백업 파일로 복원할 수 있습니다.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 15 }} onClick={handleBackup}>
            데이터 전체 백업 (JSON 다운로드)
          </button>
          <label className="btn-secondary" style={{ flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 15, textAlign: 'center', cursor: 'pointer', boxSizing: 'border-box' }}>
            데이터 복구 (JSON 업로드)
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleRestore} />
          </label>
        </div>
      </div>
    </div>
  );
}
