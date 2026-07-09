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

const EQUIPMENT = [
  { part: '공통', name: '조명', qty: 10, price: 488000, note: '10EA' },
  { part: '공통', name: '연무기', qty: 2, price: 250000, note: '2EA' },
  { part: 'VOIX', name: 'DI 박스', qty: 1, price: 120000, note: '' },
  { part: '공통', name: '해리포터 의상 세트', qty: 1, price: 49000, note: '25년 12월 공연' },
  { part: '공통', name: '교련복 의상 세트', qty: 1, price: 42000, note: '26년 7월 공연' },
];

export default function SettingsPage() {
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
                  <span className="filter-chip" style={{ cursor: 'default', height: 28, padding: '0 12px', fontSize: 12 }}>VOIX(SESSION 포함)</span>
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
        {EQUIPMENT.map((e, i) => (
          <div key={i} className="equip-row">
            <div className="equip-info">
              <strong style={{ fontSize: 14 }}>{e.name}</strong>
              {e.note && <span style={{ fontSize: 12, color: 'var(--gray-500)', marginLeft: 6 }}>{e.note}</span>}
            </div>
            <div className="equip-right">
              <span className={`badge badge-${e.part === '공통' ? 'common' : e.part.toLowerCase()}`}>{e.part}</span>
              <strong style={{ fontSize: 14 }}>{e.price.toLocaleString()}원</strong>
            </div>
          </div>
        ))}
        <div className="equip-total">
          <span>합계</span>
          <strong>{EQUIPMENT.reduce((s, e) => s + e.price, 0).toLocaleString()}원</strong>
        </div>
      </div>
    </div>
  );
}
