import { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW, getDuesStartMonth, calcPartBalances, isRefundTx } from '../utils/calculations';
import { toPng } from 'html-to-image';

export default function ShareSummaryModal({ onClose }) {
  const { state } = useApp();
  const { transactions } = state;

  // 이용 가능한 연월 목록 추출 (최근 순)
  const availableMonths = useMemo(() => {
    const months = new Set();
    transactions.forEach(t => {
      if (t.datetime && t.datetime.length >= 7) {
        months.add(t.datetime.slice(0, 7)); // YYYY-MM
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  // 기본값으로 가장 최근 월과 그 이전 월 설정
  const [targetYm, setTargetYm] = useState(availableMonths[0] || '');
  const [priorYm, setPriorYm] = useState(() => {
    if (availableMonths.length > 1) return availableMonths[1];
    if (availableMonths[0]) {
      // YYYY-MM 파싱하여 이전달 계산
      const [y, m] = availableMonths[0].split('-').map(Number);
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      return `${prevY}-${String(prevM).padStart(2, '0')}`;
    }
    return '';
  });

  const cardRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState(''); // '', 'text', 'image', 'error'

  const targetMonthNum = parseInt(targetYm.split('-')[1], 10) || 0;
  const priorMonthNum = parseInt(priorYm.split('-')[1], 10) || 0;

  // 현재 기준일 생성
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}/${now.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][now.getDay()]})`;

  const txMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => map[t.id] = t);
    return map;
  }, [transactions]);

  // 수입/지출 합계 및 내역 집계
  const targetIncomes = useMemo(() => {
    return transactions.filter(t => {
      if (!t.datetime.startsWith(targetYm)) return false;
      const isRefund = isRefundTx(t, txMap);
      return (t.type === 'income' && !isRefund) || (t.type === 'expense' && isRefund);
    });
  }, [transactions, targetYm, txMap]);

  const targetExpenses = useMemo(() => {
    return transactions.filter(t => {
      if (!t.datetime.startsWith(targetYm)) return false;
      const isRefund = isRefundTx(t, txMap);
      return (t.type === 'expense' && !isRefund) || (t.type === 'income' && isRefund);
    });
  }, [transactions, targetYm, txMap]);

  const priorIncomes = useMemo(() => {
    return transactions.filter(t => {
      if (!t.datetime.startsWith(priorYm)) return false;
      const isRefund = isRefundTx(t, txMap);
      return (t.type === 'income' && !isRefund) || (t.type === 'expense' && isRefund);
    });
  }, [transactions, priorYm, txMap]);

  const priorExpenses = useMemo(() => {
    return transactions.filter(t => {
      if (!t.datetime.startsWith(priorYm)) return false;
      const isRefund = isRefundTx(t, txMap);
      return (t.type === 'expense' && !isRefund) || (t.type === 'income' && isRefund);
    });
  }, [transactions, priorYm, txMap]);

  // 유효한 금액 계산 (상계/반환 항목은 음수로 처리)
  const getValidAmount = (tx) => {
    const isRefund = isRefundTx(tx, txMap);
    const multiplier = isRefund ? -1 : 1;

    if (tx.splitItems && tx.splitItems.length > 0) {
      return tx.splitItems.reduce((s, it) => s + (Number(it.amount) || 0) * multiplier, 0);
    }
    return (Number(tx.amount) || 0) * multiplier;
  };

  const targetNet = useMemo(() => {
    const inc = targetIncomes.reduce((s, t) => s + getValidAmount(t), 0);
    const exp = targetExpenses.reduce((s, t) => s + getValidAmount(t), 0);
    return inc - exp;
  }, [targetIncomes, targetExpenses]);

  const priorNet = useMemo(() => {
    const inc = priorIncomes.reduce((s, t) => s + getValidAmount(t), 0);
    const exp = priorExpenses.reduce((s, t) => s + getValidAmount(t), 0);
    return inc - exp;
  }, [priorIncomes, priorExpenses]);

  // 회비 파트별 소계
  const duesSummary = useMemo(() => {
    const duesTxs = targetIncomes.filter(t => {
      if (t.category !== '회비') return false;
      if (t.memberId) {
        const m = state.members.find(x => x.id === t.memberId);
        if (m) {
          const txDate = t.datetime.slice(0, 10);
          if (txDate < m.joinDate) return false;
          if (m.leaveDate && txDate > m.leaveDate) return false;
        }
      }
      return true;
    });
    const total = duesTxs.reduce((s, t) => s + getValidAmount(t), 0);
    const dance = duesTxs.filter(t => t.part === 'DANCE').reduce((s, t) => s + getValidAmount(t), 0);
    const voiceSession = duesTxs.filter(t => t.part === 'VOIX' || t.part === 'SESSION').reduce((s, t) => s + getValidAmount(t), 0);
    const common = duesTxs.filter(t => t.part === '공통' || !t.part).reduce((s, t) => s + getValidAmount(t), 0);

    return { total, dance, voiceSession, common };
  }, [targetIncomes, state.members]);

  // 기타 수입 그룹화
  const otherIncomesSummary = useMemo(() => {
    const otherTxs = targetIncomes.filter(t => {
      if (t.category !== '회비') return true;
      if (t.memberId) {
        const m = state.members.find(x => x.id === t.memberId);
        if (m) {
          const txDate = t.datetime.slice(0, 10);
          if (txDate < m.joinDate || (m.leaveDate && txDate > m.leaveDate)) return true; // 가입 전/탈퇴 후면 기타 수입으로 취급
        }
      }
      return false;
    });
    
    const groups = {};
    otherTxs.forEach(t => {
      let cat = t.category || '이자/기타';
      if (t.category === '회비') cat = '기타수입'; // 잘못 분류된 회비는 기타수입으로
      else if (t.description.includes('이자')) cat = '이자';
      
      groups[cat] = (groups[cat] || 0) + getValidAmount(t);
    });
    return Object.entries(groups).map(([cat, amount]) => ({ cat, amount }));
  }, [targetIncomes, state.members]);

  // 특정 달의 회비 기준액 계산
  const targetMonthlyBasis = useMemo(() => {
    let basis = 0;
    if (!targetYm) return 0;
    const [y, m] = targetYm.split('-').map(Number);
    
    state.members.forEach(member => {
      if (!member.joinDate || member.status !== 'active') return;
      const joinMonth = getDuesStartMonth(member.joinDate);
      const targetDate = new Date(y, m - 1, 1);
      if (targetDate < joinMonth) return; // 아직 가입 안 함
      
      if (member.leaveDate) {
        const leaveDate = new Date(member.leaveDate + 'T00:00:00');
        const leaveMonth = new Date(leaveDate.getFullYear(), leaveDate.getMonth(), 1);
        if (targetDate > leaveMonth) return; // 이미 탈퇴함
      }
      
      const memberType = member.type || '직장인';
      if (y < 2025 || (y === 2025 && m < 2)) {
        // 0
      } else if (y === 2025 && m >= 2 && m <= 7) {
        basis += (memberType === '학생' ? 5000 : 20000);
      } else {
        basis += 10000;
      }
    });
    return basis;
  }, [state.members, targetYm]);

  // 출금 내역 그룹화 (상계/반환 반영)
  const flattenExpenses = (expenses) => {
    return expenses.flatMap(tx => {
      const isRefund = isRefundTx(tx, txMap);
      const multiplier = isRefund ? -1 : 1;
      if (tx.splitItems && tx.splitItems.length > 0) {
        return tx.splitItems.map(it => ({
          category: it.category || tx.category || '소모품',
          desc: it.desc || tx.note || tx.description,
          amount: (Number(it.amount) || 0) * multiplier
        }));
      }
      return [{
        category: tx.category || '소모품',
        desc: tx.note || tx.description,
        amount: (Number(tx.amount) || 0) * multiplier
      }];
    }).filter(t => t.amount !== 0);
  };

  const expenseSummaryByCategory = useMemo(() => {
    const flatPrior = flattenExpenses(priorExpenses);
    const flatTarget = flattenExpenses(targetExpenses);
    const allExps = [...flatPrior, ...flatTarget];
    
    const categories = Array.from(new Set(allExps.map(t => t.category)));
    
    return categories.map(cat => {
      const priorList = flatPrior.filter(t => t.category === cat);
      const targetList = flatTarget.filter(t => t.category === cat);
      return { category: cat, priorList, targetList };
    });
  }, [priorExpenses, targetExpenses]);

  // 1. 텍스트 요약문 생성
  const summaryText = useMemo(() => {
    let txt = `${dateStr} 기준\n`;
    txt += `${priorMonthNum}월 ${priorNet >= 0 ? '+' : ''}${priorNet.toLocaleString()}원\n`;
    txt += `${targetMonthNum}월 ${targetNet >= 0 ? '+' : ''}${targetNet.toLocaleString()}원\n\n`;

    txt += `📍 ${targetMonthNum}월 입금 내역\n`;
    let incIdx = 1;
    if (duesSummary.total > 0) {
      let statusText = '';
      if (duesSummary.total >= targetMonthlyBasis && targetMonthlyBasis > 0) {
        statusText = duesSummary.total === targetMonthlyBasis ? ' (완납)' : ' (초과 납부)';
      } else if (targetMonthlyBasis > 0) {
        statusText = ` (기준 ${targetMonthlyBasis.toLocaleString()}원)`;
      }

      txt += `${incIdx}. 회비 ${duesSummary.total.toLocaleString()}원${statusText}\n`;
      if (duesSummary.dance > 0) txt += `- 댄스 ${duesSummary.dance.toLocaleString()}원\n`;
      if (duesSummary.voiceSession > 0) txt += `- 보컬/세션 ${duesSummary.voiceSession.toLocaleString()}원\n`;
      if (duesSummary.common > 0) txt += `- 공통 ${duesSummary.common.toLocaleString()}원\n`;
      incIdx++;
    }

    otherIncomesSummary.forEach(item => {
      txt += `${incIdx}. ${item.cat} ${item.amount.toLocaleString()}원\n`;
      incIdx++;
    });

    if (targetIncomes.length === 0) txt += `입금 내역 없음\n`;

    txt += `\n📍 ${priorMonthNum}~${targetMonthNum}월 출금 내역\n`;
    if (expenseSummaryByCategory.length === 0) {
      txt += `출금 내역 없음\n`;
    } else {
      expenseSummaryByCategory.forEach((item, idx) => {
        txt += `${idx + 1}. ${item.category}\n`;
        if (item.priorList.length > 0) {
          txt += `[${priorMonthNum}월]\n`;
          item.priorList.forEach(t => {
            txt += `- ${t.desc} ${t.amount.toLocaleString()}원\n`;
          });
        }
        if (item.targetList.length > 0) {
          txt += `[${targetMonthNum}월]\n`;
          item.targetList.forEach(t => {
            txt += `- ${t.desc} ${t.amount.toLocaleString()}원\n`;
          });
        }
        txt += `\n`;
      });
    }

    txt += `\n🔗 https://lumique-beta.vercel.app/`;

    return txt.trim();
  }, [dateStr, priorMonthNum, targetMonthNum, priorNet, targetNet, duesSummary, otherIncomesSummary, expenseSummaryByCategory, targetIncomes]);

  // 텍스트 복사 핸들러
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      showStatus('text');
    } catch (err) {
      showStatus('error');
    }
  };

  // 이미지 복사 핸들러 (Clipboard API)
  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    try {
      // toPng를 사용하여 안정적으로 생성 후 Blob 변환
      const dataUrl = await toPng(cardRef.current, {
        backgroundColor: '#f8fafc',
        width: 420,
        pixelRatio: 2,
        style: {
          transform: 'scale(1)',
          borderRadius: '0px',
          margin: '0'
        }
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]);
      showStatus('image');
    } catch (err) {
      console.error(err);
      showStatus('error');
    }
  };

  // 이미지 저장 핸들러
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { 
        backgroundColor: '#f8fafc',
        width: 420,
        pixelRatio: 2,
        style: { margin: '0' }
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Lumique_Summary_${targetYm}.png`;
      a.click();
    } catch (err) {
      alert('이미지 저장에 실패했습니다.');
    }
  };

  const showStatus = (status) => {
    setCopyStatus(status);
    setTimeout(() => setCopyStatus(''), 2000);
  };

  // 이미지 카드용 데이터 집계 (이번달 기준 + 전체 잔액)
  const imageStats = useMemo(() => {
    const realTotalBalance = transactions.reduce((s, tx) => tx.type === 'income' ? s + tx.amount : s - tx.amount, 0);
    const realPartBalances = calcPartBalances(transactions);
    
    const targetIncomeTotal = targetIncomes.reduce((s, t) => s + getValidAmount(t), 0);
    const targetExpenseTotal = targetExpenses.reduce((s, t) => s + getValidAmount(t), 0);
    
    const topIncomes = [];
    if (duesSummary.total > 0) topIncomes.push({ cat: '회비', amount: duesSummary.total });
    otherIncomesSummary.forEach(i => { if (i.amount > 0) topIncomes.push({ cat: i.cat, amount: i.amount }) });
    topIncomes.sort((a, b) => b.amount - a.amount);
    
    const topExpenses = expenseSummaryByCategory.map(item => {
      const sum = item.targetList.reduce((s, t) => s + t.amount, 0);
      return { cat: item.category, amount: sum };
    }).filter(i => i.amount > 0).sort((a, b) => b.amount - a.amount);

    return { realTotalBalance, realPartBalances, targetIncomeTotal, targetExpenseTotal, topIncomes, topExpenses };
  }, [transactions, targetIncomes, targetExpenses, duesSummary, otherIncomesSummary, expenseSummaryByCategory]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📊 월별 요약 공유</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--slate-400)' }}>✕</button>
        </div>

        {/* 선택 옵션 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 6 }}>대상 월</label>
            <select value={targetYm} onChange={e => setTargetYm(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--slate-200)', borderRadius: 10 }}>
              {availableMonths.map(m => <option key={m} value={m}>{m.replace('-', '년 ')}월</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 6 }}>이전 월 (비교군)</label>
            <select value={priorYm} onChange={e => setPriorYm(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--slate-200)', borderRadius: 10 }}>
              {availableMonths.map(m => <option key={m} value={m}>{m.replace('-', '년 ')}월</option>)}
            </select>
          </div>
        </div>

        {/* 탭 / 컨트롤 버튼 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleCopyText}>
            📋 텍스트 복사
          </button>
          <button className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--emerald-600)' }} onClick={handleCopyImage}>
            🖼️ 이미지 복사
          </button>
          <button className="btn-secondary" style={{ flex: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }} onClick={handleDownloadImage} title="이미지 다운로드">
            💾 저장
          </button>
        </div>

        {/* 복사 성공 메시지 */}
        {copyStatus && (
          <div style={{
            padding: '10px',
            borderRadius: 8,
            backgroundColor: copyStatus === 'error' ? '#fef2f2' : '#f0fdf4',
            color: copyStatus === 'error' ? 'var(--red-500)' : '#16a34a',
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            marginBottom: 16
          }}>
            {copyStatus === 'text' && '📋 텍스트 요약이 클립보드에 복사되었습니다!'}
            {copyStatus === 'image' && '🖼️ 요약 카드 이미지가 클립보드에 복사되었습니다!'}
            {copyStatus === 'error' && '❌ 클립보드 복사에 실패했습니다. 브라우저 설정을 확인해주세요.'}
          </div>
        )}

        {/* 텍스트 미리보기 및 이미지 카드 렌더링 */}
        <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--slate-200)', borderRadius: 12, padding: 16, background: 'var(--slate-50)' }}>
          
          <div style={{ fontSize: 11, color: 'var(--slate-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 16, textAlign: 'center' }}>공유 카드 이미지 미리보기 (스크롤 가능)</div>
          
          {/* 실제로 이미지로 변환될 DOM 영역 */}
          <div ref={cardRef} style={{
            width: '420px',
            minWidth: '420px',
            margin: '0 auto',
            padding: '32px 24px',
            background: '#ffffff',
            borderRadius: 24,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: 'var(--slate-800)',
            boxSizing: 'border-box'
          }}>
            {/* 1. 상단 헤더 (로고 & 배지) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <img src="/logo.png" alt="Lumique" style={{ height: 18, width: 'auto', objectFit: 'contain' }} />
                <div style={{ fontFamily: '"Outfit", sans-serif', fontSize: 17, fontWeight: 800, color: '#334155', letterSpacing: '-0.5px' }}>Lumique</div>
              </div>
              <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '5px 12px', borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
                {targetMonthNum}월 재무 현황
              </div>
            </div>

            {/* 2. 중앙 총 잔액 */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 14, color: 'var(--slate-500)', marginBottom: 4 }}>현재 총 잔액</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', letterSpacing: '-1px' }}>
                {imageStats.realTotalBalance < 0 ? '-' : ''}{Math.abs(imageStats.realTotalBalance).toLocaleString()}원
              </div>
              <div style={{ fontSize: 12, color: 'var(--slate-400)', marginTop: 8 }}>
                업데이트: {new Date().getFullYear()}.{String(new Date().getMonth() + 1).padStart(2, '0')}.{String(new Date().getDate()).padStart(2, '0')}
              </div>

              {/* 파트별 잔고 현황 */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
                {[
                  { label: 'VOIX·SESSION', val: (imageStats.realPartBalances['VOIX'] || 0) + (imageStats.realPartBalances['SESSION'] || 0) },
                  { label: 'DANCE', val: imageStats.realPartBalances['DANCE'] || 0 },
                  { label: '공통', val: imageStats.realPartBalances['공통'] || 0 },
                ].map(p => (
                  <div key={p.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{p.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: p.val < 0 ? '#e11d48' : '#0f172a' }}>
                      {p.val < 0 ? '-' : ''}{Math.abs(p.val).toLocaleString()}원
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 수입/지출 바 */}
            <div style={{ background: 'var(--slate-50)', padding: 16, borderRadius: 16, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600 }}>{targetMonthNum}월 수입</div>
                  <div style={{ fontSize: 16, color: '#16a34a', fontWeight: 800 }}>+{imageStats.targetIncomeTotal.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600 }}>{targetMonthNum}월 지출</div>
                  <div style={{ fontSize: 16, color: '#e11d48', fontWeight: 800 }}>-{imageStats.targetExpenseTotal.toLocaleString()}</div>
                </div>
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#e2e8f0' }}>
                <div style={{ width: `${imageStats.targetIncomeTotal + imageStats.targetExpenseTotal > 0 ? (imageStats.targetIncomeTotal / (imageStats.targetIncomeTotal + imageStats.targetExpenseTotal)) * 100 : 50}%`, background: '#22c55e' }} />
                <div style={{ width: `${imageStats.targetIncomeTotal + imageStats.targetExpenseTotal > 0 ? (imageStats.targetExpenseTotal / (imageStats.targetIncomeTotal + imageStats.targetExpenseTotal)) * 100 : 50}%`, background: '#ef4444' }} />
              </div>
            </div>

            {/* 3. 수입/지출 핵심 항목 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 12, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>수입 (Top 4)</div>
                  {imageStats.topIncomes.slice(0, 4).map(item => (
                    <div key={item.cat} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: 'var(--slate-600)' }}>{item.cat}</span>
                      <span style={{ fontWeight: 700 }}>{item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  {imageStats.topIncomes.length === 0 && <div style={{ fontSize: 12, color: 'var(--slate-400)' }}>수입 없음</div>}
                </div>
                <div style={{ width: 1, background: '#e2e8f0' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 12, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>지출 (Top 4)</div>
                  {imageStats.topExpenses.slice(0, 4).map(item => (
                    <div key={item.cat} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: 'var(--slate-600)' }}>{item.cat}</span>
                      <span style={{ fontWeight: 700 }}>{item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  {imageStats.topExpenses.length === 0 && <div style={{ fontSize: 12, color: 'var(--slate-400)' }}>지출 없음</div>}
                </div>
              </div>
            </div>

            {/* 4. 파트별 잔고 현황 */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 12 }}>파트별 잔고 현황</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {['VOIX · SESSION', 'DANCE', '공통'].map(p => {
                  let partBal = 0;
                  if (p === 'VOIX · SESSION') {
                    partBal = (imageStats.realPartBalances['VOIX'] || 0) + (imageStats.realPartBalances['SESSION'] || 0);
                  } else {
                    partBal = imageStats.realPartBalances[p] || 0;
                  }
                  return (
                    <div key={p} style={{ background: partBal < 0 ? '#fef2f2' : '#f8fafc', border: `1px solid ${partBal < 0 ? '#fecdd3' : '#e2e8f0'}`, borderRadius: 12, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, marginBottom: 4 }}>{p}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: partBal < 0 ? '#e11d48' : '#0f172a' }}>
                        {partBal.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#cbd5e1', fontWeight: 600 }}>
              Lumique Financial Ledger
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
