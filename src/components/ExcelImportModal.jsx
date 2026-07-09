import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW } from '../utils/calculations';

export default function ExcelImportModal({ onClose }) {
  const { state, dispatch } = useApp();
  const [pasteData, setPasteData] = useState('');
  const [parsedTxs, setParsedTxs] = useState([]);
  const [step, setStep] = useState(1);

  // 텍스트 파싱 로직 (TSV 형식)
  const handleParse = () => {
    if (!pasteData.trim()) return;
    
    const lines = pasteData.trim().split('\n');
    const newTxs = [];
    
    for (const line of lines) {
      const cols = line.split('\t');
      // 헤더나 빈 줄 건너뛰기
      if (cols.length < 6 || line.includes('거래 일시')) continue;
      
      const [datetimeStr, desc, typeStr, , , amountStr, , note] = cols;
      
      // 날짜 포맷 변환 (2026.07.08 13:14:40 -> 2026-07-08 13:14)
      let datetime = datetimeStr.trim().replace(/\./g, '-').slice(0, 16);
      if (datetime.length === 10) datetime += ' 00:00';

      const type = typeStr.trim() === '입금' ? 'income' : 'expense';
      const amount = Math.abs(parseInt(amountStr.replace(/,/g, ''), 10));
      if (isNaN(amount)) continue;

      const descTrimmed = desc.trim();

      // 중복 검사: 기존 내역(state.transactions) 및 현재 파싱된 목록(newTxs)에 동일한 데이터가 있는지 확인
      const isDuplicate = state.transactions.some(t => t.datetime === datetime && t.description === descTrimmed && t.amount === amount && t.type === type) ||
                          newTxs.some(t => t.datetime === datetime && t.description === descTrimmed && t.amount === amount && t.type === type);
      
      if (isDuplicate) continue; // 중복 건은 제외

      let category = type === 'income' ? '기타' : '기타지출';
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
      else if (desc.includes('연습실')) category = '연습실대여';
      else if (desc.includes('이자')) category = '이자/기타';
      else if (desc.includes('식당') || desc.includes('식대')) category = '식대';

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
            <div className="alert-banner" style={{ background: 'var(--emerald-50)', borderColor: '#a7f3d0', color: 'var(--emerald-700)', marginBottom: 16 }}>
              <span className="alert-icon">✨</span>
              총 {parsedTxs.length}건의 거래 내역을 분석했습니다.
            </div>
            
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
            
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="type-btn" onClick={() => setStep(1)} style={{ margin: 0 }}>다시 입력</button>
              <button className="primary-btn" onClick={handleSave} style={{ margin: 0 }}>
                {parsedTxs.length}건 저장하기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
