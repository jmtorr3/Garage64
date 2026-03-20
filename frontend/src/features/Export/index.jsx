import { useState } from 'react'
import { api } from '../../api'

const s = {
  heading: { fontSize: '13px', marginBottom: '4px', color: 'var(--clr-accent)', fontWeight: 'bold', fontFamily: 'Monocraft, sans-serif' },
  sub: { color: 'var(--clr-text-dim)', fontSize: '11px', marginBottom: '1.5rem', fontFamily: 'Monocraft, sans-serif' },
  box: { background: 'var(--bg-panel)', borderTop: '2px solid var(--bdr-lt)', borderLeft: '2px solid var(--bdr-lt)', borderRight: '2px solid var(--bdr-dk)', borderBottom: '2px solid var(--bdr-dk)', padding: '16px', maxWidth: '520px' },
  btn: { fontSize: '12px', padding: '6px 20px', cursor: 'pointer', background: 'var(--bg-btn-primary)', borderTop: '2px solid var(--bdr-btn-primary-lt)', borderLeft: '2px solid var(--bdr-btn-primary-lt)', borderRight: '2px solid var(--bdr-btn-primary-dk)', borderBottom: '2px solid var(--bdr-btn-primary-dk)', color: '#fff', fontWeight: 'bold', fontFamily: 'Monocraft, sans-serif' },
  btnDisabled: { background: 'var(--bg-panel-alt)', borderTop: '2px solid var(--bdr-lt)', borderLeft: '2px solid var(--bdr-lt)', borderRight: '2px solid var(--bdr-dk)', borderBottom: '2px solid var(--bdr-dk)', color: 'var(--clr-text-dim)', cursor: 'not-allowed' },
  status: { marginTop: '10px', padding: '8px 10px', fontSize: '11px', fontFamily: 'Monocraft, sans-serif', borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-lt)', borderBottom: '2px solid var(--bdr-lt)' },
  ok: { background: 'var(--clr-badge-bg)', color: 'var(--clr-ok)', border: 'none' },
  err: { background: 'var(--bg-section)', color: 'var(--clr-err)', border: 'none' },
  errList: { marginTop: '4px', paddingLeft: '1rem', fontSize: '11px' },
}

export default function Export() {
  const [status, setStatus] = useState(null)  // null | 'loading' | 'ok' | 'error' | 'partial'
  const [errors, setErrors] = useState([])

  async function run() {
    setStatus('loading')
    setErrors([])
    try {
      const res = await api.exportPack()
      if (res.errors?.length) {
        setStatus('partial')
        setErrors(res.errors)
      } else {
        setStatus('ok')
      }
    } catch (e) {
      setStatus('error')
      setErrors([e.message])
    }
  }

  return (
    <div>
      <h1 style={s.heading}>Export Pack</h1>
      <p style={s.sub}>
        Writes all .jem, .jpm, and .properties files from the database
        into <code>Garage64_LATEST/</code>.
      </p>

      <div style={s.box}>
        <p style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--clr-text-dim)' }}>
          This overwrites the current pack files. Make sure your variants and
          parts are correct before exporting.
        </p>

        <button
          style={{ ...s.btn, ...(status === 'loading' ? s.btnDisabled : {}) }}
          onClick={run}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Exporting...' : 'Export to Pack'}
        </button>

        {status === 'ok' && (
          <div style={{ ...s.status, ...s.ok }}>
            Export complete. Pack files updated.
          </div>
        )}

        {(status === 'error' || status === 'partial') && (
          <div style={{ ...s.status, ...s.err }}>
            {status === 'partial' ? 'Export finished with errors:' : 'Export failed:'}
            <ul style={s.errList}>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
