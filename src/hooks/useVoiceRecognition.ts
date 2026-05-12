// ─── useVoiceRecognition ──────────────────────────────────────────────────────
// A hook that wraps the browser's Web Speech API (SpeechRecognition) and
// translates chess-specific speech into structured VoiceCommand objects.
//
// Supported command shapes:
//   Move:      "e2 to e4", "e2 e4", "knight to f3", "bishop takes d5"
//   New game:  "new game", "restart"
//   Undo:      "undo", "take back"
//
// Design mirrors useHandRecognition so the panel / wiring code stays uniform.

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Public types ──────────────────────────────────────────────────────────────

export type VoiceCommandType = 'move' | 'new-game' | 'undo' | 'unknown'

export interface VoiceCommand {
  type: VoiceCommandType
  /** Raw transcript that produced this command */
  transcript: string
  /** For 'move': source square label e.g. "e2" */
  from?: string
  /** For 'move': destination square label e.g. "e4" */
  to?: string
}

export interface UseVoiceRecognitionOptions {
  /** Called every time a recognised command is parsed */
  onCommand?: (cmd: VoiceCommand) => void
  /** Called with the raw interim/final transcript for display */
  onTranscript?: (text: string, isFinal: boolean) => void
}

export interface UseVoiceRecognitionReturn {
  isListening: boolean
  isSupported: boolean
  error: string | null
  lastTranscript: string
  lastCommand: VoiceCommand | null
  start: () => void
  stop: () => void
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

// Map phonetically ambiguous spoken words -> canonical chess notation
const WORD_MAP: Record<string, string> = {
  // Files -- spoken as letters or words
  alpha: 'a', ayy: 'a',
  bee: 'b', be: 'b',
  sea: 'c', see: 'c',
  dee: 'd',
  ee: 'e',
  eff: 'f', ef: 'f',
  gee: 'g', ji: 'g',
  aitch: 'h', ache: 'h',
  // Ranks -- spoken as words
  one: '1', won: '1',
  two: '2', too: '2', to: '2',
  three: '3',
  four: '4', for: '4', fore: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8', ate: '8',
  // Piece names (used in "knight to f3" style)
  king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: 'P',
  // Move verbs -- remove
  takes: '', captures: '', x: '', move: '', moves: '', goes: '',
}

/** Normalise a transcript to lower-case, collapse whitespace, strip punctuation */
function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Replace every token via WORD_MAP, collapse result */
function substituteTokens(text: string): string {
  return text
    .split(' ')
    .map((t) => (t in WORD_MAP ? WORD_MAP[t] : t))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Square label: letter a-h followed by digit 1-8
const SQ_RE = /\b([a-h][1-8])\b/g

/** Try to parse a move from normalised+substituted text.
 *  Returns [from, to] labels or null. */
function parseMove(text: string): [string, string] | null {
  const matches = Array.from(text.matchAll(SQ_RE), (m) => m[1])
  if (matches.length >= 2) return [matches[0], matches[1]]
  return null
}

/** Full pipeline: raw transcript -> VoiceCommand */
function parseCommand(raw: string): VoiceCommand {
  const norm = normalise(raw)
  const subst = substituteTokens(norm)

  // Game-control commands (checked before move parsing)
  if (/\b(new game|restart|reset)\b/.test(norm)) {
    return { type: 'new-game', transcript: raw }
  }
  if (/\b(undo|take back|takeback)\b/.test(norm)) {
    return { type: 'undo', transcript: raw }
  }

  // Move command
  const sq = parseMove(subst)
  if (sq) return { type: 'move', transcript: raw, from: sq[0], to: sq[1] }

  return { type: 'unknown', transcript: raw }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSpeechRecognitionConstructor(): any {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useVoiceRecognition(
  options: UseVoiceRecognitionOptions = {},
): UseVoiceRecognitionReturn {
  const { onCommand, onTranscript } = options

  const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
  const isSupported = SpeechRecognitionCtor !== null

  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTranscript, setLastTranscript] = useState('')
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null)

  // Keep callbacks in refs so the recognition event handlers don't go stale
  const onCommandRef = useRef(onCommand)
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const runningRef = useRef(false)

  const start = useCallback(() => {
    if (!isSupported || runningRef.current) return
    setError(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognitionCtor() as any
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      runningRef.current = true
      setIsListening(true)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript: string = result[0].transcript
        const isFinal: boolean = result.isFinal

        setLastTranscript(transcript)
        onTranscriptRef.current?.(transcript, isFinal)

        if (isFinal) {
          const cmd = parseCommand(transcript)
          setLastCommand(cmd)
          onCommandRef.current?.(cmd)
        }
      }
    }

    recognition.onerror = (event: { error: string }) => {
      // 'no-speech' is a normal timeout -- don't surface as an error
      if (event.error === 'no-speech') return
      const msg =
        event.error === 'not-allowed'
          ? 'Microphone access denied. Please allow microphone in your browser settings.'
          : `Speech recognition error: ${event.error}`
      setError(msg)
      runningRef.current = false
      setIsListening(false)
    }

    recognition.onend = () => {
      // Auto-restart to keep continuous listening (unless explicitly stopped)
      if (runningRef.current) {
        try {
          recognition.start()
        } catch {
          /* ignore restart race */
        }
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [isSupported, SpeechRecognitionCtor])

  const stop = useCallback(() => {
    runningRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
    setLastTranscript('')
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false
      recognitionRef.current?.stop()
      recognitionRef.current = null
    }
  }, [])

  return {
    isListening,
    isSupported,
    error,
    lastTranscript,
    lastCommand,
    start,
    stop,
  }
}
