import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { calcMemberDues, formatKRW } from '../utils/calculations';
import './Pages.css';

const PARTS = ['전체', 'VOIX', 'DANCE', 'SESSION'];

function ProgressBar({ pct, color }) {
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{
        width: `${Math.min(100, Math.max(0, pct))}%`,
        background: color
      }} />
    </div>
  );
}

function MemberCard({ member, transactions, onClick }) {
  const dues = calcMemberDues(member, transactions);
  const rawPct = dues.basis > 0 ? (dues.paid / dues.basis) * 100 : 100;
  const pct = Math.min(100, Math.max(0, Math.round(rawPct)));
  const partColors = { VOIX: 'var(--voix-color)', DANCE: 'var(--dance-color)', SESSION: 'var(--session-color)' };
  const mainColor = partColors[member.part] || 'var(--blue-500)';

  let statusBadge;
  let cardStyle = { padding: 16 };
  
  if (dues.diff < 0) {
    statusBadge = <span className="badge badge-danger" style={{ whiteSpace: 'nowrap' }}>{formatKRW(Math.abs(dues.diff))} 미납</span>;
    cardStyle = { ...cardStyle, border: '1px solid var(--red-300)', backgroundColor: '#fef2f2' };
  } else if (dues.diff > 0) {
    statusBadge = <span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>{formatKRW(dues.diff)} 초과납부</span>;
    cardStyle = { ...cardStyle, border: '1px solid var(--blue-300)', backgroundColor: '#eff6ff' };
  } else {
    statusBadge = <span className="badge badge-success" style={{ whiteSpace: 'nowrap' }}>완납</span>;
  }
  
  const gradient = `conic-gradient(${mainColor} ${pct}%, var(--slate-100) ${pct}% 100%)`;

  return (
    <div className="member-card" style={cardStyle} onClick={() => onClick(member)}>
      {/* 모바일 뷰: 가로 막대 그래프 */}
      <div className="md-mobile-view">
        <div className="member-card-top">
          <div className="member-card-info">
            <span className="member-card-name">{member.name}</span>
            <span className={`badge badge-${member.part.toLowerCase()}`}>{member.part}</span>
            {member.status === 'inactive' && <span className="badge badge-gray">탈퇴</span>}
          </div>
          {statusBadge}
        </div>
        <ProgressBar pct={pct} color={mainColor} />
        <div className="member-card-nums">
          <span>{formatKRW(dues.paid)} 납부</span>
          <span className="text-muted">기준 {formatKRW(dues.basis)}</span>
        </div>
      </div>

      {/* PC 뷰: 원형 도넛 그래프 */}
      <div className="md-pc-view">
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 16, alignItems: 'flex-start' }}>
           <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              <span className={`badge badge-${member.part.toLowerCase()}`}>{member.part}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                <span style={{ fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap' }}>{member.name}</span>
                {member.status === 'inactive' && <span className="badge badge-gray" style={{ whiteSpace: 'nowrap', margin: 0 }}>탈퇴</span>}
              </div>
           </div>
           {statusBadge}
        </div>
        <div className="donut-chart" style={{ width: 100, height: 100, background: gradient, marginBottom: 16, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
           <div style={{ position: 'absolute', width: 74, height: 74, background: cardStyle.backgroundColor || 'var(--white)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <span style={{ fontSize: 18, fontWeight: 800, color: mainColor }}>{pct}%</span>
           </div>
        </div>
        <div style={{ textAlign: 'center', width: '100%' }}>
           <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--slate-800)' }}>{formatKRW(dues.paid)} 납부</div>
           <div style={{ fontSize: 12, color: 'var(--slate-400)', marginTop: 4 }}>기준 {formatKRW(dues.basis)}</div>
        </div>
      </div>
    </div>
  );
}

function MemberModal({ member, transactions, onClose }) {
  const partColors = { VOIX: 'var(--voix-color)', DANCE: 'var(--dance-color)', SESSION: 'var(--session-color)' };
  const dues = calcMemberDues(member, transactions);
  const pct = dues.basis > 0 ? (dues.paid / dues.basis) * 100 : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <span className="modal-title">{member.name}</span>
          <span className={`badge badge-${member.part.toLowerCase()}`}>{member.part}</span>
        </div>
        <div className="modal-progress-section">
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <span className="text-muted" style={{ fontSize: 13 }}>납부율</span>
            <strong style={{ color: partColors[member.part] || 'var(--blue-500)' }}>
              {Math.round(Math.min(100, pct))}%
            </strong>
          </div>
          <ProgressBar pct={pct} color={partColors[member.part] || 'var(--blue-500)'} />
          <div className="modal-nums">
            <div><p className="text-muted">납부 기준액</p><strong>{formatKRW(dues.basis)}</strong></div>
            <div><p className="text-muted">실 납부액</p><strong className="text-green">{formatKRW(dues.paid)}</strong></div>
            <div>
              <p className="text-muted">미납 / 초과</p>
              <strong className={dues.diff < 0 ? 'text-red' : dues.diff > 0 ? 'text-blue' : 'text-green'}>
                {dues.diff < 0 ? '-' : dues.diff > 0 ? '+' : ''}{formatKRW(Math.abs(dues.diff))}
              </strong>
            </div>
          </div>
        </div>
        <p className="card-title" style={{ marginTop: 8 }}>납부 내역 (인정됨)</p>
        <div className="modal-tx-list">
          {dues.history.length === 0 && <p className="text-muted" style={{ textAlign: 'center', padding: 16 }}>납부 내역 없음</p>}
          {dues.history.map((tx, idx) => (
            <div key={tx.id + '_' + idx} className="modal-tx-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span className="text-muted">{tx.datetime.slice(0, 10)}</span>
                {tx.isSplit && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--slate-500)' }}>({tx.splitDesc || '분할'})</span>}
              </div>
              <strong 
                className={tx.linkedTxId ? 'diagonal-strike' : (tx.amount < 0 ? 'text-red' : 'text-green')}>
                {tx.amount > 0 ? '+' : ''}{formatKRW(tx.amount)}
              </strong>
            </div>
          ))}
        </div>
        <button className="primary-btn" style={{ marginTop: 16 }} onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

// Force HMR recompile
export default function MemberDuesPage() {
  const { state } = useApp();
  const { members, transactions } = state;
  const [partFilter, setPartFilter] = useState('전체');
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'detail'
  
  const currentYear = new Date().getFullYear();
  const [detailYear, setDetailYear] = useState(currentYear);

  const availableYears = useMemo(() => {
    const years = new Set([currentYear]);
    transactions.forEach(t => {
      if (t.datetime) {
        years.add(parseInt(t.datetime.slice(0, 4), 10));
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  const getMonthlyPayments = (member, year) => {
    const dues = calcMemberDues(member, transactions);
    const monthly = Array(12).fill(0);
    
    dues.history.forEach(tx => {
      const txDate = new Date(tx.datetime);
      if (txDate.getFullYear() === year) {
        monthly[txDate.getMonth()] += tx.amount;
      }
    });
    
    const joinMonthStr = member.joinDate.slice(0, 7);
    const leaveMonthStr = member.leaveDate ? member.leaveDate.slice(0, 7) : null;
    
    return monthly.map((amt, idx) => {
      const monthStr = `${year}-${String(idx + 1).padStart(2, '0')}`;
      if (monthStr < joinMonthStr) return 'X';
      if (leaveMonthStr && monthStr > leaveMonthStr) return 'X';
      return amt;
    });
  };
  const filtered = members
    .filter(m => showInactive || m.status === 'active')
    .filter(m => partFilter === '전체' || m.part === partFilter)
    .sort((a, b) => {
      const diffA = calcMemberDues(a, transactions).diff;
      const diffB = calcMemberDues(b, transactions).diff;
      
      const getDiffGroup = diff => {
        if (diff < 0) return 1; // 미납
        if (diff > 0) return 2; // 초과 납부
        return 3; // 완납
      };
      
      const gA = getDiffGroup(diffA);
      const gB = getDiffGroup(diffB);
      
      if (gA !== gB) return gA - gB;
      
      // 동일 그룹 내에서는 파트 > 이름 순 정렬
      const partOrder = { 'VOIX': 1, 'DANCE': 2, 'SESSION': 3, '공통': 4 };
      const wA = partOrder[a.part] || 99;
      const wB = partOrder[b.part] || 99;
      if (wA !== wB) return wA - wB;
      
      return a.name.localeCompare(b.name, 'ko');
    });

  const unpaid = members.filter(m => m.status === 'active' && calcMemberDues(m, transactions).diff < 0);
  const { totalPaid, totalBasis } = members.filter(m => m.status === 'active').reduce((acc, m) => {
    const dues = calcMemberDues(m, transactions);
    acc.totalBasis += dues.basis;
    acc.totalPaid += Math.min(dues.paid, dues.basis); // 초과 납부액이 진행률을 뻥튀기하지 않도록 제한
    return acc;
  }, { totalPaid: 0, totalBasis: 0 });

  const overallPct = totalBasis > 0 ? Math.floor((totalPaid / totalBasis) * 100) : 0;

  return (
    <div className="page fade-in">
      {/* 전체 납부율 요약 */}
      <div className="card card-pad" style={{ overflow: 'visible' }}>
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="card-title" style={{ margin: 0 }}>전체 납부 현황</span>
          </div>
          <strong style={{ color: 'var(--blue-500)', fontSize: 20 }}>{overallPct}%</strong>
        </div>
        <ProgressBar pct={overallPct} color="var(--blue-500)" />
        <div className="flex-between" style={{ marginTop: 10, fontSize: 13, color: 'var(--gray-500)' }}>
          <span>납부 완료 {members.filter(m => m.status === 'active').length - unpaid.length}명</span>
          <span>미납 <strong style={{ color: 'var(--red-500)' }}>{unpaid.length}명</strong></span>
        </div>
      </div>

      {/* 필터 및 뷰 전환 */}
      <div className="flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="filter-row" style={{ margin: 0 }}>
            {PARTS.map(p => (
              <button key={p} className={`filter-chip ${partFilter === p ? 'active' : ''}`}
                onClick={() => setPartFilter(p)}>{p}</button>
            ))}
          </div>
          <div className="toggle-switch-wrapper" onClick={() => setShowInactive(v => !v)}>
            <span className="toggle-label">탈퇴 회원 포함</span>
            <div className={`toggle-switch ${showInactive ? 'active' : ''}`}>
              <div className="toggle-handle" />
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {viewMode === 'detail' && (
            <select 
              value={detailYear} 
              onChange={e => setDetailYear(Number(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--slate-200)', outline: 'none', fontSize: 13 }}
            >
              {availableYears.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          )}
          <div style={{ display: 'flex', background: 'var(--slate-100)', padding: 4, borderRadius: 8 }}>
            <button 
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: viewMode === 'summary' ? 'white' : 'transparent', color: viewMode === 'summary' ? 'var(--slate-800)' : 'var(--slate-500)', boxShadow: viewMode === 'summary' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}
              onClick={() => setViewMode('summary')}
            >요약</button>
            <button 
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: viewMode === 'detail' ? 'white' : 'transparent', color: viewMode === 'detail' ? 'var(--slate-800)' : 'var(--slate-500)', boxShadow: viewMode === 'detail' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}
              onClick={() => setViewMode('detail')}
            >상세</button>
          </div>
        </div>
      </div>

      {/* 회원 목록 */}
      {viewMode === 'summary' ? (
        <div className="member-dues-grid">
          {filtered.map(m => (
            <MemberCard key={m.id} member={m} transactions={transactions} onClick={setSelected} />
          ))}
        </div>
      ) : (
        <div className="card card-pad" style={{ overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1100 }}>
            <thead>
              <tr style={{ background: 'var(--slate-50)', borderBottom: '1px solid var(--slate-200)', textAlign: 'right' }}>
                <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>멤버</th>
                <th style={{ padding: '12px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>파트</th>
                <th style={{ padding: '12px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>구분</th>
                <th style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>가입일</th>
                {Array.from({ length: 12 }).map((_, i) => (
                  <th key={i} style={{ padding: '12px 10px', whiteSpace: 'nowrap', minWidth: 60 }}>{i + 1}월</th>
                ))}
                <th style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>납부 기준액</th>
                <th style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>납부액</th>
                <th style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>미납/초과납부액</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const dues = calcMemberDues(m, transactions);
                const monthly = getMonthlyPayments(m, detailYear);
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--slate-100)', textAlign: 'right' }} onClick={() => setSelected(m)}>
                    <td style={{ padding: '10px', textAlign: 'left', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{m.name}</td>
                    <td style={{ padding: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <span className={`badge badge-${m.part.toLowerCase()}`} style={{ fontSize: 10 }}>{m.part}</span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', color: m.status === 'active' ? 'var(--blue-600)' : 'var(--slate-400)', whiteSpace: 'nowrap' }}>
                      {m.status === 'active' ? '활동' : '탈퇴'}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--slate-500)', whiteSpace: 'nowrap' }}>{m.joinDate.slice(0, 10)}</td>
                    {monthly.map((amt, i) => (
                      <td key={i} style={{ padding: '10px', color: amt === 'X' ? 'var(--slate-300)' : amt > 0 ? 'var(--emerald-600)' : 'var(--slate-400)', whiteSpace: 'nowrap' }}>
                        {amt === 'X' ? 'X' : amt === 0 ? '0' : (amt || 0).toLocaleString()}
                      </td>
                    ))}
                    <td style={{ padding: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{(dues?.basis || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', fontWeight: 600, color: 'var(--emerald-600)', whiteSpace: 'nowrap' }}>{(dues?.paid || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', fontWeight: 700, color: dues?.diff < 0 ? 'var(--rose-500)' : dues?.diff > 0 ? 'var(--blue-500)' : 'var(--slate-400)', whiteSpace: 'nowrap' }}>
                      {dues?.diff === 0 ? '0' : (dues?.diff || 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <MemberModal member={selected} transactions={transactions} onClose={() => setSelected(null)} />
      )}

    </div>
  );
}
