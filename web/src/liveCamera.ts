// The live camera of the phone start screen (#43): the back camera in a <video>, and a still
// taken from it. The photo exists only in memory; nothing is saved to the device or sent
// anywhere (hard rule 9). The camera is switched off whenever it is not on screen.

export interface LiveCamera {
  // Starts the camera; false when there is none, or permission was denied.
  start(): Promise<boolean>
  stop(): void
  readonly running: boolean
  // The current frame as a JPEG file, or null when the camera is not running.
  capture(): Promise<File | null>
}

export function createLiveCamera(video: HTMLVideoElement): LiveCamera {
  let stream: MediaStream | null = null
  // Each start gets a number; a camera that answers after a newer start or a stop is closed.
  let generation = 0

  function stop() {
    generation++
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
    video.srcObject = null
  }

  async function start(): Promise<boolean> {
    if (stream) return true
    const current = ++generation
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      if (current !== generation) {
        for (const track of s.getTracks()) track.stop()
        return false
      }
      stream = s
      video.srcObject = s
      await video.play()
      return true
    } catch {
      if (current === generation) stop()
      return false
    }
  }

  function capture(): Promise<File | null> {
    if (!stream || video.videoWidth === 0) return Promise.resolve(null)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
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
