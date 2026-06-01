const contexts = [];

export function storeContext(context) {
  contexts.push({
    context,
    storedAt: new Date().toISOString()
  });

  return contexts.length;
}

export function getContexts() {
  return contexts;
}
