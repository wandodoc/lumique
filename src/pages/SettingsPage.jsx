import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import './Pages.css';

const REGULATIONS = [
  { label: '계좌', value: '토스뱅크 1001-7629-3105' },
  { label: '납부 기준', value: '매월 5일 10,000원' },
  { label: '신규 부원', value: '15일 이후 가입 시 익월부터 납부' },
];

const INCOME_CATS = [
  { cat: '회비수익', part: '파트별', desc: '정기 회비 및 신입 가입비 통합 집계' },
  { cat: '사업수익', part: '공통', desc: '티켓 수익, 외부 행사비, 찬조금 등 동아리 고유 목적 사업 수익' },
  { cat: '기타수익', part: '공통', desc: '금융 이자 및 소액 기타 수익' },
];

const EXPENSE_CATS = [
  { cat: '임차료', part: '파트별', desc: '연습실 대관료 및 공간 대여비' },
  { cat: '비품', part: '공통/파트', desc: '악기, 스피커, 마이크 등 감가상각 장비 구매비' },
  { cat: '외주비', part: '공통', desc: '강사료, 사례비, 용역비, 공연 스태프 인건비 등' },
  { cat: '소모품비', part: '공통/파트', desc: '공연 의상, 화장품, 소품, 팜플렛 인쇄비 등 소모성 비용' },
  { cat: '복리후생비', part: '공통/파트', desc: '식사비, MT비, 단합대회비, 연습실 간식비 등 부원 후생 비용' },
];

export default function SettingsPage() {
  const { state } = useApp();
  const { transactions } = state;
  const { changePassword } = useAuth();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handlePasswordChange = (e) => {
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
    const success = changePassword(oldPassword, newPassword);
    if (success) {
      alert('비밀번호가 성공적으로 변경되었습니다.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      alert('기존 비밀번호가 일치하지 않습니다.');
    }
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
      {/* 회비 운영 세칙 */}
      <div className="card card-pad">
        <span className="card-title">📋 회비 운영 세칙</span>
        {REGULATIONS.map(r => (
          <div key={r.label} className="reg-row">
            <span className="reg-label">{r.label}</span>
            <span className="reg-value">{r.value}</span>
          </div>
        ))}
      </div>

      {/* 수입 계정과목 */}
      <div className="card card-pad">
        <span className="card-title">💰 수입 계정과목</span>
        {INCOME_CATS.map(c => (
          <div key={c.cat} className="reg-row">
            <div>
              <strong style={{ fontSize: 14 }}>{c.cat}</strong>
              <span className="badge badge-gray" style={{ marginLeft: 8 }}>{c.part}</span>
            </div>
            <span className="reg-value" style={{ fontSize: 12, color: 'var(--gray-500)' }}>{c.desc}</span>
          </div>
        ))}
      </div>

      {/* 지출 계정과목 */}
      <div className="card card-pad">
        <span className="card-title">💸 지출 계정과목</span>
        {EXPENSE_CATS.map(c => (
          <div key={c.cat} className="reg-row">
            <div>
              <strong style={{ fontSize: 14 }}>{c.cat}</strong>
              <span className="badge badge-gray" style={{ marginLeft: 8 }}>{c.part}</span>
            </div>
            <span className="reg-value" style={{ fontSize: 12, color: 'var(--gray-500)' }}>{c.desc}</span>
          </div>
        ))}
      </div>

      {/* 공용 비품 */}
      <div className="card card-pad">
        <span className="card-title">🛒 공용 비품 목록</span>
        {equipmentList.length === 0 && (
          <p className="text-muted" style={{ textAlign: 'center', padding: '16px 0' }}>등록된 비품 내역이 없습니다.</p>
        )}
        {equipmentList.map((e, i) => (
          <div key={i} className="equip-row">
            <div className="equip-info">
              <strong style={{ fontSize: 14 }}>{e.name}</strong>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--slate-400)' }}>{e.date}</span>
                {e.note && <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>| {e.note}</span>}
              </div>
            </div>
            <div className="equip-right">
              <span className={`badge badge-${e.part === '공통' ? 'common' : e.part.toLowerCase()}`}>{e.part}</span>
              <strong style={{ fontSize: 14 }}>{e.price.toLocaleString()}원</strong>
            </div>
          </div>
        ))}
        <div className="equip-total">
          <span>합계</span>
          <strong>{equipmentList.reduce((s, e) => s + e.price, 0).toLocaleString()}원</strong>
        </div>
      </div>

      {/* 공용 비밀번호 변경 */}
      <div className="card card-pad">
        <span className="card-title">🔒 공용 비밀번호 변경</span>
        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate-600)' }}>기존 비밀번호</label>
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
                fontSize: 14,
                outline: 'none',
                background: 'white'
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate-600)' }}>새 비밀번호</label>
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
                fontSize: 14,
                outline: 'none',
                background: 'white'
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate-600)' }}>새 비밀번호 확인</label>
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
                fontSize: 14,
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
              height: 42,
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14
            }}
          >
            비밀번호 변경하기
          </button>
        </form>
      </div>
    </div>
  );
}
