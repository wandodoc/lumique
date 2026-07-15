import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './ChangePwdModal.css';

export default function ChangePwdModal({ onClose }) {
  const { changePassword } = useAuth();
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!oldPwd || !newPwd || !confirmPwd) {
      return alert('모든 비밀번호 필드를 입력해주세요.');
    }
    if (newPwd !== confirmPwd) {
      return alert('새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.');
    }
    if (newPwd.length < 4) {
      return alert('새 비밀번호는 4자리 이상이어야 합니다.');
    }
    const success = changePassword(oldPwd, newPwd);
    if (success) {
      alert('비밀번호가 성공적으로 변경되었습니다.');
      onClose();
    } else {
      alert('기존 비밀번호가 일치하지 않습니다.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet pwd-modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 className="pwd-modal-title">공용 비밀번호 변경</h3>
        <form onSubmit={handleSubmit} className="pwd-modal-form">
          <input 
            type="password" 
            value={oldPwd} 
            onChange={e => setOldPwd(e.target.value)} 
            placeholder="기존 비밀번호 입력" 
            autoFocus 
            className="pwd-modal-input" 
          />
          <input 
            type="password" 
            value={newPwd} 
            onChange={e => setNewPwd(e.target.value)} 
            placeholder="새 비밀번호 입력" 
            className="pwd-modal-input" 
          />
          <input 
            type="password" 
            value={confirmPwd} 
            onChange={e => setConfirmPwd(e.target.value)} 
            placeholder="새 비밀번호 확인 입력" 
            className="pwd-modal-input pwd-modal-input-last" 
          />
          <div className="pwd-modal-actions">
            <button type="button" className="btn-secondary pwd-modal-cancel" onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary pwd-modal-submit">변경하기</button>
          </div>
        </form>
      </div>
    </div>
  );
}
