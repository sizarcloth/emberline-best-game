// Rounds and the economy: freeze (buy) -> live -> ended -> next round,
// first to 5 takes the match. Phase timers run on the wall clock so a slow
// software renderer cannot stretch a round past what the player expects.
export const ROUNDS_TO_WIN = 5;
export const FREEZE_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const INTERMISSION_SECONDS = 4.5;
export const WIN_BONUS = 3250;
export const LOSS_BONUS = 1400;
export const KILL_BONUS = 300;
export const MAX_MONEY = 16000;
export const START_MONEY = 800;

export function createRounds({ player, bots, callbacks }) {
  const state = {
    started: false,
    phase: 'lobby',
    round: 1,
    score: { vanguard: 0, jackals: 0 },
    aliveV: 0,
    aliveJ: 0,
    roundEndsAt: 0,
    phaseEndsAt: 0,
    lastWinner: null,
    lastReason: '',
  };

  function aliveCounts() {
    const v = (player.alive ? 1 : 0) + bots.aliveCount('vanguard');
    const j = bots.aliveCount('jackals');
    state.aliveV = v;
    state.aliveJ = j;
    return { v, j };
  }

  function enterFreeze(now) {
    state.phase = 'freeze';
    state.phaseEndsAt = now + FREEZE_SECONDS;
    callbacks.onPhaseChange('freeze');
  }

  function enterLive(now) {
    state.phase = 'live';
    state.roundEndsAt = now + ROUND_SECONDS;
    callbacks.onPhaseChange('live');
  }

  function start(now) {
    state.started = true;
    state.round = 1;
    state.score.vanguard = 0;
    state.score.jackals = 0;
    callbacks.onRoundReset(1, true);
    enterFreeze(now);
    aliveCounts();
  }

  function skipFreeze(now) {
    if (state.phase === 'freeze') enterLive(now);
  }

  function awardMoney(winner) {
    const all = [player, ...bots.list];
    for (const p of all) {
      const bonus = p.team === winner ? WIN_BONUS : LOSS_BONUS;
      p.money = Math.min(MAX_MONEY, p.money + bonus);
    }
  }

  function endRound(winner, reason, now) {
    if (state.phase !== 'live') return;
    state.score[winner]++;
    state.lastWinner = winner;
    state.lastReason = reason;
    awardMoney(winner);
    state.phase = 'ended';
    state.phaseEndsAt = now + INTERMISSION_SECONDS;
    callbacks.onRoundEnd(winner, reason, { ...state.score });
    callbacks.onPhaseChange('ended');
  }

  function checkElimination(now) {
    if (state.phase !== 'live') return;
    const { v, j } = aliveCounts();
    if (v === 0) endRound('jackals', 'elimination', now);
    else if (j === 0) endRound('vanguard', 'elimination', now);
  }

  function onKill(killer) {
    if (killer) killer.money = Math.min(MAX_MONEY, killer.money + KILL_BONUS);
  }

  function timeLeft(now) {
    if (state.phase === 'live') return Math.max(0, state.roundEndsAt - now);
    if (state.phase === 'freeze') return Math.max(0, state.phaseEndsAt - now);
    return 0;
  }

  function update(now) {
    aliveCounts();
    if (state.phase === 'freeze' && now >= state.phaseEndsAt) {
      enterLive(now);
    } else if (state.phase === 'live' && now >= state.roundEndsAt) {
      const { v, j } = aliveCounts();
      const winner = v === j ? 'vanguard' : (v > j ? 'vanguard' : 'jackals');
      endRound(winner, 'time', now);
    } else if (state.phase === 'ended' && now >= state.phaseEndsAt) {
      if (state.score.vanguard >= ROUNDS_TO_WIN || state.score.jackals >= ROUNDS_TO_WIN) {
        state.phase = 'matchEnd';
        const winner = state.score.vanguard >= ROUNDS_TO_WIN ? 'vanguard' : 'jackals';
        callbacks.onMatchEnd(winner, { ...state.score });
        callbacks.onPhaseChange('matchEnd');
      } else {
        state.round++;
        callbacks.onRoundReset(state.round, false);
        enterFreeze(now);
      }
    }
  }

  return {
    state,
    start,
    skipFreeze,
    update,
    checkElimination,
    onKill,
    timeLeft,
    aliveCounts,
  };
}
