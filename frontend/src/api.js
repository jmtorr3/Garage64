const BASE = `${import.meta.env.BASE_URL}api`

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  // Variants
  getVariants: () => req('/variants/'),
  getVariant: (id) => req(`/variants/${id}/`),
  createVariant: (data) => req('/variants/', { method: 'POST', body: data }),
  updateVariant: (id, data) => req(`/variants/${id}/`, { method: 'PUT', body: data }),
  deleteVariant: (id) => req(`/variants/${id}/`, { method: 'DELETE' }),
  exportPack: () => req('/variants/export/', { method: 'POST' }),

  // Parts
  getParts: () => req('/parts/'),
  getPart: (id) => req(`/parts/${id}/`),
  createPart: (data) => req('/parts/', { method: 'POST', body: data }),
  updatePart: (id, data) => req(`/parts/${id}/`, { method: 'PUT', body: data }),
  deletePart: (id) => req(`/parts/${id}/`, { method: 'DELETE' }),
  patchPart: (id, data) => req(`/parts/${id}/`, { method: 'PATCH', body: data }),

  // Bodies
  getBodies: () => req('/bodies/'),
  getBody: (id) => req(`/bodies/${id}/`),
  createBody: (data) => req('/bodies/', { method: 'POST', body: data }),
  updateBody: (id, data) => req(`/bodies/${id}/`, { method: 'PUT', body: data }),
  patchBody: (id, data) => req(`/bodies/${id}/`, { method: 'PATCH', body: data }),

  // Assets
  saveTexture: (path, blob) => fetch(`${import.meta.env.BASE_URL}api/asset/?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: blob,
  }).then(r => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json() }),

  // Save a painted texture for a variant and update texture_override on the variant.
  // carSlug:   EntityBody.name  e.g. "miata_base"
  // variantId: CarVariant.id
  // fileName:  CarVariant.file_name  e.g. "oak_boat3"
  // blob:      PNG Blob
  async saveVariantTexture(carSlug, variantId, fileName, blob) {
    const texPath = `optifine/cem/${carSlug}/variants/${fileName}.png`
    await api.saveTexture(texPath, blob)
    return req(`/variants/${variantId}/`, {
      method: 'PATCH',
      body: { texture_override: `minecraft:${texPath}` },
    })
  },

  patchVariant: (id, data) => req(`/variants/${id}/`, { method: 'PATCH', body: data }),

  // Slots
  getSlots: () => req('/slots/'),
  createSlot: (data) => req('/slots/', { method: 'POST', body: data }),
  updateSlot: (id, data) => req(`/slots/${id}/`, { method: 'PUT', body: data }),
  deleteSlot: (id) => req(`/slots/${id}/`, { method: 'DELETE' }),
}
