/** How the controls work. Says nothing about strategy or who forgot to announce. */
export function HowToList() {
  return (
    <ul className="tips">
      <li>
        <strong>Your turn</strong>
        <span>The bottom of the screen lights up. You have 10 seconds.</span>
      </li>
      <li>
        <strong>Starting</strong>
        <span>After the countdown, anyone with a matching card can play first.</span>
      </li>
      <li>
        <strong>Play</strong>
        <span>Tap a card to lift it, then tap it again to play it.</span>
      </li>
      <li>
        <strong>Pick</strong>
        <span>Tap the pile. If you can play the card you picked, tap it, or tap Keep it.</span>
      </li>
      <li>
        <strong>8s</strong>
        <span>Play it, then choose the next suit.</span>
      </li>
      <li>
        <strong>Announce</strong>
        <span>Tap it before the play that leaves you with 2 or 1 cards.</span>
      </li>
      <li>
        <strong>Call out</strong>
        <span>Tap a player who forgot to announce. They pick 2.</span>
      </li>
    </ul>
  );
}

export function HowToSheet({ onClose }: { onClose(): void }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="howto-title">
        <div className="grabber" aria-hidden="true" />
        <h2 id="howto-title">How to play here</h2>
        <HowToList />
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      </section>
    </>
  );
}
