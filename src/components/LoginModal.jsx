import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import '../pages/Pages.css';

export default function LoginModal() {
  const { login, setShowLoginModal } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (login(password)) {
      setError(false);
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
      <div className="modal-sheet" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>
          관리자 권한 필요
        </h3>
        <p className="text-muted" style={{ marginBottom: 20 }}>
          데이터 수정 및 편집을 위해서는 관리자 비밀번호가 필요합니다.
        </p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 입력"
            autoFocus
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 8,
              border: `1px solid ${error ? 'var(--red-500)' : 'var(--slate-200)'}`,
              fontSize: 15, marginBottom: 8, outline: 'none'
            }}
          />
          {error && <div className="text-red" style={{ fontSize: 13, marginBottom: 12 }}>비밀번호가 일치하지 않습니다.</div>}
          
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn-secondary" onClick={() => setShowLoginModal(false)} style={{ flex: 1, margin: 0 }}>취소</button>
            <button type="submit" className="btn-primary" style={{ flex: 2, margin: 0 }}>로그인</button>
          </div>
        </form>
      </div>
    </div>
  );
}
