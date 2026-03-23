import * as THREE from 'three';
import { jemToScene } from '../../../cem';

/**
 * Recursively adds metadata to Three.js objects for raycasting/picking.
 */
export function annotateGroup(group, model, modelPath) {
  group.userData.cemSel = { kind: 'model', modelPath };
  let boxIdx = 0, subIdx = 0;
  for (const child of group.children) {
    if (child.isMesh) {
      child.userData.cemSel = { kind: 'box', modelPath, boxIdx };
      boxIdx++;
    } else if (child.isGroup) {
      annotateGroup(child, (model.submodels || [])[subIdx], [...modelPath, subIdx]);
      subIdx++;
    }
  }
}

/**
 * Builds the full Three.js scene from JEM data and attaches picking metadata.
 */
export function buildSceneRoot(jem, textureMap) {
  const root = jemToScene(jem, textureMap);
  const models = jem.models || [];
  let childIdx = 0;
  for (let mi = 0; mi < models.length; mi++) {
    if ('model' in models[mi]) continue; // skipped by jemToScene
    if (childIdx < root.children.length) {
      annotateGroup(root.children[childIdx], models[mi], [mi]);
      childIdx++;
    }
  }
  return root;
}

/**
 * Recursively disposes of geometries and materials to prevent memory leaks.
 */
export function disposeGroup(group) {
  group.traverse(obj => {
    obj.geometry?.dispose();
    const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    mats.forEach(m => {
      if (m.map) m.map.dispose();
      m.dispose();
    });
  });
}
