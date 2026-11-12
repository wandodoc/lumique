import { useMemo, useState } from 'react';

// 공연 정산표: "공연에 쓸 수 있는 돈"(티켓 판매·부원 관람분·공연 부원 회비·후원금)과
// "공연에 든 돈"(먼저 결제한 지출)을 한 표로 보여 준다. 장부(입출금 내역)는 건드리지 않고,
// 설정과 지출 목록만 공연 레코드의 settlement 필드에 저장한다.
const DEFAULT_MONTHLY_DUES = 10000;
const DEFAULT_PREP_MONTHS = 3;

const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}원`;
const toAmount = (v) => {
  const n = Math.floor(Number(String(v ?? '').replace(/[^0-9.]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
// 금액 입력 칸: 숫자만 남기고 입력 중에도 1,000 단위 구분 기호를 보여 준다.
const formatAmountInput = (v) => {
  const digits = String(v ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString() : '';
};
const toMonths = (v, fallback) => {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 60) : fallback;
};
const newId = () => `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const sectionTitle = { fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 };
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid #f1f5f9' };
const nameStyle = { fontSize: 14, fontWeight: 700, color: '#111827' };
const descStyle = { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.5 };
const amountStyle = { fontSize: 14, fontWeight: 800, color: '#111827', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const inputStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', minWidth: 0 };
const smallButton = { padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };

export default function ShowSettlementCard({
  show, isAdmin, onPatchShow,
  ticketCash, duesCoveredSum, duesCoveredCount, donationSum, donationCount,
  participantIds, members, bandMembers,
}) {
  const [showDuesSettings, setShowDuesSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expenseLabel, setExpenseLabel] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePaidBy, setExpensePaidBy] = useState('');
  const [editingExpense, setEditingExpense] = useState(null); // { id, label, amount, paidBy }

  const settlement = useMemo(() => {
    const raw = show?.settlement && typeof show.settlement === 'object' ? show.settlement : {};
    const monthly = Number(raw.monthlyDues);
    const months = Number(raw.prepMonths);
    return {
      monthlyDues: raw.monthlyDues !== undefined && raw.monthlyDues !== null && Number.isFinite(monthly) && monthly >= 0 ? monthly : DEFAULT_MONTHLY_DUES,
      prepMonths: raw.prepMonths !== undefined && raw.prepMonths !== null && Number.isFinite(months) && months >= 0 ? months : DEFAULT_PREP_MONTHS,
      memberMonths: raw.memberMonths && typeof raw.memberMonths === 'object' ? raw.memberMonths : {},
      expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    };
  }, [show]);

  // 공연 참가자 중 동아리 회원 목록에 있는 사람만 "공연 부원"으로 본다. 나머지는 객원(외부 공연자).
  const { officials, guests } = useMemo(() => {
    const officialList = [];
    const guestList = [];
    (Array.isArray(participantIds) ? participantIds : []).forEach(id => {
      const member = (members || []).find(m => m.id === id);
      if (member) officialList.push(member);
      else guestList.push({ id, name: bandMembers?.[id]?.name || id });
    });
    return { officials: officialList, guests: guestList };
  }, [participantIds, members, bandMembers]);

  const duesRows = officials.map(m => ({ id: m.id, name: m.name, part: m.part || '', months: toMonths(settlement.memberMonths[m.id], settlement.prepMonths) }));
  const totalMonths = duesRows.reduce((sum, r) => sum + r.months, 0);
  const memberDuesSum = totalMonths * settlement.monthlyDues;
  const allSameMonths = duesRows.every(r => r.months === settlement.prepMonths);
  const duesFormula = duesRows.length === 0
    ? '공연 관리에 등록된 부원 참가자가 없습니다'
    : allSameMonths
      ? `${duesRows.length}명 × ${won(settlement.monthlyDues)} × ${settlement.prepMonths}개월`
      : `${duesRows.length}명 · 부원별 기간 합계 ${totalMonths}개월 × ${won(settlement.monthlyDues)}`;

  const fundTotal = (Number(ticketCash) || 0) + (Number(duesCoveredSum) || 0) + memberDuesSum + (Number(donationSum) || 0);
  const fromDues = (Number(duesCoveredSum) || 0) + memberDuesSum;
  const expenseTotal = settlement.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const owedByPerson = settlement.expenses.reduce((map, e) => {
    if (e.reimbursed) return map;
    const key = String(e.paidBy || '').trim() || '결제자 미기재';
    map[key] = (map[key] || 0) + (Number(e.amount) || 0);
    return map;
  }, {});
  const owedTotal = Object.values(owedByPerson).reduce((sum, v) => sum + v, 0);
  const balance = fundTotal - expenseTotal;

  const save = async (patch) => {
    if (!isAdmin || saving) return false;
    setSaving(true);
    try {
      return await onPatchShow({ settlement: { ...settlement, ...patch } });
    } finally {
      setSaving(false);
    }
  };

  const commitMemberMonths = (memberId, value) => {
    const months = toMonths(value, settlement.prepMonths);
    const next = { ...settlement.memberMonths };
    if (months === settlement.prepMonths) delete next[memberId]; else next[memberId] = months;
    if (JSON.stringify(next) !== JSON.stringify(settlement.memberMonths)) save({ memberMonths: next });
  };

  const addExpense = async () => {
    const label = expenseLabel.trim();
    const amount = toAmount(expenseAmount);
    if (!label || amount <= 0) {
      window.alert('지출 항목 이름과 금액을 입력해 주세요.');
      return;
    }
    const ok = await save({ expenses: [...settlement.expenses, { id: newId(), label, amount, paidBy: expensePaidBy.trim(), reimbursed: false, createdAt: new Date().toISOString() }] });
    if (ok) { setExpenseLabel(''); setExpenseAmount(''); setExpensePaidBy(''); }
  };
  const toggleReimbursed = (id) => save({ expenses: settlement.expenses.map(e => (e.id === id ? { ...e, reimbursed: !e.reimbursed } : e)) });
  const saveEditedExpense = async () => {
    const label = String(editingExpense?.label || '').trim();
    const amount = toAmount(editingExpense?.amount);
    if (!label || amount <= 0) {
      window.alert('지출 항목 이름과 금액을 입력해 주세요.');
      return;
    }
    const ok = await save({
      expenses: settlement.expenses.map(e => (e.id === editingExpense.id ? { ...e, label, amount, paidBy: String(editingExpense.paidBy || '').trim() } : e)),
    });
    if (ok) setEditingExpense(null);
  };
  const removeExpense = (expense) => {
    if (!window.confirm(`'${expense.label}' ${won(expense.amount)} 지출 기록을 삭제할까요?`)) return;
    save({ expenses: settlement.expenses.filter(e => e.id !== expense.id) });
  };

  const personNames = [...officials.map(m => m.name), ...guests.map(g => g.name)];

  return (
    <div className="card card-pad" style={{ borderRadius: 20, border: '1px solid #e2e8f0', background: '#fff', display: 'grid', gap: 18 }}>
      <style>{`
        .settlement-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 40px; align-items: start; }
        @media (max-width: 860px) { .settlement-cols { grid-template-columns: 1fr; gap: 20px; } }
      `}</style>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>공연 정산</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>수입과 지출을 비교합니다. 입출금 장부에는 영향을 주지 않습니다.</p>
      </div>

      <div className="settlement-cols">
      {/* ── 수입 ── */}
      <section style={{ minWidth: 0 }}>
        <h3 style={sectionTitle}>수입</h3>
        <div style={{ marginTop: 6 }}>
          <div style={rowStyle}>
            <div><div style={nameStyle}>티켓 판매</div><div style={descStyle}>관객이 계좌로 입금한 금액</div></div>
            <div style={amountStyle}>{won(ticketCash)}</div>
          </div>
          <div style={rowStyle}>
            <div>
              <div style={nameStyle}>부원 관람분</div>
              <div style={descStyle}>공연을 보러 온 부원은 티켓값을 받지 않고, 그만큼 동아리 회비에서 채웁니다{duesCoveredCount > 0 ? ` (${duesCoveredCount}건)` : ''}</div>
            </div>
            <div style={amountStyle}>{won(duesCoveredSum)}</div>
          </div>
          <div style={rowStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...nameStyle, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                공연 부원 회비
                <button type="button" style={smallButton} aria-expanded={showDuesSettings} onClick={() => setShowDuesSettings(v => !v)}>{showDuesSettings ? '설정 닫기' : '설정'}</button>
              </div>
              <div style={descStyle}>공연을 준비한 부원이 준비 기간 동안 낸 회비 ({duesFormula})</div>
              {guests.length > 0 && <div style={{ ...descStyle, color: '#94a3b8' }}>객원 {guests.length}명은 포함되지 않습니다 ({guests.map(g => g.name).join(', ')})</div>}
            </div>
            <div style={amountStyle}>{won(memberDuesSum)}</div>
          </div>

          {showDuesSettings && (
            <div style={{ margin: '0 0 10px', padding: 14, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  한 달 회비 (원)
                  <input type="text" inputMode="numeric" disabled={!isAdmin || saving} style={{ ...inputStyle, width: 130 }}
                    key={`dues:${settlement.monthlyDues}`} defaultValue={settlement.monthlyDues.toLocaleString()}
                    onChange={e => { e.target.value = formatAmountInput(e.target.value); }}
                    onBlur={e => { const v = toAmount(e.target.value); if (v !== settlement.monthlyDues) save({ monthlyDues: v }); }} />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  준비 기간 (개월)
                  <input type="number" min="0" step="1" disabled={!isAdmin || saving} style={{ ...inputStyle, width: 110 }}
                    key={`months:${settlement.prepMonths}`} defaultValue={settlement.prepMonths}
                    onBlur={e => { const v = toMonths(e.target.value, settlement.prepMonths); if (v !== settlement.prepMonths) save({ prepMonths: v }); }} />
                </label>
                <span style={{ fontSize: 12, color: '#64748b', paddingBottom: 8 }}>칸을 벗어나면 저장됩니다.</span>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>부원별 준비 기간 — 중간에 합류했거나 일부만 참여한 부원은 개월 수를 고쳐 주세요</div>
                {duesRows.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>공연 관리에서 이 공연의 참가자를 먼저 등록해 주세요.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                    {duesRows.map(r => (
                      <label key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#fff', border: `1px solid ${r.months === settlement.prepMonths ? '#e2e8f0' : '#fcd34d'}`, fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: '#111827', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}{r.part ? <span style={{ fontWeight: 500, color: '#94a3b8' }}> {r.part}</span> : null}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <input type="number" min="0" step="1" disabled={!isAdmin || saving} aria-label={`${r.name} 준비 기간(개월)`} style={{ ...inputStyle, width: 60, padding: '5px 6px', textAlign: 'right' }}
                            key={`${r.id}:${r.months}`} defaultValue={r.months} onBlur={e => commitMemberMonths(r.id, e.target.value)} />
                          <span style={{ color: '#64748b', fontSize: 12 }}>개월</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={rowStyle}>
            <div><div style={nameStyle}>후원금</div><div style={descStyle}>따로 받은 후원{donationCount > 0 ? ` (${donationCount}건)` : ''} · 아래 후원금 카드에서 기록합니다</div></div>
            <div style={amountStyle}>{won(donationSum)}</div>
          </div>
          <div style={{ ...rowStyle, borderTop: '2px solid #0f172a', paddingTop: 12 }}>
            <div>
              <div style={{ ...nameStyle, fontSize: 15 }}>합계</div>
              {fromDues > 0 && <div style={descStyle}>회비 충당 {won(fromDues)}</div>}
            </div>
            <div style={{ ...amountStyle, fontSize: 17 }}>{won(fundTotal)}</div>
          </div>
        </div>
      </section>

      {/* ── 지출 ── */}
      <section style={{ minWidth: 0 }}>
        <h3 style={sectionTitle}>지출</h3>
        <div style={{ marginTop: 6 }}>
          {settlement.expenses.length === 0 && (
            <div style={{ ...rowStyle, color: '#94a3b8', fontSize: 13 }}>아직 기록된 지출이 없습니다. 대관료, 연습실, 팜플렛 등 공연에 쓴 돈을 적어 주세요.</div>
          )}
          {settlement.expenses.map(e => (
            editingExpense?.id === e.id ? (
              <div key={e.id} style={{ ...rowStyle, alignItems: 'center', flexWrap: 'wrap', gap: 8, background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                <input type="text" value={editingExpense.label} onChange={ev => setEditingExpense(prev => ({ ...prev, label: ev.target.value }))} placeholder="항목" aria-label="지출 항목 수정" style={{ ...inputStyle, flex: '2 1 150px' }} />
                <input type="text" inputMode="numeric" value={editingExpense.amount} onChange={ev => setEditingExpense(prev => ({ ...prev, amount: formatAmountInput(ev.target.value) }))} placeholder="금액" aria-label="지출 금액 수정" style={{ ...inputStyle, flex: '1 1 90px' }} />
                <input type="text" value={editingExpense.paidBy} onChange={ev => setEditingExpense(prev => ({ ...prev, paidBy: ev.target.value }))} placeholder="선결제자" aria-label="선결제자 수정" list="settlement-person-names" style={{ ...inputStyle, flex: '1 1 110px' }} />
                <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" disabled={saving} onClick={saveEditedExpense} style={{ ...smallButton, background: '#111827', color: '#fff', border: 'none' }}>{saving ? '저장 중…' : '저장'}</button>
                  <button type="button" disabled={saving} onClick={() => setEditingExpense(null)} style={smallButton}>취소</button>
                </span>
              </div>
            ) : (
            <div key={e.id} style={{ ...rowStyle, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                <div style={nameStyle}>{e.label}</div>
                <div style={descStyle}>{String(e.paidBy || '').trim() ? `선결제: ${String(e.paidBy).trim()}` : '선결제자 미기재'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: e.reimbursed ? '#047857' : '#64748b', cursor: isAdmin ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={Boolean(e.reimbursed)} disabled={!isAdmin || saving} onChange={() => toggleReimbursed(e.id)} />
                  정산 완료
                </label>
                <div style={amountStyle}>{won(e.amount)}</div>
                {isAdmin && <button type="button" aria-label={`${e.label} 지출 수정`} disabled={saving} onClick={() => setEditingExpense({ id: e.id, label: e.label, amount: formatAmountInput(e.amount), paidBy: e.paidBy || '' })} style={{ ...smallButton, padding: '4px 8px' }}>수정</button>}
                {isAdmin && <button type="button" aria-label={`${e.label} 지출 삭제`} disabled={saving} onClick={() => removeExpense(e)} style={{ ...smallButton, border: '1px solid #fca5a5', color: '#dc2626', padding: '4px 8px' }}>삭제</button>}
              </div>
            </div>
            )
          ))}

          {isAdmin && (
            <div style={{ ...rowStyle, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <input type="text" value={expenseLabel} onChange={e => setExpenseLabel(e.target.value)} placeholder="항목 (예: 공연장 대관)" aria-label="지출 항목" style={{ ...inputStyle, flex: '2 1 160px' }} />
              <input type="text" inputMode="numeric" value={expenseAmount} onChange={e => setExpenseAmount(formatAmountInput(e.target.value))} placeholder="금액" aria-label="지출 금액" style={{ ...inputStyle, flex: '1 1 100px' }} />
              <input type="text" value={expensePaidBy} onChange={e => setExpensePaidBy(e.target.value)} placeholder="선결제자" aria-label="선결제자" list="settlement-person-names" style={{ ...inputStyle, flex: '1 1 120px' }} />
              <datalist id="settlement-person-names">{personNames.map(n => <option key={n} value={n} />)}</datalist>
              <button type="button" onClick={addExpense} disabled={saving} style={{ ...smallButton, background: '#111827', color: '#fff', border: 'none', padding: '9px 14px' }}>{saving ? '저장 중…' : '+ 지출 추가'}</button>
            </div>
          )}

          <div style={{ ...rowStyle, borderTop: '2px solid #0f172a', paddingTop: 12 }}>
            <div>
              <div style={{ ...nameStyle, fontSize: 15 }}>합계</div>
              {owedTotal > 0 && (
                <div style={descStyle}>
                  {Object.entries(owedByPerson).map(([person, amount]) => `미정산: ${person} ${won(amount)}`).join(' · ')}
                </div>
              )}
              {expenseTotal > 0 && owedTotal === 0 && <div style={{ ...descStyle, color: '#047857' }}>모두 정산 완료</div>}
            </div>
            <div style={{ ...amountStyle, fontSize: 17 }}>{won(expenseTotal)}</div>
          </div>
        </div>
      </section>
      </div>

      {/* ── 정산 결과 ── */}
      <section style={{ padding: '14px 16px', borderRadius: 14, background: balance >= 0 ? '#ecfdf5' : '#fef2f2', border: `1px solid ${balance >= 0 ? '#a7f3d0' : '#fecaca'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ ...sectionTitle, color: balance >= 0 ? '#047857' : '#b91c1c' }}>정산 결과</h3>
          <div style={{ ...descStyle, color: balance >= 0 ? '#047857' : '#b91c1c' }}>수입 {won(fundTotal)} − 지출 {won(expenseTotal)}</div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: balance >= 0 ? '#047857' : '#b91c1c', whiteSpace: 'nowrap' }}>
          {balance >= 0 ? `잔액 ${won(balance)}` : `부족 ${won(-balance)}`}
        </div>
      </section>
    </div>
  );
}
