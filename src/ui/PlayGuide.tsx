import { FigmaIcon } from './FigmaIcon.tsx'

/** The side column beside the puzzle: a short how-to with an example, and a few reassurances. */
export function PlayGuide({ gaps, onTutorial }: { gaps: number; onTutorial: () => void }) {
  return (
    <aside className="guide" aria-label="How to play">
      <section className="guide__howto">
        <p className="guide__label"><FigmaIcon name="spark" /> A little how-to</p>
        <h2 className="guide__title">Every word is a stepping stone.</h2>
        <p className="guide__text">
          Fill the {gaps} gaps. Each neighboring pair must make a familiar word or phrase, from top to bottom.
        </p>
        <div className="guide__example" aria-label="Example: sun, flower, pot makes sunflower and flower pot">
          <div className="guide__chain" aria-hidden="true">
            <span className="guide__word">SUN</span>
            <FigmaIcon name="arrowSmall" />
            <span className="guide__word guide__word--wide">FLOWER</span>
            <FigmaIcon name="arrowSmall" />
            <span className="guide__word">POT</span>
          </div>
          <p className="guide__phrases" aria-hidden="true"><FigmaIcon name="checkExample" /> sunflower&nbsp; · &nbsp;flower pot</p>
        </div>
        <button type="button" className="guide__more" onClick={onTutorial}>
          Show me how to play <FigmaIcon name="arrowLink" />
        </button>
      </section>
      <section className="guide__notes">
        <h2 className="guide__notes-title">Room to experiment.</h2>
        <ul className="guide__list">
          <li><FigmaIcon name="checkList" /> Any valid bridge counts.</li>
          <li><FigmaIcon name="checkList" /> Hints don’t use a check.</li>
          <li><FigmaIcon name="checkList" /> No timer. Take your time.</li>
        </ul>
        <p className="guide__reset"><FigmaIcon name="clock" /> New puzzle at midnight UTC</p>
      </section>
    </aside>
  )
}
