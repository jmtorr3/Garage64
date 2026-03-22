export const DEG = Math.PI / 180

export const XP_TITLE = { background: 'var(--bg-title)', color: 'var(--clr-text-on-title)', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', fontFamily: 'Monocraft, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }
export const XP_BTN_SM = { padding: '2px 8px', background: 'var(--bg-btn)', borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', cursor: 'pointer', fontSize: '11px', fontFamily: 'Monocraft, sans-serif', fontWeight: 'bold' }
export const XP_INPUT = { padding: '3px 6px', background: 'var(--bg-input)', color: 'var(--clr-text)', borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)', fontFamily: 'Monocraft, sans-serif', fontSize: '11px' }

export const s = {
  page: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', background: 'var(--bg-window)', margin: '-1.5rem -2rem', overflow: 'hidden' },
  topBar: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', flexShrink: 0, borderBottom: '2px solid var(--bdr-dk)', background: 'var(--bg-panel)' },
  content: { flex: 1, display: 'flex', overflow: 'hidden' },
  outliner: { width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-panel)', borderRight: '2px solid var(--bdr-dk)' },
  viewport: { flex: 1, position: 'relative', overflow: 'hidden' },
  rPanel: { flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-panel)', borderLeft: '2px solid var(--bdr-dk)' },
  label: { color: 'var(--clr-text-dim)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  btnSm: XP_BTN_SM,
  btnAct: { ...XP_BTN_SM, background: 'var(--bg-btn-active)', borderTop: '1px solid var(--bdr-dk)', borderLeft: '1px solid var(--bdr-dk)', borderRight: '1px solid var(--bdr-input-lt)', borderBottom: '1px solid var(--bdr-input-lt)' },
  btn: { padding: '4px 16px', background: 'var(--bg-btn-primary)', borderTop: '2px solid var(--bdr-btn-primary-lt)', borderLeft: '2px solid var(--bdr-btn-primary-lt)', borderRight: '2px solid var(--bdr-btn-primary-dk)', borderBottom: '2px solid var(--bdr-btn-primary-dk)', color: '#fff', fontFamily: 'Monocraft, sans-serif', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  divider: { width: 1, height: 22, background: 'var(--bdr-dk)', margin: '0 2px', flexShrink: 0 },
  select: { ...XP_INPUT },
  numInput: { ...XP_INPUT, flex: 1, minWidth: '40px' },
  propLabel: { color: 'var(--clr-text-dim)', fontSize: '10px', fontFamily: 'Monocraft, sans-serif', width: '14px', textAlign: 'right', flexShrink: 0 },
  ok: { color: 'var(--clr-ok)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  err: { color: 'var(--clr-err)', fontSize: '11px', fontFamily: 'Monocraft, sans-serif' },
  treeRow: { display: 'flex', alignItems: 'center', gap: '3px', padding: '1px 4px', cursor: 'pointer', fontSize: '11px', fontFamily: 'Monocraft, sans-serif', userSelect: 'none', minHeight: '20px' },
}
