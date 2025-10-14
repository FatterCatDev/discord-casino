import { handleJobShiftButton } from '../../jobs/shift-engine.mjs';

export default async function handleJobButtons(interaction, ctx) {
  return handleJobShiftButton(interaction, ctx);
}
