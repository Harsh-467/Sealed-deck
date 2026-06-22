import { C, FONT } from './theme';
import { useGame } from './game/useGame';
import { Header } from './ui/Header';
import { Landing } from './ui/Landing';
import { Lobby } from './ui/Lobby';
import { Table } from './ui/Table';
import { Showdown } from './ui/Showdown';
import { APP } from './config';

export function App(): JSX.Element {
  const game = useGame();

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', background: 'radial-gradient(120% 90% at 50% -10%, #1c1110 0%, #140d0c 38%, #0b0706 100%)', fontFamily: FONT.sans, color: C.ink, overflow: 'hidden' }}>
      <Header game={game} />
      <main style={{ position: 'relative' }}>{screen(game)}</main>
    </div>
  );
}

function screen(game: ReturnType<typeof useGame>): JSX.Element {
  if (!game.connected) return <Landing game={game} />;
  if (!APP.tableAddress) return <Notice title="No table configured" body="Set VITE_POKER_TABLE_ADDRESS in frontend/.env to the deployed PokerTable, then reload." />;
  if (game.wrongChain) return <Notice title="Wrong network" body="Switch your wallet to Avalanche Fuji (43113)." action={{ label: 'Switch to Fuji', onClick: game.switchToFuji }} />;

  const s = game.state;
  const phase = s?.phase ?? 'lobby';
  const seated = game.seat != null && s?.players[game.seat]?.address;

  if (phase === 'lobby' || !seated) return <Lobby game={game} />;
  if (phase === 'settled' || phase === 'aborted' || (phase === 'showdown' && s?.result)) return <Showdown game={game} />;
  return <Table game={game} />;
}

function Notice({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }): JSX.Element {
  return (
    <section style={{ minHeight: 'calc(100vh - 68px)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontFamily: FONT.serif, fontSize: 28, color: C.goldText }}>{title}</div>
        <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.inkDim, lineHeight: 1.6 }}>{body}</p>
        {action && (
          <button onClick={action.onClick} style={{ fontFamily: FONT.sans, fontSize: 13, padding: '12px 24px', borderRadius: 10, border: '1px solid #7d5f2c', background: 'linear-gradient(180deg,#f6e6bf,#d6b06c 55%,#b1863f)', color: '#2a1e0c', cursor: 'pointer' }}>
            {action.label}
          </button>
        )}
      </div>
    </section>
  );
}
