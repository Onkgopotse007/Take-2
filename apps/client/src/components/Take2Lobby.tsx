import type { TableSnapshot } from '@take2/server/protocol';
import { HowToList } from './HowTo';
import { Lobby } from './Lobby';
import { MmaTNote, MmaTRulesList, NoEliminationNote, NoEliminationRulesList, RulesPicker, type TableRules } from './Rules';

interface Props {
  snapshot: TableSnapshot;
  onStart(): void;
  onSetRules(rules: TableRules): void;
  onLeave(): void;
}

/** The lobby with Take 2's rules choice and tips. */
export function Take2Lobby({ snapshot, onStart, onSetRules, onLeave }: Props) {
  const isHost = snapshot.hostId === snapshot.you;
  const rules: TableRules = { mode: snapshot.mode, noElimination: snapshot.noElimination };
  return (
    <Lobby snapshot={snapshot} onStart={onStart} onLeave={onLeave}>
      <section className="field" aria-labelledby="lobby-rules">
        <h2 id="lobby-rules" style={{ margin: 0, fontSize: 18 }}>
          Rules
        </h2>
        <RulesPicker rules={rules} isHost={isHost} onChange={onSetRules} />
      </section>

      {snapshot.mode === 'mmaT' && (
        <section className="tips-card" aria-labelledby="lobby-mma-t">
          <h2 id="lobby-mma-t">Mma T's house rules</h2>
          <MmaTNote />
          <MmaTRulesList noElimination={rules.noElimination} />
        </section>
      )}

      {rules.noElimination && (
        <section className="tips-card" aria-labelledby="lobby-no-elimination">
          <h2 id="lobby-no-elimination">No elimination</h2>
          <NoEliminationNote />
          <NoEliminationRulesList />
        </section>
      )}

      <section className="tips-card" aria-labelledby="lobby-howto">
        <h2 id="lobby-howto">How to play here</h2>
        <HowToList />
      </section>
    </Lobby>
  );
}
