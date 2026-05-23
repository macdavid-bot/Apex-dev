const symbolMemory = new Map();

export function rememberSymbol(symbol, location) {
  symbolMemory.set(symbol, {
    location,
    rememberedAt: new Date().toISOString()
  });

  return symbolMemory.get(symbol);
}

export function recallSymbol(symbol) {
  return symbolMemory.get(symbol) || null;
}
