import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import { TABS } from './utils/navigation';
import './App.css';
import './loading.css';

// 라우트별 코드 스플리팅: 공유 링크로 열리는 /form, /events 같은 공개 페이지가
// 회원/거래/곡 관리 등 전체 앱 코드를 다 받을 필요 없게 각 페이지를 필요할 때만 로드한다.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MemberDuesPage = lazy(() => import('./pages/MemberDuesPage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const TransactionPage = lazy(() => import('./pages/TransactionPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));
const ReservationManagementPage = lazy(() => import('./pages/ReservationManagementPage'));
const TicketOrderForm = lazy(() => import('./pages/TicketOrderForm'));

function PageLoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
    </div>
  );
}

function TransactionPageWrapper() {
  return <TransactionPage />;
}

function TicketOrderFormWrapper() {
  const { showId } = useParams();
  return <TicketOrderForm showId={showId} />;
}

function DashboardPageWrapper() {
  const navigate = useNavigate();
  const setTab = (tabId) => {
    const tab = TABS.find(t => t.id === tabId);
    if (tab) navigate(tab.path);
  };
  return <DashboardPage setTab={setTab} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            {/* 레이아웃 없이 독립적으로 렌더링되는 페이지들. 전체 회원/거래/곡 데이터를
                불러오는 AppProvider 없이 필요한 데이터만 직접 불러와 가볍게 렌더링한다.
                특히 /form, /events는 불특정 다수에게 공유되는 공개 페이지라 중요하다. */}
            <Route path="/reservations" element={<ReservationManagementPage />} />
            <Route path="/manage/:id" element={<ReservationManagementPage />} />
            <Route path="/form/:showId" element={<TicketOrderFormWrapper />} />
            <Route path="/events/:showId" element={<TicketOrderFormWrapper />} />

            {/* Layout이 적용되는 메인 앱 라우트 (여기서만 AppProvider로 전체 상태를 로드) */}
            <Route path="/*" element={
              <AppProvider>
                <Layout>
                  <Routes>
                    <Route path="/" element={<DashboardPageWrapper />} />
                    <Route path="/members" element={<MembersPage initialView="회원 목록" />} />
                    <Route path="/concerts" element={<PerformancePage />} />
                    <Route path="/concerts/:id" element={<PerformancePage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/calendar/detail/:id" element={<CalendarPage />} />
                    <Route path="/dues" element={<MemberDuesPage />} />
                    <Route path="/ledger" element={<TransactionPageWrapper />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<DashboardPageWrapper />} />
                  </Routes>
                </Layout>
              </AppProvider>
            } />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
