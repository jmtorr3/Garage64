import { createContext, useContext, useRef, useState, useCallback } from 'react';
import { updateNode } from '../utils/cemData';

const ModelerContext = createContext(null);

export const ModelerProvider = ({ children }) => {
  // --- Refs (Heavy Data) ---
  const dataRef = useRef(null);
  const origRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // --- State (UI Sync) ---
  const [dataVer, setDataVer] = useState(0);
  const [sel, setSel] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  // --- Mutators ---

  // 1. pushUndo must be defined first
  const pushUndo = useCallback(() => {
    if (!dataRef.current) return;
    undoStackRef.current.push(JSON.stringify(dataRef.current));
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, []);

  // 2. bump uses pushUndo
  const bump = useCallback((newModels) => {
    pushUndo();
    dataRef.current = { ...dataRef.current, models: newModels };
    setDataVer(v => v + 1);
    setIsDirty(true);
  }, [pushUndo]);

  // 3. patchModel uses bump
  const patchModel = useCallback((modelPath, updater) => {
    if (!dataRef.current?.models) return;
    const newModels = updateNode(dataRef.current.models, modelPath, updater);
    bump(newModels);
  }, [bump]);

  // 4. patchBox (MOVED INSIDE) uses bump
  const patchBox = useCallback((modelPath, boxIdx, updater) => {
    if (!dataRef.current?.models) return;
    const newModels = updateNode(dataRef.current.models, modelPath, n => {
      const boxes = [...(n.boxes || [])];
      boxes[boxIdx] = updater(boxes[boxIdx]);
      return { ...n, boxes };
    });
    bump(newModels);
  }, [bump]);

  // --- Final Value Object ---
  const value = {
    dataRef,
    origRef,
    dataVer,
    setDataVer,
    sel,
    setSel,
    isDirty,
    setIsDirty,
    pushUndo,
    bump,
    patchModel,
    patchBox, // Don't forget to export this!
    undoCount: undoStackRef.current.length,
    redoCount: redoStackRef.current.length
  };

  return (
    <ModelerContext.Provider value={value}>
      {children}
    </ModelerContext.Provider>
  );
};

export const useModeler = () => {
  const context = useContext(ModelerContext);
  if (!context) throw new Error('useModeler must be used within a ModelerProvider');
  return context;
};
