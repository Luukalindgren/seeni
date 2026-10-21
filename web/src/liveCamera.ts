// The live camera of the phone start screen (#43): the back camera in a <video>, and a still
// taken from it. The photo exists only in memory; nothing is saved to the device or sent
// anywhere (hard rule 9). The camera is switched off whenever it is not on screen.

// 'failed': no camera, or permission denied. 'superseded': stopped while it was starting.
export type StartResult = 'ok' | 'failed' | 'superseded'

export interface LiveCamera {
  // Starts the camera; a start while one is pending returns that one.
  start(): Promise<StartResult>
  stop(): void
  readonly running: boolean
  // The part of the current frame that is visible on screen (the video is shown with
  // object-fit: cover), as a JPEG file; null when the camera has no frame yet.
  capture(): Promise<File | null>
}

export function createLiveCamera(video: HTMLVideoElement): LiveCamera {
  let stream: MediaStream | null = null
  // Each start gets a number; a camera that answers after a newer start or a stop is closed.
  let generation = 0
  let pending: Promise<StartResult> | null = null

  function stop() {
    generation++
    // A start still waiting for the camera now ends as 'superseded'; the next start is new.
    pending = null
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
    video.srcObject = null
  }

  function start(): Promise<StartResult> {
    if (stream) return Promise.resolve('ok')
    if (!pending) {
      const p: Promise<StartResult> = open().finally(() => {
        if (pending === p) pending = null
      })
      pending = p
    }
    return pending
  }

  async function open(): Promise<StartResult> {
    const current = ++generation
    let s: MediaStream
    try {
      s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
    } catch {
      return current === generation ? 'failed' : 'superseded'
    }
    if (current !== generation) {
      for (const track of s.getTracks()) track.stop()
      return 'superseded'
    }
    stream = s
    video.srcObject = s
    // The video autoplays muted; a rejected play() (e.g. iOS Low Power Mode) is not a failure.
    await video.play().catch(() => undefined)
    return 'ok'
  }

  function capture(): Promise<File | null> {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!stream || w === 0 || h === 0) return Promise.resolve(null)
    // The visible part: the frame is scaled to cover the element, and the overflow is cut
    // evenly from both sides.
    const scale = Math.max(video.clientWidth / w, video.clientHeight / h) || 1
    const sw = Math.min(w, Math.round(video.clientWidth / scale)) || w
    const sh = Math.min(h, Math.round(video.clientHeight / scale)) || h
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    canvas.getContext('2d')!.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, sw, sh)
    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob ? new File([blob], 'kamera.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.92),
    )
  }

  return {
    start,
    stop,
    capture,
    get running() {
      return stream !== null
    },
  }
}
