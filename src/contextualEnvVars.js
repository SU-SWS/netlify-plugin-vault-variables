function replaceContextualVars(variables) {
  const context = `${process.env.CONTEXT}`.toUpperCase().replace(/-/g, '_');
  const branch = `${process.env.BRANCH}`.toUpperCase().replace(/-/g, '_');

  let replaced = {};

  for (const key of Object.keys(variables)) {
    const contextVar = `${context}_${key}`;
    const branchVar =  `${branch}_${key}`;

    if (variables[contextVar]) {
      replaced[key] = variables[contextVar];
    }
    else if (variables[branchVar]) {
      replaced[key] = variables[branchVar];
    }
    else {
      replaced[key] = variables[key];
    }
  }

  return replaced;
}

module.exports = {
  replaceContextualVars
}