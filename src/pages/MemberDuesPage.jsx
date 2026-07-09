import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { calcMemberDues, calcDuesBasis, formatKRW } from '../utils/calculations';
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
  const pct = dues.basis > 0 ? (dues.paid / dues.basis) * 100 : 100;
  const isPaid = dues.diff >= 0;
  const partColors = { VOIX: 'var(--voix-color)', DANCE: 'var(--dance-color)', SESSION: 'var(--session-color)' };

  return (
    <div className="member-card" onClick={() => onClick(member)}>
      <div className="member-card-top">
        <div className="member-card-info">
          <span className="member-card-name">{member.name}</span>
          <span className={`badge badge-${member.part.toLowerCase()}`}>{member.part}</span>
          {member.status === 'inactive' && <span className="badge badge-gray">탈퇴</span>}
        </div>
        <span className={`badge ${isPaid ? 'badge-success' : 'badge-danger'}`}>
          {isPaid ? '완납' : `${formatKRW(Math.abs(dues.diff))} 미납`}
        </span>
      </div>
      <ProgressBar pct={pct} color={partColors[member.part] || 'var(--blue-500)'} />
      <div className="member-card-nums">
        <span>{formatKRW(dues.paid)} 납부</span>
        <span className="text-muted">기준 {formatKRW(dues.basis)}</span>
      </div>
    </div>
  );
}

function MemberModal({ member, transactions, onClose }) {
  const dues = calcMemberDues(member, transactions);
  const pct = dues.basis > 0 ? (dues.paid / dues.basis) * 100 : 100;
  const partColors = { VOIX: 'var(--voix-color)', DANCE: 'var(--dance-color)', SESSION: 'var(--session-color)' };
  const memberTxs = transactions
    .filter(tx => tx.memberId === member.id && tx.category === '회비')
    .sort((a, b) => b.datetime.localeCompare(a.datetime));

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
              <strong className={dues.diff < 0 ? 'text-red' : 'text-green'}>
                {dues.diff < 0 ? '-' : '+'}{formatKRW(Math.abs(dues.diff))}
              </strong>
            </div>
          </div>
        </div>
        <p className="card-title" style={{ marginTop: 8 }}>납부 내역</p>
        <div className="modal-tx-list">
          {memberTxs.length === 0 && <p className="text-muted" style={{ textAlign: 'center', padding: 16 }}>납부 내역 없음</p>}
          {memberTxs.map(tx => (
            <div key={tx.id} className="modal-tx-row">
              <span className="text-muted">{tx.datetime.slice(0, 10)}</span>
              <strong className="text-green">+{formatKRW(tx.amount)}</strong>
            </div>
          ))}
        </div>
        <button className="primary-btn" style={{ marginTop: 16 }} onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

export default function MemberDuesPage() {
  const { state } = useApp();
  const { members, transactions } = state;
  const [partFilter, setPartFilter] = useState('전체');
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState(null);

  const filtered = members
    .filter(m => showInactive || m.status === 'active')
    .filter(m => partFilter === '전체' || m.part === partFilter)
    .sort((a, b) => calcMemberDues(a, transactions).diff - calcMemberDues(b, transactions).diff);

  const unpaid = members.filter(m => m.status === 'active' && calcMemberDues(m, transactions).diff < 0);
  const totalPaid = members.filter(m => m.status === 'active')
    .reduce((s, m) => s + calcMemberDues(m, transactions).paid, 0);
  const totalBasis = members.filter(m => m.status === 'active')
    .reduce((s, m) => s + calcMemberDues(m, transactions).basis, 0);
  const overallPct = totalBasis > 0 ? Math.round((totalPaid / totalBasis) * 100) : 0;

  return (
    <div className="page fade-in">
      {/* 전체 납부율 요약 */}
      <div className="card card-pad">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <span className="card-title" style={{ margin: 0 }}>전체 납부 현황</span>
          <strong style={{ color: 'var(--blue-500)', fontSize: 20 }}>{overallPct}%</strong>
        </div>
        <ProgressBar pct={overallPct} color="var(--blue-500)" />
        <div className="flex-between" style={{ marginTop: 10, fontSize: 13, color: 'var(--gray-500)' }}>
          <span>납부 완료 {members.filter(m => m.status === 'active').length - unpaid.length}명</span>
          <span>미납 <strong style={{ color: 'var(--red-500)' }}>{unpaid.length}명</strong></span>
        </div>
      </div>

      {/* 필터 */}
      <div className="filter-row">
        {PARTS.map(p => (
          <button key={p} className={`filter-chip ${partFilter === p ? 'active' : ''}`}
            onClick={() => setPartFilter(p)}>{p}</button>
        ))}
        <button className={`filter-chip ${showInactive ? 'active' : ''}`}
          onClick={() => setShowInactive(v => !v)}>탈퇴 포함</button>
      </div>

      {/* 회원 목록 */}
      <div className="card">
        {filtered.map(m => (
          <MemberCard key={m.id} member={m} transactions={transactions} onClick={setSelected} />
        ))}
      </div>

      {selected && (
        <MemberModal member={selected} transactions={transactions} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
