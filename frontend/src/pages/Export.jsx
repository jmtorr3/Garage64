import { useState } from 'react'
import { api } from '../api'

const s = {
  heading: { fontSize: '1.2rem', marginBottom: '0.5rem', color: '#f90' },
  sub: { color: '#888', fontSize: '0.9rem', marginBottom: '2rem' },
  box: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px', padding: '1.5rem', maxWidth: '520px' },
  btn: { fontSize: '1rem', padding: '10px 24px', cursor: 'pointer', background: '#f90', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontFamily: 'monospace' },
  btnDisabled: { background: '#555', color: '#999', cursor: 'not-allowed' },
  status: { marginTop: '1rem', padding: '0.75rem', borderRadius: '4px', fontSize: '0.9rem', fontFamily: 'monospace' },
  ok: { background: '#1a3a1a', color: '#6f6', border: '1px solid #3a6a3a' },
  err: { background: '#3a1a1a', color: '#f66', border: '1px solid #6a3a3a' },
  errList: { marginTop: '0.5rem', paddingLeft: '1rem', fontSize: '0.8rem' },
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
        <p style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#aaa' }}>
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
