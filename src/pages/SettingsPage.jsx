import { useApp } from '../context/AppContext';
import './Pages.css';

const REGULATIONS = [
  { label: '계좌', value: '토스뱅크 1001-7629-3105' },
  { label: '납부 기준', value: '매월 5일 10,000원' },
  { label: '신규 부원', value: '15일 이후 가입 시 익월부터 납부' },
  { label: '파트 구분', value: 'VOIX(SESSION 포함) | DANCE | 공통' },
];

const INCOME_CATS = [
  { cat: '회비', part: '파트별', desc: '매월 5일, 1만 원' },
  { cat: '공연 수익', part: '공통', desc: '공연 관람비' },
  { cat: '이자/기타', part: '공통', desc: '예금 이자' },
];

const EXPENSE_CATS = [
  { cat: '연습실 대여', part: '파트별', desc: '각 파트 연습실 대관' },
  { cat: '비품', part: '공통/파트', desc: '장비, 의상 등 (자산성)' },
  { cat: '소모품', part: '공통/파트', desc: '팜플렛, 대본, 기타 물품 (일회성)' },
  { cat: '식대', part: '공통/파트', desc: '연습 및 공연 식사' },
  { cat: '사례비', part: '공통', desc: '스태프 수고비' },
  { cat: '주차비', part: '공통', desc: '부원 및 스태프 공연장 주차비' },
];

export default function SettingsPage() {
  const { state } = useApp();
  const { transactions } = state;

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
            <span className="reg-value">
              {r.label === '파트 구분' ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className="filter-chip" style={{ cursor: 'default', height: 28, padding: '0 12px', fontSize: 12 }}>VOIX · SESSION</span>
                  <span className="filter-chip" style={{ cursor: 'default', height: 28, padding: '0 12px', fontSize: 12 }}>DANCE</span>
                  <span className="filter-chip" style={{ cursor: 'default', height: 28, padding: '0 12px', fontSize: 12 }}>공통</span>
                </div>
              ) : (
                r.value
              )}
            </span>
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
    </div>
  );
}
