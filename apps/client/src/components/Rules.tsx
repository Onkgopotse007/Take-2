import type { GameMode } from '@take2/engine';

/** What the host chooses: a set of rules, and whether anyone can be knocked out. */
export interface TableRules {
  mode: GameMode;
  noElimination: boolean;
}

export const RULE_NAMES: Record<GameMode, string> = {
  classic: 'Classic',
  mmaT: "Mma T's house rules",
};

const SUMMARY: Record<GameMode, string> = {
  classic: 'Take 2 as everyone knows it.',
  mmaT: 'No Jokers, any card can check, and only the first to check can win.',
};

/** "Classic", or "Mma T's house rules, no elimination". */
export function rulesName({ mode, noElimination }: TableRules): string {
  return noElimination ? `${RULE_NAMES[mode]}, no elimination` : RULE_NAMES[mode];
}

/** The host chooses the rules for the next game; everyone else sees which ones are on. */
export function RulesPicker({ rules, isHost, onChange }: { rules: TableRules; isHost: boolean; onChange(rules: TableRules): void }) {
  if (!isHost) {
    return (
      <p className="rules-current">
        Rules: <strong>{rulesName(rules)}</strong>
      </p>
    );
  }
  return (
    <>
      <div className="rules-picker" role="radiogroup" aria-label="Rules">
        {(Object.keys(RULE_NAMES) as GameMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={rules.mode === m}
            className={`rules-option${rules.mode === m ? ' on' : ''}`}
            onClick={() => onChange({ ...rules, mode: m })}
          >
            <strong>{RULE_NAMES[m]}</strong>
            <span>{m === 'mmaT' && rules.noElimination ? 'No Jokers, and any card can check.' : SUMMARY[m]}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={rules.noElimination}
        className={`rules-switch${rules.noElimination ? ' on' : ''}`}
        onClick={() => onChange({ ...rules, noElimination: !rules.noElimination })}
      >
        <span className="rules-switch-text">
          <strong>No elimination</strong>
          <span>Nobody is knocked out. Check to take your place, and the rest play on.</span>
        </span>
        <span className="rules-switch-track" aria-hidden="true">
          <span className="rules-switch-knob" />
        </span>
      </button>
    </>
  );
}

/** Where Mma T's rules come from, in the creator's words. */
export function MmaTNote() {
  return <p className="rules-note">The way I grew up playing Take 2 with my mom and my siblings. Mma T's table, Mma T's rules.</p>;
}

/** What is different from the classic rules. With no elimination, points and the first-checker rule do not apply. */
export function MmaTRulesList({ noElimination = false }: { noElimination?: boolean }) {
  return (
    <ul className="tips">
      <li>
        <strong>No Jokers</strong>
        <span>The deck is 52 cards. 2s are the only pick cards.</span>
      </li>
      <li>
        <strong>Checking</strong>
        {noElimination ? (
          <span>Any last card checks, action cards too, and still does what it does. A last 8 names a suit.</span>
        ) : (
          <span>Any last card checks, action cards too. A last 8 checks on anything.</span>
        )}
      </li>
      {!noElimination && (
        <>
          <li>
            <strong>Points</strong>
            <span>16 or less stays in, 17 or more is out. No toss.</span>
          </li>
          <li>
            <strong>Winning</strong>
            <span>The first to check must keep checking until everyone is out. If anyone else checks first, nobody wins.</span>
          </li>
        </>
      )}
    </ul>
  );
}

/** Where No elimination comes from, in the creator's words. */
export function NoEliminationNote() {
  return <p className="rules-note">How we played at junior secondary school, between classes and at break. Nobody gets knocked out, everybody finishes.</p>;
}

/** What changes with no elimination. */
export function NoEliminationRulesList() {
  return (
    <ul className="tips">
      <li>
        <strong>Nobody is out</strong>
        <span>Points do not count. The game is a single round.</span>
      </li>
      <li>
        <strong>Checking</strong>
        <span>The first to check wins. Everyone else keeps their cards and plays on for second, third and so on.</span>
      </li>
      <li>
        <strong>The end</strong>
        <span>The game ends when one of the last two checks. Anyone who leaves comes last.</span>
      </li>
    </ul>
  );
}

/** The house-rule panels for whatever rules are on, for the How to play sheet. */
export function RulesDetails({ rules }: { rules: TableRules }) {
  return (
    <>
      {rules.mode === 'mmaT' && (
        <>
          <h2>Mma T's house rules</h2>
          <MmaTNote />
          <MmaTRulesList noElimination={rules.noElimination} />
        </>
      )}
      {rules.noElimination && (
        <>
          <h2>No elimination</h2>
          <NoEliminationNote />
          <NoEliminationRulesList />
        </>
      )}
    </>
  );
}
