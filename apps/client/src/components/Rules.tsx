import type { GameMode } from '@take2/engine';

export const RULE_NAMES: Record<GameMode, string> = {
  classic: 'Classic',
  mmaT: "Mma T's house rules",
};

const SUMMARY: Record<GameMode, string> = {
  classic: 'Take 2 as everyone knows it.',
  mmaT: 'No Jokers, any card can check, and only the first to check can win.',
};

/** The host chooses the rules for the next game; everyone else sees which ones are on. */
export function RulesPicker({ mode, isHost, onChange }: { mode: GameMode; isHost: boolean; onChange(mode: GameMode): void }) {
  if (!isHost) {
    return (
      <p className="rules-current">
        Rules: <strong>{RULE_NAMES[mode]}</strong>
      </p>
    );
  }
  return (
    <div className="rules-picker" role="radiogroup" aria-label="Rules">
      {(Object.keys(RULE_NAMES) as GameMode[]).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} className={`rules-option${mode === m ? ' on' : ''}`} onClick={() => onChange(m)}>
          <strong>{RULE_NAMES[m]}</strong>
          <span>{SUMMARY[m]}</span>
        </button>
      ))}
    </div>
  );
}

/** What is different from the classic rules. */
export function MmaTRulesList() {
  return (
    <ul className="tips">
      <li>
        <strong>No Jokers</strong>
        <span>The deck is 52 cards. 2s are the only pick cards.</span>
      </li>
      <li>
        <strong>Checking</strong>
        <span>Any last card checks, action cards too. A last 8 checks on anything.</span>
      </li>
      <li>
        <strong>Points</strong>
        <span>16 or less stays in, 17 or more is out. No toss.</span>
      </li>
      <li>
        <strong>Winning</strong>
        <span>The first to check must keep checking until everyone is out. If anyone else checks first, nobody wins.</span>
      </li>
    </ul>
  );
}
