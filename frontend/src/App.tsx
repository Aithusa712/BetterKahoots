import { Routes, Route, Link } from 'react-router-dom'
import UserPage from './pages/UserPage'
import AdminPage from './pages/AdminPage'


export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UserPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<div className="container"><div className="card">Not found. <Link to="/">Go home</Link></div></div>} />
    </Routes>
  )
}
