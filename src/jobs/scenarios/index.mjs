import generateBartenderStages from './bartender.mjs';
import generateDealerStages from './dealer.mjs';
import generateBouncerStages from './bouncer.mjs';

const GENERATORS = {
  bartender: generateBartenderStages,
  dealer: generateDealerStages,
  bouncer: generateBouncerStages
};

export function generateStagesForJob(jobId, count = 5) {
  const generator = GENERATORS[jobId];
  if (!generator) throw new Error(`Unknown job generator: ${jobId}`);
  return generator(count);
}

export default GENERATORS;
