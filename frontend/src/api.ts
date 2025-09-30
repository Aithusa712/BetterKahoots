

export async function createOrGetSession(session_id: string) {
const res = await fetch(`/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id }) })
if (!res.ok) throw new Error('Failed to create/get session')
return res.json()
}


export async function join(session_id: string, username: string) {
const res = await fetch(`/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id, username }) })
if (!res.ok) throw new Error('Failed to join')
return res.json()
}


export async function upsertQuestions(session_id: string, questions: any[], bonus_question: any, adminKey: string) {
const res = await fetch(`/api/admin/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey }, body: JSON.stringify({ session_id, questions, bonus_question }) })
if (!res.ok) throw new Error('Failed to save questions')
return res.json()
}


export async function startGame(session_id: string, adminKey: string) {
const res = await fetch(`/api/admin/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey }, body: JSON.stringify({ session_id }) })
if (!res.ok) throw new Error('Failed to start')
return res.json()
}


export async function submitAnswer(session_id: string, player_id: string, question_id: string, option_index: number) {
const res = await fetch(`/api/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id, player_id, question_id, option_index }) })
if (!res.ok) throw new Error('Failed to submit answer')
return res.json()
}
