import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW } from '../utils/calculations';

export default function ExcelImportModal({ onClose }) {
  const { state, dispatch } = useApp();
  const [pasteData, setPasteData] = useState('');
  const [parsedTxs, setParsedTxs] = useState([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [step, setStep] = useState(1);

  // 텍스트 파싱 로직 (TSV 형식)
  const handleParse = () => {
    if (!pasteData.trim()) return;
    
    const lines = pasteData.trim().split('\n');
    const newTxs = [];
    let dupCount = 0;
    
    for (const line of lines) {
      const cols = line.split('\t');
      if (cols.length < 5 || line.includes('거래 일시')) continue;
      
      const parseAmountRaw = (val) => {
        if (!val) return null;
        const clean = val.replace(/,/g, '').trim();
        const num = parseInt(clean, 10);
        return isNaN(num) ? null : num;
      };

      let datetimeStr = cols[0];
      let desc = cols[1];
      let typeStr = cols[2];
      let withdrawVal = null;
      let depositVal = null;
      let note = '';

      if (cols.length === 5) {
        // 수기 5열 포맷: 일시, 내용, 입출금구분, 카테고리, 금액
        const amt = parseAmountRaw(cols[4]);
        if (typeStr.includes('입금')) depositVal = amt;
        else withdrawVal = amt;
      } else {
        // 기존 은행 포맷: 일시, 내용, 메모, ?, 출금, 입금 ...
        withdrawVal = parseAmountRaw(cols[4]);
        depositVal = parseAmountRaw(cols[5]);
        if (cols.length > 7) note = cols[7];
      }
      
      // 날짜 포맷 변환 (2026.07.08 13:14:40 -> 2026-07-08 13:14:40)
      let datetime = datetimeStr.trim().replace(/\./g, '-').slice(0, 19);
      if (datetime.length === 10) datetime += ' 00:00:00';
      else if (datetime.length === 16) datetime += ':00';

      const descTrimmed = desc.trim();
      const typeStrClean = typeStr ? typeStr.trim() : '';

      let type = 'expense';
      let amount = 0;

      // 1단계: 금액 컬럼의 데이터 유무와 부호(+/-)를 우선하여 입출금 판정
      if (depositVal !== null && depositVal > 0 && (withdrawVal === null || withdrawVal === 0)) {
        type = 'income';
        amount = depositVal;
      } else if (withdrawVal !== null && withdrawVal > 0 && (depositVal === null || depositVal === 0)) {
        type = 'expense';
        amount = withdrawVal;
      } else if (depositVal !== null && depositVal < 0) {
        type = 'expense';
        amount = Math.abs(depositVal);
      } else if (withdrawVal !== null && withdrawVal < 0) {
        type = 'expense';
        amount = Math.abs(withdrawVal);
      } 
      // 2단계: 금액으로 알 수 없거나 양쪽에 다 있는 경우 텍스트로 보완 판단
      else {
        const typeStrClean = typeStr.trim();
        if (typeStrClean.includes('입금') || typeStrClean.includes('수입') || typeStrClean.includes('이자')) {
          type = 'income';
        } else if (typeStrClean.includes('출금') || typeStrClean.includes('지출')) {
          type = 'expense';
        } else if (descTrimmed.includes('이자') && !descTrimmed.includes('세') && !descTrimmed.includes('세금')) {
          type = 'income';
        }
        
        const val = depositVal || withdrawVal || 0;
        amount = Math.abs(val);
      }

      if (!amount || isNaN(amount)) continue;

      // 중복 검사: 기존 내역(state.transactions) 및 현재 파싱된 목록(newTxs)에 동일한 데이터가 있는지 확인
      const isDuplicate = state.transactions.some(t => t.datetime === datetime && t.description === descTrimmed && t.amount === amount && t.type === type) ||
                          newTxs.some(t => t.datetime === datetime && t.description === descTrimmed && t.amount === amount && t.type === type);
      
      if (isDuplicate) { dupCount++; continue; }

      let category = type === 'income' ? '이자/기타' : '소모품';
      let part = '공통';
      let memberId = null;

      // 자동 분류 1: 회원 이름 매칭 (회비 납부)
      const member = state.members.find(m => m.name === descTrimmed);
      if (member && type === 'income') {
        category = '회비';
        part = member.part;
        memberId = member.id;
      }
      
      // 자동 분류 2: 키워드 매칭
      else if (desc.includes('연습실')) category = '연습실 대여';
      else if (desc.includes('이자')) category = '이자/기타';
      else if (desc.includes('식당') || desc.includes('식대') || desc.includes('식사') || desc.includes('회식')) category = '식대';
      else if (desc.includes('비품')) category = '비품';
      else if (desc.includes('소모품')) category = '소모품';
      else if (desc.includes('주차')) category = '주차비';
      else if (desc.includes('사례')) category = '사례비';

      newTxs.push({
        id: 'tx_' + Date.now() + Math.random().toString(36).substr(2, 5),
        datetime,
        description: descTrimmed,
        type,
        category,
        amount,
        part,
        memberId,
        note: note ? note.trim() : ''
      });
    }

    setParsedTxs(newTxs);
    setDuplicateCount(dupCount);
    setStep(2);
  };

  const handleSave = () => {
    parsedTxs.forEach(tx => dispatch({ type: 'ADD_TRANSACTION', tx }));
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>
          {step === 1 ? '엑셀에서 복사하여 붙여넣기' : '자동 분류 결과'}
        </h3>
        
        {step === 1 && (
          <div className="fade-in">
            <p className="text-muted" style={{ marginBottom: 12 }}>
              엑셀이나 스프레드시트에서 데이터를 드래그하여 복사(Ctrl+C)한 후, 
              아래 입력창에 붙여넣기(Ctrl+V) 하세요.<br/>
              <span style={{ fontSize: 12 }}>※ 필요 항목: 거래일시, 적요, 거래유형, 거래금액</span>
            </p>
            <textarea
              value={pasteData}
              onChange={e => setPasteData(e.target.value)}
              placeholder="2026.07.08 13:14:40&#9;김정아&#9;입금&#9;토스뱅크&#9;&#9;10,000&#9;2,694,083&#9;"
              style={{
                width: '100%', height: 200, padding: 12, borderRadius: 8,
                border: '1px solid var(--slate-200)', fontFamily: 'monospace', fontSize: 13,
                whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto'
              }}
            />
            <button className="primary-btn" style={{ marginTop: 16 }} onClick={handleParse}>
              데이터 분석하기
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in">
            <div className="alert-banner" style={{ background: 'var(--emerald-50)', borderColor: '#a7f3d0', color: 'var(--emerald-700)', marginBottom: parsedTxs.length === 0 ? 0 : 16 }}>
              <span className="alert-icon">✨</span>
              {parsedTxs.length === 0
                ? duplicateCount > 0
                  ? `붙여넣은 ${duplicateCount}건이 이미 모두 등록된 내역입니다. 중복이므로 추가하지 않습니다.`
                  : '분석된 새 거래 내역이 없습니다. 데이터 형식을 확인해 주세요.'
                : `총 ${parsedTxs.length}건의 새 거래 내역을 분석했습니다.`
              }
            </div>
            {duplicateCount > 0 && parsedTxs.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--slate-500)', marginBottom: 12, padding: '6px 10px', background: 'var(--slate-50)', borderRadius: 8 }}>
                ⚠️ 이미 등록된 중복 {duplicateCount}건은 자동으로 제외되었습니다.
              </div>
            )}
            
            <div className="modal-tx-list" style={{ maxHeight: 300, paddingBottom: 10 }}>
              {parsedTxs.map((tx, idx) => (
                <div key={idx} className="modal-tx-row" style={{ flexDirection: 'column', gap: 6 }}>
                  <div className="flex-between">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={`badge ${tx.type === 'income' ? 'badge-success' : 'badge-danger'}`}>
                        {tx.type === 'income' ? '입금' : '지출'}
                      </span>
                      <strong>{tx.description}</strong>
                    </div>
                    <strong className={tx.type === 'income' ? 'text-green' : 'text-red'}>
                      {formatKRW(tx.amount)}
                    </strong>
                  </div>
                  <div className="flex-between text-muted" style={{ fontSize: 12 }}>
                    <span>{tx.datetime}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {tx.memberId && <span className="badge badge-common" style={{ fontSize: 10, padding: '2px 6px' }}>자동 매칭</span>}
                      <span className="badge badge-gray" style={{ fontSize: 10, padding: '2px 6px' }}>{tx.category} ({tx.part})</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexShrink: 0 }}>
              <button className="btn-secondary" onClick={() => setStep(1)} style={{ flex: '0 0 auto', whiteSpace: 'nowrap', padding: '10px 18px' }}>다시 입력</button>
              <button className="primary-btn" onClick={handleSave} style={{ flex: 1, margin: 0 }}>
                {parsedTxs.length}건 저장하기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
