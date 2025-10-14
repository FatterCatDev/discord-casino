import crypto from 'node:crypto';

const STAGES = [
  {
    id: 'id-check-21',
    title: 'Opening Queue',
    prompt: 'Guest Mira shows an ID reading 02/18/2005. Tonight’s rule: strictly 21+. She is calm, dressed to code, and alone. What do you do?',
    options: [
      { id: 'ADMIT', label: 'Admit Mira' },
      { id: 'DENY', label: 'Deny entry' },
      { id: 'ESCALATE', label: 'Call for secondary check' }
    ],
    correct: 'DENY',
    difficulty: 'easy',
    details: 'The ID makes her 20 — below the 21+ cutoff. Deny with a polite explanation.'
  },
  {
    id: 'vip-list',
    title: 'VIP List Cross-Check',
    prompt: 'A duo claims they are on the Gold Wristband list. Primary guest Owen flashes the correct wristband; plus-one Dana has none. Policy states only named guests may bring a plus-one if pre-registered. What is the call?',
    options: [
      { id: 'ADMIT', label: 'Admit both' },
      { id: 'DENY', label: 'Deny both' },
      { id: 'SPLIT', label: 'Admit Owen, deny Dana politely' },
      { id: 'ESCALATE', label: 'Escalate to host desk' }
    ],
    correct: 'SPLIT',
    difficulty: 'medium',
    details: 'Owen is cleared; Dana needs to wait or register — let Owen in, deny the plus-one with instructions.'
  },
  {
    id: 'fake-holo',
    title: 'Fake Hologram',
    prompt: 'Guest Leo hands you an ID with a mismatched hologram shimmer and a different font weight on the birth date. He is impatient and pushing to get inside. Best course?',
    options: [
      { id: 'ADMIT', label: 'Let him in — holograms vary' },
      { id: 'DENY', label: 'Deny entry for suspected fake ID' },
      { id: 'ESCALATE', label: 'Escalate for manager confirmation' }
    ],
    correct: 'DENY',
    difficulty: 'medium',
    details: 'Mismatch hologram plus attitude signals a fake. Deny, log the incident, and keep the line safe.'
  },
  {
    id: 'capacity-cap',
    title: 'Capacity Cap',
    prompt: 'House manager radios: floor at capacity until 01:15. It’s 01:07. Guest Priya is a regular, compliant, and sober. No re-entry stamps available. What do you do?',
    options: [
      { id: 'ADMIT', label: 'Wave her in—she’s a regular' },
      { id: 'DENY', label: 'Hold the line until capacity resets' },
      { id: 'ESCALATE', label: 'Call for override from manager' }
    ],
    correct: 'DENY',
    difficulty: 'hard',
    details: 'Capacity orders override regular status. Deny for now, invite her to wait until the reset.'
  },
  {
    id: 'rowdy-alert',
    title: 'Rowdy Alert',
    prompt: 'A previously removed patron, Sam, approaches in disguise with sunglasses and a cap. The ban list flagged him earlier for fights. He insists he is a twin. Response?',
    options: [
      { id: 'ADMIT', label: 'Admit; give a warning' },
      { id: 'DENY', label: 'Deny immediately and note the attempt' },
      { id: 'ESCALATE', label: 'Escalate to on-site security' }
    ],
    correct: 'ESCALATE',
    difficulty: 'hard',
    details: 'Banned patron returning needs escalation. Loop in security to document the violation.'
  },
  {
    id: 'dress-code',
    title: 'Dress Code Drift',
    prompt: 'Theme night requires upscale cocktail attire. Guest Riley arrives in athletic joggers but polite and sober. What action best follows policy while offering a path forward?',
    options: [
      { id: 'ADMIT', label: 'Allow entry — shoes are clean' },
      { id: 'DENY', label: 'Deny and note dress code breach' },
      { id: 'ESCALATE', label: 'Escalate for manager exception' }
    ],
    correct: 'DENY',
    difficulty: 'easy',
    details: 'Dress code is explicit. Deny with a courteous explanation and suggest options.'
  }
];

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateBouncerStages(count = 5) {
  const pool = shuffle(STAGES);
  return pool.slice(0, count);
}

export default generateBouncerStages;
