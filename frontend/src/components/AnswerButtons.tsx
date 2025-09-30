

export default function AnswerButtons({ options, locked, revealIndex, onPick }: {
  options: string[]
  locked: boolean
  revealIndex: number | null
  onPick: (i: number) => void
}) {
  return (
    <div className="answers">
      {options.map((opt, i) => {
        const cls = revealIndex === null ? '' : (i === revealIndex ? 'correct' : 'incorrect')
        return (
          <button key={i} disabled={locked} className={"answer " + cls} onClick={() => onPick(i)}>
            {opt}
          </button>
        )
      })}
    </div>
  )
}
