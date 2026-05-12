// ─── useHandRecognition ───────────────────────────────────────────────────────
// Browser-friendly hand-motion detection hook built on top of the
// MediaPipe Tasks Vision `HandLandmarker` WASM runtime.
//
// Usage:
//   const { videoRef, canvasRef, handData, isRunning, isLoading, error, start, stop } =
//     useHandRecognition({ onHandData });
//
// The hook:
//  1. Lazily loads the HandLandmarker WASM bundle from the MediaPipe CDN.
//  2. Opens the user's camera stream and attaches it to the provided <video>.
//  3. Runs landmark detection on every animation frame while `isRunning`.
//  4. Calls `onHandData` with structured landmark data so callers can
//     translate gestures into chess moves (or anything else).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  HandLandmarker,
  FilesetResolver,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

// ── Public types ─────────────────────────────────────────────────────────────

export interface HandPoint {
  x: number // 0-1 normalised, left to right
  y: number // 0-1 normalised, top to bottom
  z: number // relative depth
}

export interface DetectedHand {
  /** 'Left' or 'Right' as reported by MediaPipe (mirror-aware) */
  handedness: string
  /** All 21 landmarks. Index meanings follow MediaPipe's hand topology. */
  landmarks: HandPoint[]
  /** Convenience: tip of index finger (landmark 8) */
  indexTip: HandPoint
  /** Convenience: tip of thumb (landmark 4) */
  thumbTip: HandPoint
  /**
   * True when index finger is extended (tip higher on screen than its MCP
   * joint, i.e. lower y value because y=0 is top-of-frame).
   */
  indexExtended: boolean
  /**
   * Pinch strength 0-1: 1 when index tip and thumb tip are very close
   * together, 0 when far apart.  Useful for "select piece" gestures.
   */
  pinchStrength: number
}

export interface HandData {
  hands: DetectedHand[]
  /** Raw MediaPipe result for advanced usage */
  raw: HandLandmarkerResult
}

export interface UseHandRecognitionOptions {
  /** Called every frame with the current detection result (even when empty). */
  onHandData?: (data: HandData) => void
  /** Max hands to detect (default: 2) */
  maxHands?: number
  /**
   * Minimum confidence to consider a detection valid (default: 0.5).
   * Increase for fewer false positives.
   */
  minDetectionConfidence?: number
  minTrackingConfidence?: number
}

export interface UseHandRecognitionReturn {
  /** Attach to the <video> element that shows the camera feed */
  videoRef: React.RefObject<HTMLVideoElement>
  /** Attach to the <canvas> element for landmark overlay (optional) */
  canvasRef: React.RefObject<HTMLCanvasElement>
  /** Latest detection result, or null before the first frame */
  handData: HandData | null
  /** True while the camera + detector loop is active */
  isRunning: boolean
  /** True while the WASM model is being downloaded/compiled */
  isLoading: boolean
  /** Non-null when something went wrong (permission denied, WASM load fail) */
  error: string | null
  /** Request camera access and start detection */
  start: () => Promise<void>
  /** Stop detection and release the camera stream */
  stop: () => void
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

/** Euclidean distance between two normalised landmarks */
function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function buildDetectedHand(
  landmarks: NormalizedLandmark[],
  handedness: string,
): DetectedHand {
  const pts: HandPoint[] = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z ?? 0 }))

  const indexTip = pts[8]
  const thumbTip = pts[4]

  // Index extended: tip (8) above knuckle (5) - smaller y = higher on screen
  const indexExtended = landmarks[8].y < landmarks[5].y

  // Pinch: max pinch distance is roughly 0.3 (hand-relative)
  const pinchDist = dist(landmarks[4], landmarks[8])
  const pinchStrength = Math.max(0, 1 - pinchDist / 0.3)

  return {
    handedness,
    landmarks: pts,
    indexTip,
    thumbTip,
    indexExtended,
    pinchStrength,
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useHandRecognition(
  options: UseHandRecognitionOptions = {},
): UseHandRecognitionReturn {
  const {
    onHandData,
    maxHands = 2,
    minDetectionConfidence = 0.5,
    minTrackingConfidence = 0.5,
  } = options

  const videoRef = useRef<HTMLVideoElement>(null!)
  const canvasRef = useRef<HTMLCanvasElement>(null!)

  const [isRunning, setIsRunning] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [handData, setHandData] = useState<HandData | null>(null)

  // Stable refs so the rAF loop does not go stale
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const onHandDataRef = useRef(onHandData)

  useEffect(() => {
    onHandDataRef.current = onHandData
  }, [onHandData])

  // ── Landmark overlay drawing ─────────────────────────────────────────────

  const drawLandmarks = useCallback((data: HandData) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const hand of data.hands) {
      for (const pt of hand.landmarks) {
        const cx = pt.x * canvas.width
        const cy = pt.y * canvas.height
        ctx.beginPath()
        ctx.arc(cx, cy, 5, 0, Math.PI * 2)
        ctx.fillStyle = hand.handedness === 'Right' ? '#00e5ff' : '#ff4081'
        ctx.fill()
      }

      // Highlight index tip
      const ix = hand.indexTip.x * canvas.width
      const iy = hand.indexTip.y * canvas.height
      ctx.beginPath()
      ctx.arc(ix, iy, 9, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffeb3b'
      ctx.lineWidth = 3
      ctx.stroke()

      // Draw pinch strength indicator above index tip
      const pinchPct = Math.round(hand.pinchStrength * 100)
      ctx.font = 'bold 14px system-ui'
      ctx.fillStyle = '#fff'
      ctx.fillText(`${hand.handedness} pinch: ${pinchPct}%`, ix - 40, iy - 18)
    }
  }, [])

  // ── Detection loop ───────────────────────────────────────────────────────

  const detectLoop = useCallback(() => {
    if (!runningRef.current) return
    const video = videoRef.current
    const landmarker = landmarkerRef.current
    if (!landmarker || !video || video.readyState < 2) {
      rafIdRef.current = requestAnimationFrame(detectLoop)
      return
    }

    const result = landmarker.detectForVideo(video, performance.now())

    const hands: DetectedHand[] = result.landmarks.map((lms, i) => {
      const handedness =
        result.handednesses[i]?.[0]?.categoryName ?? 'Unknown'
      return buildDetectedHand(lms, handedness)
    })

    const data: HandData = { hands, raw: result }
    setHandData(data)
    drawLandmarks(data)
    onHandDataRef.current?.(data)

    rafIdRef.current = requestAnimationFrame(detectLoop)
  }, [drawLandmarks])

  // ── start ────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (runningRef.current) return
    setError(null)
    setIsLoading(true)

    try {
      // 1. Load WASM + model (cached after first call)
      if (!landmarkerRef.current) {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: maxHands,
          minHandDetectionConfidence: minDetectionConfidence,
          minTrackingConfidence,
        })
      }

      // 2. Open camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }

      // 3. Start loop
      runningRef.current = true
      setIsRunning(true)
      setIsLoading(false)
      rafIdRef.current = requestAnimationFrame(detectLoop)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setIsLoading(false)
    }
  }, [maxHands, minDetectionConfidence, minTrackingConfidence, detectLoop])

  // ── stop ─────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    runningRef.current = false
    setIsRunning(false)

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }

    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }

    setHandData(null)
  }, [])

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stop()
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    videoRef,
    canvasRef,
    handData,
    isRunning,
    isLoading,
    error,
    start,
    stop,
  }
}
