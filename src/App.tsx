import './App.css'
import { useEffect, useMemo, useState } from 'react'

/* ---------- Domain / Lib ---------- */

// ポイント計算はまだlibに残す
// → 次のステップでdomainへ移動予定
import {
  calcPoint,
  MAX_POINT,
} from './domain/point'

// 危険度ロジックはdomainへ移行
import {
  calcDangerPercent,
  getDangerComment,
  getDangerLevel,
  isDangerZone,
} from './domain/danger'

// 入浴履歴の保存・読み込みはブラウザ依存なのでlibに残す
import { loadBathEvents, appendBathEvent } from './lib/bathHistory'

// 共有処理もブラウザ依存なのでlibに残す
import { copyText, tryNativeShare } from './lib/share'

// アプリ状態の保存・読み込み
import { loadState, saveState, type AppState } from './lib/storage'

// 入浴時のストリーク計算はdomainへ分離済み
import { computeBathResult } from './domain/bath'

// 日付に関するロジックはdomainへ分離済み
import { getTodayKeyJST } from './domain/dateKey'

// 履歴表示データの生成はdomainへ分離済み
import { buildHistoryData } from './domain/history'

/* ---------- UI Components ---------- */

import ShareButton from './components/ShareButton'

/* ---------- Platform / Browser helpers ---------- */

// 現在時刻の取得はブラウザ側の責務。
// domainにはDate.now()を持ち込まない。
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

  // 神清潔以上なら30日、それ以外は7日を表示
  const historyRange: 7 | 30 = isGodClean ? 30 : 7

  /* ---------- ポイント更新（1分ごと） ---------- */

  useEffect(() => {
    const tick = () => {
      const p = calcPoint(
        nowMs(),
        lastResetAt,
        MAX_POINT,
      )

      setPoint(Math.max(0, Math.floor(p)))
    }

    // 初回実行
    tick()

    // 1分ごとにポイントを更新
    const id = setInterval(tick, 60000)

    // タブ復帰などのタイミングでも更新
    const onVis = () => {
      if (!document.hidden) {
        tick()
      }
    }

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

  // 危険度計算はdomain/danger.tsへ委譲
  const dangerPercent = calcDangerPercent(
    point,
    MAX_POINT,
  )

  const dangerLevel = useMemo(
    () => getDangerLevel(point),
    [point],
  )

  const dangerComment = useMemo(
    () => getDangerComment(point),
    [point],
  )

  // 「48時間以上なら危険域」というルールもdomainへ移動
  const isDanger = isDangerZone(point)

  /* ---------- 入浴ボタン ---------- */

  const onBathReset = () => {
    // 入浴ボタンのアニメーション
    setBathFx(true)

    setTimeout(() => {
      setBathFx(false)
    }, 400)

    const t = nowMs()
    const todayKey = getTodayKeyJST()

    // 入浴によるストリーク更新をdomainへ委譲
    const result = computeBathResult({
      nowMs: t,
      todayKey,
      lastBathDay,
      currentStreak: currentCleanStreak,
      bestStreak: bestCleanStreak,
      pointBefore: point,
    })

    // 必要な場合だけ履歴を保存
    if (result.shouldRecordHistory) {
      appendBathEvent({
        ts: t,
        dayKey: todayKey,
        pointBefore: point,
      })
    }

    // 次のアプリ状態を作成
    const next: AppState = {
      lastResetAt: t,
      lastBathDay: todayKey,
      currentCleanStreak: result.nextStreak,
      bestCleanStreak: result.nextBest,
    }

    // React Stateを更新
    setAppState(next)

    // localStorageへ保存
    saveState(next)

    // 入浴したのでポイントを0へ戻す
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

    // Web Share APIが使える場合はネイティブ共有
    const shared = await tryNativeShare({ text })

    // 使えない場合はクリップボードへコピー
    if (!shared) {
      await copyText(text)
    }
  }

  /* ---------- 履歴 ---------- */

  // 履歴データの生成はdomain/history.tsへ委譲
  //
  // App.tsxでは
  // 「イベントを読み込む → domainへ渡す」
  // だけを担当する。
  const historyData = useMemo(() => {
    const events = loadBathEvents()
    const todayKey = getTodayKeyJST()

    return buildHistoryData(
      events,
      todayKey,
      historyRange,
    )
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
            <div className={`gauge ${dangerLevel}`}>
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