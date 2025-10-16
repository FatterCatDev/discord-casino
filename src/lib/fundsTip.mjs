export function insufficientFundsTip(kittenMode = false) {
  return kittenMode
    ? 'Need a refill? Claim `/dailyspin`, snag `/vote`, clock a shift with `/job`, or purr at staff via `/request type:buyin amount:<chips>`.'
    : 'Need more chips? Try `/dailyspin`, claim `/vote`, run `/job`, or submit `/request type:buyin amount:<chips>`.';
}

export function withInsufficientFundsTip(message, kittenMode = false) {
  if (!message || typeof message !== 'string') return message;
  const tip = insufficientFundsTip(kittenMode);
  if (message.includes(tip)) return message;
  const trim = message.trimEnd();
  const needsNewline = trim.includes('\n') || /[.!?]$/.test(trim);
  const separator = needsNewline ? '\n\n' : ' ';
  return `${trim}${separator}${tip}`;
}
