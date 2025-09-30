export default function AnswerButtons({
  options,
  locked,
  revealIndex,
  selectedIndex,
  onPick,
}: {
  options: string[]
  locked: boolean
  revealIndex: number | null
  selectedIndex: number | null
  onPick: (i: number) => void
}) {
  return (
    <div className="answers">
      {options.map((opt, i) => {
        const stateClass =
          revealIndex === null ? '' : i === revealIndex ? 'correct' : 'incorrect'
        const isSelected = selectedIndex === i
        const classes = ['answer']
        if (stateClass) classes.push(stateClass)
        if (isSelected) classes.push('selected')
        return (
          <button
            key={i}
            disabled={locked}
            className={classes.join(' ')}
            onClick={() => onPick(i)}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}
