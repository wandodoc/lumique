import { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { calcMemberDues, formatKRW } from '../utils/calculations';
import { toBlob } from 'html-to-image';

export default function ShareDuesModal({ onClose, currentPartFilter }) {
  const { state } = useApp();
  const { members, transactions } = state;
  
  const [filterPart, setFilterPart] = useState(currentPartFilter || '전체');
  const [showOnlyUnpaid, setShowOnlyUnpaid] = useState(false);
  const [copyStatus, setCopyStatus] = useState(''); // '', 'text', 'image', 'error'
  const cardRef = useRef(null);

  // 현재 기준일 생성
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

  // 멤버별 납부 데이터 집계
  const duesList = useMemo(() => {
    return members
      .filter(m => m.status === 'active')
      .filter(m => filterPart === '전체' || m.part === filterPart)
      .map(m => {
        const dues = calcMemberDues(m, transactions);
        return {
          id: m.id,
          name: m.name,
          part: m.part,
          basis: dues.basis,
          paid: dues.paid,
          diff: dues.diff,
          status: dues.diff >= 0 ? '완납' : '미납부'
        };
      })
      .filter(item => !showOnlyUnpaid || item.diff < 0)
      // 파트별 정렬 -> 이름순 정렬
      .sort((a, b) => {
        if (a.part !== b.part) return a.part.localeCompare(b.part);
        return a.name.localeCompare(b.name);
      });
  }, [members, transactions, filterPart, showOnlyUnpaid]);

  // 1. 텍스트 복사 핸들러
  const handleCopyText = async () => {
    try {
      let txt = `📢 Lumique 회비 납부 현황 요약\n`;
      txt += `(기준일: ${dateStr})\n`;
      if (filterPart !== '전체') txt += `(파트: ${filterPart})\n`;
      txt += `-------------------------------\n\n`;

      const unpaidItems = duesList.filter(item => item.diff < 0);
      const paidItems = duesList.filter(item => item.diff >= 0);

      txt += `🚨 미납 회원 (${unpaidItems.length}명):\n`;
      if (unpaidItems.length === 0) {
        txt += `- 미납 회원 없음 ✨\n`;
      } else {
        unpaidItems.forEach((item, idx) => {
          txt += `${idx + 1}. ${item.name} (${item.part}) : -${Math.abs(item.diff).toLocaleString()}원 미납\n`;
        });
      }

      txt += `\n✅ 완납 회원 (${paidItems.length}명):\n`;
      if (paidItems.length === 0) {
        txt += `- 완납 회원 없음\n`;
      } else {
        txt += `- ${paidItems.map(item => item.name).join(', ')}\n`;
      }

      const totalUnpaidAmount = unpaidItems.reduce((s, item) => s + Math.abs(item.diff), 0);
      txt += `\n-------------------------------\n`;
      txt += `총원: ${duesList.length}명 | 미납: ${unpaidItems.length}명\n`;
      txt += `누적 총 미납액: ${totalUnpaidAmount.toLocaleString()}원`;

      await navigator.clipboard.writeText(txt.trim());
      showStatus('text');
    } catch (err) {
      showStatus('error');
    }
  };

  // 2. 이미지 복사 핸들러
  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    try {
      const blob = await toBlob(cardRef.current, {
        backgroundColor: '#ffffff',
        style: {
          transform: 'scale(1)',
          borderRadius: '0px'
        }
      });
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      showStatus('image');
    } catch (err) {
      console.error(err);
      showStatus('error');
    }
  };

  // 3. 이미지 저장 핸들러
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    try {
      const blob = await toBlob(cardRef.current, { backgroundColor: '#ffffff' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Lumique_Dues_Status_${dateStr}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('이미지 저장에 실패했습니다.');
    }
  };

  const showStatus = (status) => {
    setCopyStatus(status);
    setTimeout(() => setCopyStatus(''), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-handle" />

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📊 납부 현황 공유</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--slate-400)' }}>✕</button>
        </div>

        {/* 컨트롤 필터 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 6 }}>파트 필터</label>
            <select value={filterPart} onChange={e => setFilterPart(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--slate-200)', borderRadius: 10 }}>
              {['전체', 'VOIX', 'DANCE', 'SESSION'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, paddingBottom: 10 }}>
            <input 
              type="checkbox" 
              id="showOnlyUnpaidChk" 
              checked={showOnlyUnpaid} 
              onChange={e => setShowOnlyUnpaid(e.target.checked)} 
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <label htmlFor="showOnlyUnpaidChk" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--slate-700)' }}>
              미납자만 보기
            </label>
          </div>
        </div>

        {/* 컨트롤 버튼 */}
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

        {/* 성공 피드백 */}
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
            {copyStatus === 'text' && '📋 텍스트 현황이 클립보드에 복사되었습니다!'}
            {copyStatus === 'image' && '🖼️ 납부 현황 표 이미지가 클립보드에 복사되었습니다!'}
            {copyStatus === 'error' && '❌ 클립보드 복사에 실패했습니다. 브라우저 설정을 확인해주세요.'}
          </div>
        )}

        {/* 미리보기 컨테이너 */}
        <div style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto', border: '1px solid var(--slate-200)', borderRadius: 12, padding: 12, background: 'var(--slate-50)' }}>
          <div style={{ fontSize: 11, color: 'var(--slate-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>공유 표 이미지 미리보기</div>

          {/* 이미지 변환 타겟 */}
          <div ref={cardRef} style={{
            padding: '24px 20px',
            background: '#ffffff',
            border: '1.5px solid var(--slate-200)',
            borderRadius: 12,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#1a1a1a',
          }}>
            {/* 타이틀 및 헤더 */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{
                fontSize: 16,
                fontWeight: 800,
                border: '2px solid #000',
                padding: '8px 16px',
                display: 'inline-block',
                marginBottom: 6,
                background: '#f8fafc'
              }}>
                멤버별 납부 현황_요약
              </div>
              <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                Last Updated {dateStr}
              </div>
            </div>

            {/* 표 구조 */}
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              textAlign: 'left',
              border: '1.5px solid #000'
            }}>
              <thead>
                <tr style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  borderBottom: '1.5px solid #000'
                }}>
                  <th style={{ padding: '8px 10px', borderRight: '1px solid #475569', fontWeight: 700 }}>멤버</th>
                  <th style={{ padding: '8px 10px', borderRight: '1px solid #475569', fontWeight: 700, textAlign: 'center' }}>파트</th>
                  <th style={{ padding: '8px 10px', borderRight: '1px solid #475569', fontWeight: 700, textAlign: 'right' }}>납부 기준액</th>
                  <th style={{ padding: '8px 10px', borderRight: '1px solid #475569', fontWeight: 700, textAlign: 'right' }}>납부액</th>
                  <th style={{ padding: '8px 10px', borderRight: '1px solid #475569', fontWeight: 700, textAlign: 'right' }}>미납/초과납부액</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'center' }}>납부 구분</th>
                </tr>
              </thead>
              <tbody>
                {duesList.map((item, idx) => {
                  const isUnpaid = item.diff < 0;
                  const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
                  return (
                    <tr key={item.id} style={{
                      background: isUnpaid ? '#ffe4e6' : rowBg,
                      borderBottom: '1px solid #cbd5e1'
                    }}>
                      <td style={{ padding: '8px 10px', borderRight: '1px solid #cbd5e1', fontWeight: 700 }}>{item.name}</td>
                      <td style={{ padding: '8px 10px', borderRight: '1px solid #cbd5e1', textAlign: 'center' }}>{item.part}</td>
                      <td style={{ padding: '8px 10px', borderRight: '1px solid #cbd5e1', textAlign: 'right' }}>{item.basis.toLocaleString()}</td>
                      <td style={{ padding: '8px 10px', borderRight: '1px solid #cbd5e1', textAlign: 'right' }}>{item.paid.toLocaleString()}</td>
                      <td style={{
                        padding: '8px 10px',
                        borderRight: '1px solid #cbd5e1',
                        textAlign: 'right',
                        color: isUnpaid ? '#e11d48' : '#0f172a',
                        fontWeight: isUnpaid ? 700 : 500
                      }}>
                        {isUnpaid ? `-${Math.abs(item.diff).toLocaleString()}` : item.diff > 0 ? `+${item.diff.toLocaleString()}` : '0'}
                      </td>
                      <td style={{
                        padding: '8px 10px',
                        textAlign: 'center',
                        color: isUnpaid ? '#e11d48' : '#15803d',
                        fontWeight: 700
                      }}>
                        {item.status}
                      </td>
                    </tr>
                  );
                })}
                {duesList.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ padding: 24, textAlign: 'center', color: 'var(--slate-400)' }}>
                      조건에 해당하는 회원이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}
