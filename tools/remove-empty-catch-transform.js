module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = false;

  const hasLexicalDeclarations = (statements) => statements.some((stmt) => {
    if (stmt.type === 'VariableDeclaration' && stmt.kind !== 'var') {
      return true;
    }
    if (stmt.type === 'ClassDeclaration') {
      return true;
    }
    if (stmt.type === 'FunctionDeclaration') {
      return true;
    }
    return false;
  });

  const replaceWithStatements = (path, statements) => {
    const parentPath = path.parentPath;
    const parentIsArray = parentPath ? Array.isArray(parentPath.value) : false;
    const lexScoped = hasLexicalDeclarations(statements);
    if (statements.length === 0) {
      if (parentIsArray) {
        path.prune();
      }
      else {
        j(path).replaceWith(j.emptyStatement());
      }
      return;
    }
    if (!lexScoped) {
      if (parentIsArray) {
        path.replace(...statements);
        return;
      }
      if (statements.length === 1) {
        path.replace(statements[0]);
        return;
      }
    }
    path.replace(j.blockStatement(statements));
  };

  root.find(j.TryStatement).forEach((path) => {
    const {node} = path;
    const handler = node.handler;
    if (!handler) return;
    const bodyStatements = handler.body && handler.body.body;
    if (!bodyStatements || bodyStatements.length > 0) return;
    changed = true;
    if (node.finalizer) {
      const newTry = j.tryStatement(node.block, null, node.finalizer);
      j(path).replaceWith(newTry);
      return;
    }
    const tryBody = node.block && node.block.body ? node.block.body : [];
    replaceWithStatements(path, tryBody);
  });

  if (!changed) return null;
  return root.toSource({quote: 'single'});
};
