export function selKey(sel) {
  if (!sel) return ''
  return sel.kind === 'model' ? `m_${sel.modelPath.join('_')}` : `b_${sel.modelPath.join('_')}_${sel.boxIdx}`
}

export function getFlatVisible(models, openNodes, prefix = []) {
  const result = []
  for (let i = 0; i < (models || []).length; i++) {
    const model = models[i]
    const modelPath = [...prefix, i]
    result.push({ kind: 'model', modelPath })
    if (openNodes.has(modelPath.join('_'))) {
      for (let bi = 0; bi < (model.boxes || []).length; bi++)
        result.push({ kind: 'box', modelPath, boxIdx: bi })
      result.push(...getFlatVisible(model.submodels, openNodes, modelPath))
    }
  }
  return result
}
