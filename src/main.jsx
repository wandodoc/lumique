import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { snapshotLocalShowsOnce } from './utils/localBackup'

// 어떤 동기화 코드보다 먼저, 이 기기에 남아 있는 공연 사본을 보호용 키에 한 번 보관한다.
snapshotLocalShowsOnce()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
