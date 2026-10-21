export const databaseFakes = new Map();
export const databaseCalls = [];

export function invokeDatabase(name, args) {
  databaseCalls.push({ name, args });
  const fake = databaseFakes.get(name);
  if (!fake) throw new Error(`Unexpected database call: ${name}. Install an explicit test fake.`);
  return fake(...args);
}

export function resetDatabaseFakes() {
  databaseFakes.clear();
  databaseCalls.length = 0;
}
