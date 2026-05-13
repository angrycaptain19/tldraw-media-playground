// ─── useHandRecognition ───────────────────────────────────────────────────────
// Browser-friendly hand-motion detection hook built on top of the
// MediaPipe Tasks Vision `GestureRecognizer` WASM runtime.
//
// Replaces the previous `HandLandmarker` + manual pinch-distance approach with
// the ML-classified gesture model shipped in the same @mediapipe/tasks-vision
// package.  The GestureRecognizer outputs both landmarks (same 21-point
// topology) AND a high-level gesture classification per frame, making gesture
// detection much more robust to lighting, hand size, and partial occlusion.
//
// Gesture vocabulary used by this hook:
//   "Closed_Fist"   → grab / pick up a chess piece
//   "Open_Palm"     → release / drop
//   "Pointing_Up"   → cursor / hover mode  (index extended, others curled)
//   "None"          → no recognised gesture
//   (others: "Thumb_Down", "Thumb_Up", "Victory", "ILoveYou" – ignored)
//
// Usage (identical interface to the old HandLandmarker hook):
//   const { videoRef, canvasRef, handData, isRunning, isLoading, error, start, stop } =
//     useHandRecognition({ onHandData })

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GestureRecognizer,
  FilesetResolver,
  type GestureRecognizerResult,
} from '@mediapipe/tasks-vision'

// ── Exported gesture name constants ──────────────────────────────────────────

export const GESTURE_FIST         = 'Closed_Fist'
export const GESTURE_OPEN_PALM    = 'Open_Palm'
export const GESTURE_POINTING_UP  = 'Pointing_Up'
export const GESTURE_NONE         = 'None'

// ── Public types ─────────────────────────────────────────────────────────────

export interface HandPoint {
  x: number  // 0-1 normalised, left to right
  y: number  // 0-1 normalised, top to bottom
  z: number  // relative depth
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
   * ML-classified gesture name for the whole hand.
   * One of: "Closed_Fist" | "Open_Palm" | "Pointing_Up" | "Thumb_Down" |
   *         "Thumb_Up" | "Victory" | "ILoveYou" | "None"
   * Use the exported GESTURE_* constants for comparisons.
   */
  gesture: string
  /** Confidence score (0-1) for the classified gesture. */
  gestureScore: number
  /**
   * @deprecated Legacy field kept for backwards compatibility.
   * Always 0 — use `gesture === GESTURE_FIST` instead of pinchStrength >= threshold.
   */
  pinchStrength: number
}

export interface HandData {
  hands: DetectedHand[]
  /** Raw MediaPipe result for advanced usage */
  raw: GestureRecognizerResult
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
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'

// Gesture recognizer model (pre-trained, ~10 MB, downloaded once and cached)
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

// Colour coding for the canvas overlay per gesture
function gestureColour(gesture: string): string {
  switch (gesture) {
    case GESTURE_FIST:        return '#ff4081'  // pink  — grab
    case GESTURE_OPEN_PALM:   return '#4caf50'  // green — release
    case GESTURE_POINTING_UP: return '#00e5ff'  // cyan  — cursor
    default:                  return '#90a4ae'  // grey  — other/none
  }
}

function buildDetectedHand(
  landmarks: Array<{ x: number; y: number; z: number }>,
  handedness: string,
  gesture: string,
  gestureScore: number,
): DetectedHand {
  const pts: HandPoint[] = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z ?? 0 }))
  const indexTip = pts[8]
  const thumbTip = pts[4]
  const indexExtended = landmarks[8].y < landmarks[5].y

  return {
    handedness,
    landmarks: pts,
    indexTip,
    thumbTip,
    indexExtended,
    gesture,
    gestureScore,
    pinchStrength: 0,  // deprecated — always 0
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

  const [isRunning,  setIsRunning]  = useState(false)
  const [isLoading,  setIsLoading]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [handData,   setHandData]   = useState<HandData | null>(null)

  const recognizerRef  = useRef<GestureRecognizer | null>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const rafIdRef       = useRef<number | null>(null)
  const runningRef     = useRef(false)
  const onHandDataRef  = useRef(onHandData)

  useEffect(() => { onHandDataRef.current = onHandData }, [onHandData])

  // ── Landmark overlay drawing ─────────────────────────────────────────────

  const drawLandmarks = useCallback((data: HandData) => {
    const canvas = canvasRef.current
    const video  = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const hand of data.hands) {
      const colour = gestureColour(hand.gesture)

      for (const pt of hand.landmarks) {
        const cx = pt.x * canvas.width
        const cy = pt.y * canvas.height
        ctx.beginPath()
        ctx.arc(cx, cy, 5, 0, Math.PI * 2)
        ctx.fillStyle = colour
        ctx.fill()
      }

      // Highlight index tip
      const ix = hand.indexTip.x * canvas.width
      const iy = hand.indexTip.y * canvas.height
      ctx.beginPath()
      ctx.arc(ix, iy, 9, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffeb3b'
      ctx.lineWidth   = 3
      ctx.stroke()

      // Gesture label above index tip
      const label = `${hand.handedness}: ${hand.gesture} (${Math.round(hand.gestureScore * 100)}%)`
      ctx.font      = 'bold 13px system-ui'
      ctx.fillStyle = '#fff'
      ctx.fillText(label, Math.max(4, ix - 60), Math.max(16, iy - 18))
    }
  }, [])

  // ── Detection loop ───────────────────────────────────────────────────────

  const detectLoop = useCallback(() => {
    if (!runningRef.current) return
    const video      = videoRef.current
    const recognizer = recognizerRef.current
    if (!recognizer || !video || video.readyState < 2) {
      rafIdRef.current = requestAnimationFrame(detectLoop)
      return
    }

    const result = recognizer.recognizeForVideo(video, performance.now())

    const hands: DetectedHand[] = result.landmarks.map((lms, i) => {
      const handedness   = result.handednesses[i]?.[0]?.categoryName ?? 'Unknown'
      const gestureEntry = result.gestures[i]?.[0]
      const gesture      = gestureEntry?.categoryName ?? GESTURE_NONE
      const gestureScore = gestureEntry?.score ?? 0
      return buildDetectedHand(lms, handedness, gesture, gestureScore)
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
      if (!recognizerRef.current) {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
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
    if (video) video.srcObject = null

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
      recognizerRef.current?.close()
      recognizerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { videoRef, canvasRef, handData, isRunning, isLoading, error, start, stop }
}
