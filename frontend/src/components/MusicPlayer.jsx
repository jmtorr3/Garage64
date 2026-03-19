import { useEffect, useRef, useState } from 'react'

const XP_BTN_SM = { padding: '2px 8px', background: 'var(--bg-btn)', borderTop: '1px solid var(--bdr-btn-lt)', borderLeft: '1px solid var(--bdr-btn-lt)', borderRight: '1px solid var(--bdr-btn-dk)', borderBottom: '1px solid var(--bdr-btn-dk)', color: 'var(--clr-text)', cursor: 'pointer', fontSize: '11px', fontFamily: 'Monocraft, sans-serif', fontWeight: 'bold' }
const XP_INPUT  = { padding: '3px 6px', background: 'var(--bg-input)', color: 'var(--clr-text)', borderTop: '2px solid var(--bdr-dk)', borderLeft: '2px solid var(--bdr-dk)', borderRight: '2px solid var(--bdr-input-lt)', borderBottom: '2px solid var(--bdr-input-lt)', fontFamily: 'Monocraft, sans-serif', fontSize: '11px' }

export default function MusicPlayer() {
  const [tracks,   setTracks]   = useState([])
  const [idx,      setIdx]      = useState(0)
  const [playing,  setPlaying]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [volume,   setVolume]   = useState(() => Number(localStorage.getItem('mp_vol') ?? 0.7))
  const [musicDir, setMusicDir] = useState(() => localStorage.getItem('mp_dir') || '')
  const [dirInput, setDirInput] = useState(() => localStorage.getItem('mp_dir') || '')
  const [showDir,  setShowDir]  = useState(false)
  const [dirErr,   setDirErr]   = useState('')
  const audioRef = useRef(null)

  function loadDir(dir) {
    setDirErr('')
    const url = dir ? `${import.meta.env.BASE_URL}api/music/?dir=${encodeURIComponent(dir)}` : `${import.meta.env.BASE_URL}api/music/`
    fetch(url).then(r => r.json()).then(data => {
      if (data.error) { setDirErr(data.error); return }
      setTracks(data)
      setIdx(0)
      localStorage.setItem('mp_dir', dir)
      setMusicDir(dir)
      setShowDir(false)
    }).catch(() => setDirErr('Failed to load tracks'))
  }

  useEffect(() => { loadDir(musicDir) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const track = tracks[idx] ?? null

  useEffect(() => {
    const a = audioRef.current
    if (!a || !track) return
    a.src = `${import.meta.env.BASE_URL}api/music/stream/?path=${encodeURIComponent(track.path)}`
    a.volume = volume
    if (playing) a.play().catch(() => {})
  }, [track]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
    localStorage.setItem('mp_vol', volume)
  }, [volume])

  function togglePlay() {
    const a = audioRef.current
    if (!a || !track) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play().catch(() => {}); setPlaying(true) }
  }

  function prev() { setIdx(i => (i - 1 + tracks.length) % tracks.length); setPlaying(true) }
  function next() { setIdx(i => (i + 1) % tracks.length); setPlaying(true) }

  function onTimeUpdate() {
    const a = audioRef.current
    if (a && a.duration) setProgress(a.currentTime / a.duration)
  }

  function seek(e) {
    const a = audioRef.current
    if (a && a.duration) a.currentTime = Number(e.target.value) * a.duration
  }

  const name = track ? track.name.replace(/\.[^.]+$/, '') : '—'
  const btn = { ...XP_BTN_SM, padding: '1px 6px', fontSize: '12px' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, position: 'relative' }}>
      <audio ref={audioRef} onTimeUpdate={onTimeUpdate} onEnded={next} />

      {/* Directory picker popover */}
      <button style={btn} title="Set music folder" onClick={() => setShowDir(v => !v)}>📁</button>
      {showDir && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 999, background: 'var(--bg-panel)', border: '2px solid var(--bdr-dk)', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '320px', marginTop: '2px' }}>
          <span style={{ fontSize: '11px', fontFamily: 'Monocraft, sans-serif', color: 'var(--clr-text-dim)' }}>Music directory path</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input style={{ ...XP_INPUT, flex: 1, fontSize: '11px' }}
              value={dirInput} onChange={e => setDirInput(e.target.value)}
              placeholder="/home/user/Music"
              onKeyDown={e => e.key === 'Enter' && loadDir(dirInput)} />
            <button style={btn} onClick={() => loadDir(dirInput)}>Load</button>
          </div>
          {dirErr && <span style={{ fontSize: '10px', color: 'var(--clr-err)', fontFamily: 'Monocraft, sans-serif' }}>{dirErr}</span>}
          {musicDir && <span style={{ fontSize: '10px', color: 'var(--clr-text-dim)', fontFamily: 'Monocraft, sans-serif' }}>Current: {musicDir} ({tracks.length} tracks)</span>}
        </div>
      )}

      <button style={btn} onClick={prev}  disabled={!tracks.length}>⏮</button>
      <button style={btn} onClick={togglePlay} disabled={!tracks.length}>{playing ? '⏸' : '▶'}</button>
      <button style={btn} onClick={next}  disabled={!tracks.length}>⏭</button>

      <span style={{ fontSize: '11px', fontFamily: 'Monocraft, sans-serif', color: 'var(--clr-text)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}
        title={name}>{name}</span>

      <input type="range" min={0} max={1} step={0.001} value={progress} onChange={seek}
        style={{ flex: 1, minWidth: '60px', accentColor: 'var(--clr-accent)', cursor: 'pointer' }} />

      <input type="range" min={0} max={1} step={0.01} value={volume}
        onChange={e => setVolume(Number(e.target.value))}
        style={{ width: '50px', accentColor: 'var(--clr-accent)', cursor: 'pointer' }} />

      {tracks.length > 0 && (
        <select style={{ ...XP_INPUT, fontSize: '10px', maxWidth: '120px' }}
          value={idx} onChange={e => { setIdx(Number(e.target.value)); setPlaying(true) }}>
          {tracks.map((t, i) => (
            <option key={t.path} value={i}>{t.name.replace(/\.[^.]+$/, '')}</option>
          ))}
        </select>
      )}
    </div>
  )
}
