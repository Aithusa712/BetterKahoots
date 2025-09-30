import type { Player } from '../types'


export default function Leaderboard({ players, onClose }: { players: Player[]; onClose?: () => void }) {
  return (
    <div className="overlay">
      <div className="card leaderboard">
        <h2>Leaderboard</h2>
        <ol>
          {players.map((p, idx) => (
            <li key={p.id} style={{ padding: '6px 0' }}>
              <strong>#{idx + 1}</strong> {p.username} — {p.score} pts
            </li>
          ))}
        </ol>
        {onClose && <button className="btn" onClick={onClose}>Close</button>}
      </div>
    </div>
  )
}
