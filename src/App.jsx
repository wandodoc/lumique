import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardPage from './pages/DashboardPage';
import MemberDuesPage from './pages/MemberDuesPage';
import MembersPage from './pages/MembersPage';
import TransactionPage from './pages/TransactionPage';
import AddTransactionPage from './pages/AddTransactionPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import LoginModal from './components/LoginModal';
import './App.css';

const TABS = [
  { id: 'home', label: '대시보드', short: '홈',
    icon: <svg viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg> },
  { id: 'members', label: '회원 관리', short: '회원',
    icon: <svg viewBox="0 0 24 24"><path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg> },
  { id: 'dues', label: '납부 현황', short: '납부',
    icon: <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> },
  { id: 'ledger', label: '입출금 내역', short: '내역',
    icon: <svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-6 4h4"/></svg> },
  { id: 'analytics', label: '분석', short: '분석',
    icon: <svg viewBox="0 0 24 24"><path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg> },
  { id: 'settings', label: '설정', short: '설정',
    icon: <svg viewBox="0 0 24 24"><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
];

const PAGE_TITLES = {
  home: '대시보드', members: '회원 관리', dues: '납부 현황',
  ledger: '입출금 내역', analytics: '분석', settings: '설정',
};

function ChangePwdModal({ onClose }) {
  const { changePassword } = useAuth();
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newPwd.length < 4) return alert('새 비밀번호는 4자리 이상이어야 합니다.');
    const success = changePassword(oldPwd, newPwd);
    if (success) {
      alert('비밀번호가 변경되었습니다.');
      onClose();
    } else {
      alert('기존 비밀번호가 일치하지 않습니다.');
    }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>관리자 비밀번호 변경</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="기존 비밀번호 입력" autoFocus style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--slate-200)', fontSize: 15 }} />
          <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="새 비밀번호 입력" style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--slate-200)', fontSize: 15, marginBottom: 4 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>취소</button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>변경하기</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AppInner() {
  const [tab, setTab] = useState('home');
  const [showAdd, setShowAdd] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const { isAdmin, requestLogin, logout, showLoginModal } = useAuth();

  const handleAddClick = () => {
    if (isAdmin) setShowAdd(true);
    else requestLogin();
  };

  const renderPage = () => {
    if (showAdd) return <AddTransactionPage onClose={() => setShowAdd(false)} />;
    switch (tab) {
      case 'home':      return <DashboardPage />;
      case 'members':   return <MembersPage />;
      case 'dues':      return <MemberDuesPage />;
      case 'ledger':    return <TransactionPage />;
      case 'analytics': return <AnalyticsPage />;
      case 'settings':  return <SettingsPage />;
      default:          return <DashboardPage />;
    }
  };

  return (
    <div className="app-root">
      {/* PC 사이드바 */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <img src="/logo.png" alt="Lumique" />
          </div>
          <div><h1>Lumique</h1><p>동아리 활동 자금 관리</p></div>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
          {[
            { title: '회비 관리', ids: ['home', 'ledger', 'dues', 'analytics'] },
            { title: '인원 관리', ids: ['members', 'settings'] }
          ].map((g, i) => (
            <div key={g.title} style={{ marginTop: i === 0 ? 12 : 24 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gray-500)', padding: '0 24px', marginBottom: 4 }}>
                {g.title}
              </div>
              {g.ids.map(id => {
                const t = TABS.find(x => x.id === id);
                return (
                  <button key={t.id}
                    className={`sidebar-nav-item ${tab === t.id && !showAdd ? 'active' : ''}`}
                    onClick={() => { setTab(t.id); setShowAdd(false); }}>
                    {t.icon}<span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        
        <div style={{ padding: '16px', background: 'var(--c-dark)', borderTop: '1px solid #333' }}>
          {isAdmin ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--emerald-500)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-white)' }}>접속 중</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowPwdModal(true)} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', fontSize: 12, cursor: 'pointer', padding: 0 }}>암호변경</button>
                  <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', fontSize: 12, cursor: 'pointer', padding: 0 }}>로그아웃</button>
                </div>
              </div>
              <button className="sidebar-add-btn" onClick={handleAddClick} style={{ background: '#3A3A3A', color: 'var(--c-white)', border: 'none', width: '100%', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                새 거래 추가
              </button>
            </div>
          ) : (
            <button className="sidebar-login-btn" onClick={requestLogin}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
              관리자 로그인
            </button>
          )}
        </div>
      </aside>

      <div className="pc-main">
        <header className="pc-header">
          <span className="pc-header-title">{showAdd ? '거래 추가' : PAGE_TITLES[tab]}</span>
          <span className="pc-header-sub">Lumique · 토스뱅크 1001-7629-3105</span>
        </header>

        <header className="mobile-header">
          <div className="logo-mark">
            <img src="/logo.png" alt="Lumique" />
          </div>
          <h1>{showAdd ? '거래 추가' : PAGE_TITLES[tab]}</h1>
        </header>

        <main className="main-content">{renderPage()}</main>
      </div>

      <nav className="bottom-nav">
        {TABS.map(t => (
          <button key={t.id}
            className={`nav-item ${tab === t.id && !showAdd ? 'active' : ''}`}
            onClick={() => { setTab(t.id); setShowAdd(false); }}>
            {t.icon}<span>{t.short}</span>
          </button>
        ))}
      </nav>

      {!showAdd && <button className="fab" onClick={handleAddClick} title="거래 추가">＋</button>}

      {showPwdModal && <ChangePwdModal onClose={() => setShowPwdModal(false)} />}
      {showLoginModal && <LoginModal />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </AuthProvider>
  );
}
