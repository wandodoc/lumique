import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { snapshotLocalShowsOnce } from './utils/localBackup'

// 어떤 동기화 코드보다 먼저, 이 기기에 남아 있는 공연 사본을 보호용 키에 한 번 보관한다.
snapshotLocalShowsOnce()

// 새 버전이 배포되면 열려 있던 탭은 더 이상 없는 옛 청크 파일을 불러오다 실패한다
// ("Failed to fetch dynamically imported module"). 그때 자동으로 새로고침해 새 버전을 받는다.
// 30초 안에 또 실패하면 반복 새로고침 대신 그대로 둔다 (실제 네트워크 장애일 수 있음).
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'lumique_chunk_reload_at'
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 30000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch { /* 세션 저장 불가 환경이면 그냥 한 번 새로고침 */ }
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
