import './App.css'
import { useEffect, useMemo, useState } from 'react'

/* ---------- Domain / Lib ---------- */

import {
  calcPoint,
  MAX_POINT,
  getDangerComment,
  getDangerLevel,
  getDangerPercent,
} from './lib/points'

import { loadBathEvents, appendBathEvent } from './lib/bathHistory'
import { copyText, tryNativeShare } from './lib/share'
import { loadState, saveState, type AppState } from './lib/storage'
import { computeBathResult } from './domain/bath'

import {
  dayIndexFromDayKey,
  dayKeyFromDayIndex,
  getTodayKeyJST,
  labelFromDayKey,
} from './domain/dateKey'

/* ---------- UI Components ---------- */

import ShareButton from './components/ShareButton'

/* ---------- Browser Helpers ---------- */

const nowMs = () => Date.now()

/* ===================================================== */

export default function App() {
  /* ---------- State ---------- */

  const [appState, setAppState] = useState<AppState>(() => loadState())
  const [point, setPoint] = useState(0)
  const [bathFx, setBathFx] = useState(false)

  const {
    currentCleanStreak,
    bestCleanStreak,
    lastResetAt,
    lastBathDay,
  } = appState

  /* ---------- 清潔ランク ---------- */

  const cleanTier = useMemo(() => {
    if (currentCleanStreak >= 30) {
      return {
        key: 'legend',
        label: '伝説清潔',
        badge: '👑',
      }
    }

    if (currentCleanStreak >= 14) {
      return {
        key: 'super',
        label: '超神清潔',
        badge: '💖',
      }
    }

    if (currentCleanStreak >= 7) {
      return {
        key: 'god',
        label: '神清潔',
        badge: '✨',
      }
    }

    return {
      key: 'none',
      label: '',
      badge: '',
    }
  }, [currentCleanStreak])

  const isGodClean = cleanTier.key !== 'none'
  const historyRange: 7 | 30 = isGodClean ? 30 : 7

  /* ---------- ポイント更新（1分ごと） ---------- */

  useEffect(() => {
    const tick = () => {
      const p = calcPoint(nowMs(), lastResetAt, MAX_POINT)
      setPoint(Math.max(0, Math.floor(p)))
    }

    tick()

    const id = setInterval(tick, 60000)

    const onVis = () => !document.hidden && tick()

    window.addEventListener('focus', tick)
    window.addEventListener('pageshow', tick)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
      window.removeEventListener('pageshow', tick)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [lastResetAt])

  /* ---------- 危険度 ---------- */

  const dangerPercent = getDangerPercent(point)
  const dangerLevel = useMemo(
    () => getDangerLevel(point),
    [point],
  )
  const dangerComment = useMemo(
    () => getDangerComment(point),
    [point],
  )
  const isDanger = point >= 48

  /* ---------- 入浴ボタン ---------- */

  const onBathReset = () => {
    setBathFx(true)
    setTimeout(() => setBathFx(false), 400)

    const t = nowMs()
    const todayKey = getTodayKeyJST()

    const result = computeBathResult({
      nowMs: t,
      todayKey,
      lastBathDay,
      currentStreak: currentCleanStreak,
      bestStreak: bestCleanStreak,
      pointBefore: point,
    })

    if (result.shouldRecordHistory) {
      appendBathEvent({
        ts: t,
        dayKey: todayKey,
        pointBefore: point,
      })
    }

    const next: AppState = {
      lastResetAt: t,
      lastBathDay: todayKey,
      currentCleanStreak: result.nextStreak,
      bestCleanStreak: result.nextBest,
    }

    setAppState(next)
    saveState(next)
    setPoint(0)
  }

  /* ---------- 共有 ---------- */

  const buildShareText = () => {
    const streakText =
      currentCleanStreak <= 1
        ? '1日目'
        : `${currentCleanStreak}日連続`

    const sparkle = isGodClean ? ' ✨' : ''

    return `🛁 おふろ入った〜 🫧 ${streakText}${sparkle}\n#ふろリズム`
  }

  const onShare = async () => {
    const text = buildShareText()
    const shared = await tryNativeShare({ text })

    if (!shared) {
      await copyText(text)
    }
  }

  /* ---------- 履歴 ---------- */

  const historyData = useMemo(() => {
    const events = loadBathEvents()
    const countByDayKey = new Map<string, number>()

    for (const e of events) {
      countByDayKey.set(
        e.dayKey,
        (countByDayKey.get(e.dayKey) ?? 0) + 1,
      )
    }

    const todayKey = getTodayKeyJST()
    const todayIdx = dayIndexFromDayKey(todayKey)

    const days = []

    for (let i = historyRange - 1; i >= 0; i--) {
      const key =
        todayIdx === null
          ? todayKey
          : dayKeyFromDayIndex(todayIdx - i)

      days.push({
        key,
        label: labelFromDayKey(key),
        count: countByDayKey.get(key) ?? 0,
      })
    }

    const max = Math.max(
      1,
      ...days.map((d) => d.count),
    )

    const maxHeight = 72

    const items = days.map((d) => ({
      ...d,
      height:
        d.count === 0
          ? 0
          : Math.max(
              10,
              Math.round(
                (d.count / max) * maxHeight,
              ),
            ),
    }))

    return { items }
  }, [historyRange, currentCleanStreak])

  /* ===================================================== */

  return (
    <div className={`app ${isDanger ? 'dangerMode' : ''}`}>
      <header className="top">
        <div className="brand">
          <h1 className="brandTitle">
            ふろリズム
          </h1>

          {isGodClean && (
            <span
              className={`godBadge godBadge--${cleanTier.key}`}
            >
              {cleanTier.badge} {cleanTier.label}
            </span>
          )}
        </div>
      </header>

      <main className="stage">
        {/* ---------- Hero ---------- */}

        <section className="hero">
          <div className="heroNumber">
            <span className="heroValue">
              {currentCleanStreak}
            </span>

            <span className="heroUnit">
              日連続
            </span>
          </div>

          <div className="gaugeWrap">
            <div
              className={`gauge ${dangerLevel}`}
            >
              <div
                className="gaugeFill"
                style={{
                  width: `${dangerPercent}%`,
                }}
              />
            </div>

            <div
              className={`dangerBadge dangerBadge--${dangerLevel}`}
            >
              {dangerComment}
            </div>
          </div>
        </section>

        {/* ---------- CTA ---------- */}

        <div className="cta">
          <button
            className={`bathCta ${bathFx ? 'bathFx' : ''}`}
            onClick={onBathReset}
          >
            🛁 おふろ入った
          </button>
        </div>

        {/* ---------- History ---------- */}

        <section className="historyPanel">
          <div className="panelHeader">
            <h2 className="panelTitle">
              履歴
            </h2>

            <ShareButton onClick={onShare} />
          </div>

          <div className="historyBars">
            {historyData.items.map((d) => (
              <div
                key={d.key}
                className="historyItem"
              >
                {d.height > 0 ? (
                  <div
                    className="historyBar"
                    style={{
                      height: `${d.height}px`,
                    }}
                  />
                ) : (
                  <div className="historyDot" />
                )}

                <span className="historyDay">
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}