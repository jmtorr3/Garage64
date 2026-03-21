/**
 * Navigates the model tree to return a specific node.
 */
export function getNode(models, modelPath) {
  if (!models || !modelPath?.length) return null;
  let n = models[modelPath[0]];
  for (let i = 1; i < modelPath.length; i++) n = n?.submodels?.[modelPath[i]] ?? null;
  return n;
}

/**
 * Returns an immutable update of the models tree.
 */
export function updateNode(models, modelPath, updater) {
  const clone = JSON.parse(JSON.stringify(models));
  if (modelPath.length === 1) {
    clone[modelPath[0]] = updater(clone[modelPath[0]]);
    return clone;
  }
  let n = clone[modelPath[0]];
  for (let i = 1; i < modelPath.length - 1; i++) n = n.submodels[modelPath[i]];
  n.submodels[modelPath[modelPath.length - 1]] = updater(n.submodels[modelPath[modelPath.length - 1]]);
  return clone;
}

/**
 * Removes a node and returns [newModels, removedNode] for drag-and-drop or nesting.
 */
export function extractModel(models, path) {
  const m = JSON.parse(JSON.stringify(models));
  const idx = path[path.length - 1];
  if (path.length === 1) {
    const [n] = m.splice(idx, 1);
    return [m, n];
  }
  let parent = m[path[0]];
  for (let i = 1; i < path.length - 1; i++) parent = parent.submodels[path[i]];
  const [n] = parent.submodels.splice(idx, 1);
  return [m, n];
}

/**
 * Inserts a node into a target parent.
 */
export function nestModel(models, targetPath, node) {
  const m = JSON.parse(JSON.stringify(models));
  if (targetPath.length === 0) {
    m.push(node);
    return m;
  }
  let t = m[targetPath[0]];
  for (let i = 1; i < targetPath.length; i++) t = t.submodels[targetPath[i]];
  if (!t.submodels) t.submodels = [];
  t.submodels.push(node);
  return m;
}
