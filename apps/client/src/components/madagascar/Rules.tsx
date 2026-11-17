/** Where the name comes from, in the creator's words. */
export function MadagascarNote() {
  return <p className="rules-note">We called it Madagascar, maybe because the spread of cards was ovalish, like the island.</p>;
}

/** The rules in short. */
export function MadagascarRulesList() {
  return (
    <ul className="tips">
      <li>
        <strong>The oval</strong>
        <span>All 52 cards lie face down. Take turns turning any one of them. It is all luck.</span>
      </li>
      <li>
        <strong>Matching</strong>
        <span>Play the suit on top of the pile and you take the whole pile, except your card.</span>
      </li>
      <li>
        <strong>No cards</strong>
        <span>Anyone with no cards when the oval runs out shares 1st.</span>
      </li>
      <li>
        <strong>Hands</strong>
        <span>Then play the cards you took, choosing each one. Empty your hand to take the next place.</span>
      </li>
      <li>
        <strong>Last</strong>
        <span>The last player holding cards comes last. Anyone who leaves comes after them.</span>
      </li>
    </ul>
  );
}

/** How the controls work. */
export function MadagascarHowToList() {
  return (
    <ul className="tips">
      <li>
        <strong>Your turn</strong>
        <span>The bottom of the screen lights up. You have 10 seconds.</span>
      </li>
      <li>
        <strong>Starting</strong>
        <span>After the countdown, the fastest to tap a card turns the first one.</span>
      </li>
      <li>
        <strong>The oval</strong>
        <span>Tap any face-down card to turn it.</span>
      </li>
      <li>
        <strong>Your hand</strong>
        <span>Tap a card to lift it, then tap it again to play it.</span>
      </li>
    </ul>
  );
}

export function MadagascarHowToSheet({ onClose }: { onClose(): void }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="howto-title">
        <div className="grabber" aria-hidden="true" />
        <h2 id="howto-title">How to play Madagascar</h2>
        <MadagascarNote />
        <MadagascarRulesList />
        <h2>On this screen</h2>
        <MadagascarHowToList />
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      </section>
    </>
  );
}
