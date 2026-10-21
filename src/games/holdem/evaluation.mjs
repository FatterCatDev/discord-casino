const RANK_ORDER = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };

function ranksSorted(cards) { return cards.map(c=>RANK_ORDER[c[0]]).sort((a,b)=>b-a); }

function findStraight(vals) {
  // vals: unique, sorted desc
  const u = Array.from(new Set(vals)).sort((a,b)=>b-a);
  // Ace-low straight: treat Ace as 1
  if (u[0] === 14) u.push(1);
  let run = 1; let bestHigh = -1;
  for (let i=1;i<u.length;i++) {
    if (u[i] === u[i-1]-1) { run++; if (run>=5) { bestHigh = u[i-4] === 14 && u[i] === 10 ? 14 : u[i-4]; } }
    else run = 1;
  }
  if (bestHigh === -1) return null;
  // Build straight ranks list descending from high
  const seq = [bestHigh, bestHigh-1, bestHigh-2, bestHigh-3, bestHigh-4].map(v=>v===1?14:v);
  return seq;
}

export function evaluate7(cards) {
  // cards like 'A♠'
  const bySuit = new Map();
  for (const c of cards) { const s = c[c.length-1]; if (!bySuit.has(s)) bySuit.set(s, []); bySuit.get(s).push(c); }
  const flushSuit = Array.from(bySuit.entries()).find(([s, arr]) => arr.length >= 5)?.[0] || null;
  let flushCards = flushSuit ? bySuit.get(flushSuit) : [];
  const valsAll = ranksSorted(cards);
  const counts = new Map();
  for (const c of cards) { const r = c[0]; counts.set(r, (counts.get(r)||0)+1); }
  const groups = Array.from(counts.entries()).map(([r,c])=>({r, c, v:RANK_ORDER[r]})).sort((a,b)=> b.c - a.c || b.v - a.v);

  // Straight flush
  if (flushSuit) {
    const sfVals = ranksSorted(flushCards);
    const sf = findStraight(sfVals);
    if (sf) return { cat:8, ranks: sf, label: `Straight Flush (${rankName(sf[0])}-high)` };
  }
  // Four of a kind
  if (groups[0]?.c === 4) {
    const quad = groups[0].v; const kick = valsAll.find(v => v !== quad) || 0;
    return { cat:7, ranks: [quad, kick], label: `Four of a Kind (${rankName(quad)})` };
  }
  // Full house (3+2)
  const trips = groups.filter(g=>g.c===3).map(g=>g.v);
  const pairs = groups.filter(g=>g.c===2).map(g=>g.v);
  if (trips.length>=1 && (pairs.length>=1 || trips.length>=2)) {
    const t = trips[0]; const p = pairs.length ? pairs[0] : trips[1];
    return { cat:6, ranks: [t,p], label: `Full House (${rankName(t)} over ${rankName(p)})` };
  }
  // Flush
  if (flushSuit) {
    const top5 = ranksSorted(flushCards).slice(0,5);
    return { cat:5, ranks: top5, label: `Flush (${rankName(top5[0])}-high)` };
  }
  // Straight
  const st = findStraight(valsAll);
  if (st) return { cat:4, ranks: st, label: `Straight (${rankName(st[0])}-high)` };
  // Trips
  if (trips.length>=1) {
    const t = trips[0];
    const kickers = valsAll.filter(v=>v!==t).slice(0,2);
    return { cat:3, ranks: [t, ...kickers], label: `Three of a Kind (${rankName(t)})` };
  }
  // Two pair
  if (pairs.length>=2) {
    const [p1,p2] = pairs.slice(0,2);
    const kick = valsAll.find(v=>v!==p1 && v!==p2) || 0;
    return { cat:2, ranks: [p1,p2,kick], label: `Two Pair (${rankName(p1)} & ${rankName(p2)})` };
  }
  // One pair
  if (pairs.length>=1) {
    const p = pairs[0];
    const kickers = valsAll.filter(v=>v!==p).slice(0,3);
    return { cat:1, ranks: [p, ...kickers], label: `Pair of ${rankName(p)}s` };
  }
  // High card
  const top = valsAll.slice(0,5);
  return { cat:0, ranks: top, label: `${rankName(top[0])}-high` };
}

function rankName(v) {
  const map = {11:'Jack',12:'Queen',13:'King',14:'Ace'};
  if (v>=2 && v<=10) return String(v);
  return map[v] || String(v);
}

export function compareHands(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const len = Math.max(a.ranks.length, b.ranks.length);
  for (let i=0;i<len;i++) { const av=a.ranks[i]||0, bv=b.ranks[i]||0; if (av!==bv) return av - bv; }
  return 0;
}
