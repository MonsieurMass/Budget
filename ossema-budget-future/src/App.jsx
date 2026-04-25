import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import './App.css'

const STORAGE_KEY = 'ossema-budget-future-v4'
const BADGES_KEY = 'ossema-badges-v4'
const LEGACY_STORAGE_KEYS = [STORAGE_KEY, 'ossema-budget-future-v3', 'ossema-budget-future-v2', 'ossema-budget-future-v1']
const APP_NAME = 'MOIS CLAIR'
const PROFILE_OPTIONS = ['Salarié', 'Étudiant', 'Entrepreneur', 'Freelance', 'Couple / foyer']
const SEGMENT_OPTIONS = [
  { id: 'solo', label: 'Solo simple', intro: 'Un budget personnel clair, sans friction.' },
  { id: 'variable', label: 'Revenus variables', intro: 'Freelance, pourboires, missions, mois irréguliers.' },
  { id: 'couple', label: 'Couple / foyer', intro: 'Deux revenus, des charges communes, une lecture simple.' },
  { id: 'pro', label: 'Pro + perso', intro: 'Séparer les flux pro et perso sans se perdre.' },
]
const EXPERIENCE_OPTIONS = [
  { id: 'guided', label: 'Guidée', intro: 'Plus de repères, plus d’explications, moins de densité.' },
  { id: 'expert', label: 'Expert', intro: 'Lecture plus directe, plus sobre, plus dense.' },
]
const OWNER_OPTIONS = [
  { id: 'moi', label: 'Moi' },
  { id: 'partenaire', label: 'Partenaire' },
  { id: 'commun', label: 'Commun' },
]
const SCOPE_OPTIONS = [
  { id: 'perso', label: 'Perso' },
  { id: 'foyer', label: 'Foyer' },
  { id: 'pro', label: 'Pro' },
]

function buildMonthLabels() {
  const now = new Date()
  return Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 2 + i, 1)
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  })
}
const MONTHS = buildMonthLabels()

// ─── Badge definitions ────────────────────────────────────────────────────────
const BADGE_DEFS = [
  {
    id: 'first_month',
    icon: '🌱',
    name: 'PREMIER PAS',
    desc: 'Premier mois renseigné',
    tier: 'bronze',
    check: (allM) => allM.some((m) => m.revenu > 0),
  },
  {
    id: 'invisible_killer',
    icon: '👻',
    name: 'INVISIBLE KILLER',
    desc: 'Zéro dépenses invisibles',
    tier: 'silver',
    check: (allM) => allM.some((m) => m.invisibles === 0 && m.revenu > 0),
  },
  {
    id: 'twenty_pct',
    icon: '📈',
    name: '20%',
    desc: "Taux d'épargne 20%+ atteint",
    tier: 'gold',
    check: (allM) => allM.some((m) => m.tauxEpargne >= 0.2),
  },
  {
    id: 'elite_score',
    icon: '⭐',
    name: 'SOLIDE',
    desc: 'Score 75+ obtenu',
    tier: 'silver',
    check: (allM) => allM.some((m) => m.score >= 75),
  },
  {
    id: 'ossema_elite',
    icon: '👑',
    name: 'MOIS CLAIR ELITE',
    desc: 'Score 90+ trois mois de suite',
    tier: 'platinum',
    check: (allM) => allM.filter((m) => m.score >= 90).length >= 3,
  },
  {
    id: 'emergency_fund',
    icon: '🛡',
    name: 'BLINDÉ',
    desc: 'Fond urgence 3 mois constitué',
    tier: 'gold',
    check: (allM) => allM.some((m) => m.epargne >= m.fixes * 3 && m.fixes > 0),
  },
]

const onboardingSlides = [
  {
    id: 'manifesto',
    title: 'Ton argent. Tes règles. Ton empire.',
    text: "Une app finance qui ne ressemble pas à un tableur. Elle te montre ce que tu contrôles, ce qui fuit et où tu vas.",
  },
  {
    id: 'clarity',
    title: '3 mois pour reprendre le contrôle.',
    text: "Tu avances mois après mois, sans friction. Le produit est construit pour te faire ressentir ta progression, pas juste l'afficher.",
  },
  {
    id: 'ghost',
    title: 'Les dépenses invisibles deviennent visibles.',
    text: "Ghost spend, score, waterfall, vision. L'argent cesse d'être abstrait. Chaque catégorie prend une forme.",
  },
  {
    id: 'launch',
    title: 'Configure ton protocole.',
    text: 'Prénom, revenu, découvert. Le reste se règle ensuite dans les mois.',
  },
]

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Aujourd’hui' },
  { id: 'bilan', label: '3 mois' },
  { id: 'vision', label: 'Patrimoine' },
  { id: 'badges', label: 'Discipline' },
]

function emptyMonth() {
  return { revenu: 0, decouvert: 0, incomeSources: [], items: [] }
}

function applyRecurring(prevMonth, nextMonth) {
  const recurring = (prevMonth.items || []).filter((i) => i.recurring)
  const existingNames = new Set((nextMonth.items || []).map((i) => i.name))
  const toAdd = recurring.filter((i) => !existingNames.has(i.name))
  return {
    ...nextMonth,
    revenu: nextMonth.revenu || prevMonth.revenu,
    incomeSources: (nextMonth.incomeSources || []).length ? nextMonth.incomeSources : (prevMonth.incomeSources || []),
    items: [...(nextMonth.items || []), ...toAdd.map((i) => ({ ...i, id: Date.now() + Math.random() }))],
  }
}

const FORMSPREE_ID = import.meta.env.VITE_FORMSPREE_ID || ''

const initialState = {
  onboardingDone: false,
  prenom: '',
  email: '',
  profil: 'Salarié',
  segment: 'solo',
  experience: 'guided',
  partnerName: '',
  theme: 'dark',
  activeMonth: 2,
  months: [emptyMonth(), emptyMonth(), emptyMonth()],
}

const PARSE_RULES = [
  { key: 'revenu', words: ['salaire', 'revenu', 'paie', 'pay', 'caf', 'prime', 'bonus', 'freelance', 'mission', 'client', 'facture'] },
  { key: 'decouvert', words: ['decouvert', 'découvert'] },
  { key: 'fixes', words: ['loyer', 'credit', 'crédit', 'assurance', 'internet', 'telephone', 'téléphone', 'edf', 'charges', 'abonnement', 'salle', 'sport', 'sportive', 'box', 'mutuelle', 'electricite', 'électricité', 'eau', 'cantine'] },
  { key: 'variables', words: ['courses', 'transport', 'essence', 'restaurant', 'sorties', 'shopping', 'metro', 'métro', 'navigo', 'cigarette', 'tabac', 'pharmacie', 'medecin', 'médecin', 'halal', 'food', 'jeux', 'jeu', 'ami', 'remboursement', 'cadeau', 'coiffeur', 'restau'] },
  { key: 'invisibles', words: ['amazon', 'uber', 'deliveroo', 'netflix', 'spotify', 'achat', 'impulsif', 'invisible', 'youtube', 'prime video', 'disney', 'cafe', 'café', 'apple', 'google', 'deezer', 'canal', 'paramount'] },
  { key: 'epargne', words: ['epargne', 'épargne', 'pea', 'livret', 'invest', 'etf', 'placement', 'assurance vie', 'crypto'] },
]

const FIELD_LABELS = {
  revenu: 'Revenu', decouvert: 'Découvert', fixes: 'Charges fixes',
  variables: 'Variables', invisibles: 'Invisibles', epargne: 'Épargne',
}

const EXPENSE_PRESETS = [
  { label: 'Netflix', key: 'invisibles', amount: 14 },
  { label: 'Spotify', key: 'invisibles', amount: 11 },
  { label: 'Salle de sport', key: 'fixes', amount: 35 },
  { label: 'Ticket métro', key: 'variables', amount: 2 },
  { label: 'Navigo', key: 'variables', amount: 86 },
  { label: 'Paquet cigarettes', key: 'variables', amount: 13 },
  { label: 'Coffee', key: 'invisibles', amount: 4 },
  { label: 'Courses', key: 'variables', amount: 40 },
]

function fmt(value) {
  if (!value && value !== 0) return '–'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}
function pct(value) { return `${Math.round(value * 100)}%` }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)) }
function makeId() { return Date.now() + Math.random() }
function isCoupleSegment(segment) { return segment === 'couple' }
function isProSegment(segment) { return segment === 'pro' }
function isVariableSegment(segment) { return segment === 'variable' }
function getDefaultOwner(segment) { return isCoupleSegment(segment) ? 'commun' : 'moi' }
function getDefaultScope(segment) { return isProSegment(segment) ? 'perso' : isCoupleSegment(segment) ? 'foyer' : 'perso' }

function normalizeNumber(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : 0
}

function normalizeItem(item, index = 0) {
  if (!item || typeof item !== 'object') return null
  const amount = Math.abs(normalizeNumber(item.amount))
  if (!amount) return null
  const cat = ['fixes', 'variables', 'invisibles', 'epargne'].includes(item.cat) ? item.cat : 'variables'
  return {
    id: item.id ?? `${Date.now()}-${index}`,
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Dépense',
    amount,
    cat,
    tag: typeof item.tag === 'string' ? item.tag.trim() : '',
    owner: ['moi', 'partenaire', 'commun'].includes(item.owner) ? item.owner : 'moi',
    scope: ['perso', 'foyer', 'pro'].includes(item.scope) ? item.scope : 'perso',
    recurring: Boolean(item.recurring),
    createdAt: item.createdAt || new Date().toISOString(),
  }
}

function normalizeIncomeSource(source, index = 0) {
  if (!source || typeof source !== 'object') return null
  const amount = Math.abs(normalizeNumber(source.amount))
  if (!amount) return null
  return {
    id: source.id ?? `income-${Date.now()}-${index}`,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : `Revenu ${index + 1}`,
    amount,
    owner: ['moi', 'partenaire', 'commun'].includes(source.owner) ? source.owner : 'moi',
    scope: ['perso', 'foyer', 'pro'].includes(source.scope) ? source.scope : 'perso',
  }
}

function sumIncomeSources(month) {
  return (month.incomeSources || []).reduce((sum, source) => sum + normalizeNumber(source.amount), 0)
}

function normalizeMonth(month = {}) {
  const items = Array.isArray(month.items) ? month.items.map(normalizeItem).filter(Boolean) : []
  const incomeSources = Array.isArray(month.incomeSources) ? month.incomeSources.map(normalizeIncomeSource).filter(Boolean) : []
  return {
    revenu: normalizeNumber(month.revenu),
    decouvert: normalizeNumber(month.decouvert),
    incomeSources,
    items,
    fixes: normalizeNumber(month.fixes),
    variables: normalizeNumber(month.variables),
    invisibles: normalizeNumber(month.invisibles),
    epargne: normalizeNumber(month.epargne),
  }
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return initialState
  const rawMonths = Array.isArray(raw.months)
    ? raw.months
    : Array.isArray(raw.data?.months)
      ? raw.data.months
      : [raw.month1, raw.month2, raw.month3].filter(Boolean)
  const months = Array.from({ length: 3 }, (_, index) => normalizeMonth(rawMonths?.[index] || emptyMonth()))
  return {
    onboardingDone: Boolean(raw.onboardingDone),
    prenom: typeof raw.prenom === 'string' ? raw.prenom : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    profil: PROFILE_OPTIONS.includes(raw.profil) ? raw.profil : 'Salarié',
    segment: SEGMENT_OPTIONS.some((item) => item.id === raw.segment) ? raw.segment : 'solo',
    experience: EXPERIENCE_OPTIONS.some((item) => item.id === raw.experience) ? raw.experience : 'guided',
    partnerName: typeof raw.partnerName === 'string' ? raw.partnerName : '',
    theme: raw.theme === 'light' ? 'light' : 'dark',
    activeMonth: clamp(normalizeNumber(raw.activeMonth) || 2, 0, 2),
    months,
  }
}

function readPersistedState() {
  let lastBrokenKey = ''
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const saved = window.localStorage.getItem(key)
      if (!saved) continue
      const parsed = JSON.parse(saved)
      const state = normalizeState(parsed)
      if (key !== STORAGE_KEY) {
        return {
          state,
          notice: {
            tone: 'ok',
            title: 'Anciennes données retrouvées',
            text: 'On a repris ce qu’on a pu d’une ancienne version. Vérifie juste ton mois avant de continuer.',
          },
        }
      }
      return { state, notice: null }
    } catch {
      lastBrokenKey = key
      try { window.localStorage.removeItem(key) } catch {}
    }
  }
  if (lastBrokenKey) {
    return {
      state: initialState,
      notice: {
        tone: 'error',
        title: 'Ancienne sauvegarde illisible',
        text: "On repart sur une base propre pour éviter l'écran vide. Tu peux recommencer ou importer un backup JSON si tu en as un.",
      },
    }
  }
  return { state: initialState, notice: null }
}

function sumCat(items, cat) {
  return (items || []).filter((i) => i.cat === cat).reduce((s, i) => s + (Number(i.amount) || 0), 0)
}

function calcMonth(month) {
  const revenu = sumIncomeSources(month) || (Number(month.revenu) || 0)
  const decouvert = Number(month.decouvert) || 0
  const items = month.items || []
  const hasItems = items.length > 0 || !('fixes' in month)
  const fixes = hasItems ? sumCat(items, 'fixes') : (Number(month.fixes) || 0)
  const variables = hasItems ? sumCat(items, 'variables') : (Number(month.variables) || 0)
  const invisibles = hasItems ? sumCat(items, 'invisibles') : (Number(month.invisibles) || 0)
  const epargne = hasItems ? sumCat(items, 'epargne') : (Number(month.epargne) || 0)
  const totalDepenses = fixes + variables + invisibles + epargne
  const budgetDisponible = revenu + decouvert
  const soldeReel = revenu - totalDepenses
  const soldeAjuste = budgetDisponible - totalDepenses
  const decouvertUtilise = clamp(-soldeReel, 0, decouvert)
  const depassement = Math.max(0, totalDepenses - budgetDisponible)
  const tauxFixes = revenu > 0 ? fixes / revenu : 0
  const tauxVariables = revenu > 0 ? variables / revenu : 0
  const tauxInvisibles = revenu > 0 ? invisibles / revenu : 0
  const tauxEpargne = revenu > 0 ? epargne / revenu : 0
  const tauxSolde = revenu > 0 ? soldeAjuste / revenu : 0
  const overspendRatio = revenu > 0 ? Math.max(0, totalDepenses - revenu) / revenu : 0
  const baseScore = clamp(
    Math.round(
      (tauxEpargne >= 0.2 ? 28 : tauxEpargne >= 0.15 ? 22 : tauxEpargne >= 0.1 ? 16 : tauxEpargne > 0 ? 8 : 0) +
      (tauxFixes <= 0.45 ? 20 : tauxFixes <= 0.55 ? 14 : 6) +
      (tauxInvisibles <= 0.03 ? 18 : tauxInvisibles <= 0.06 ? 12 : 4) +
      (tauxSolde >= 0.15 ? 20 : tauxSolde >= 0 ? 12 : 4) +
      (tauxVariables <= 0.3 ? 14 : 6),
    ), 0, 100,
  )
  const score = clamp(baseScore - Math.round(overspendRatio * 60), 0, 100)
  const scoreLabel = revenu === 0 || totalDepenses === 0
    ? 'À CONSTRUIRE'
    : score >= 90 ? 'ELITE' : score >= 75 ? 'SOLIDE' : score >= 55 ? 'EN PROGRESSION' : 'ALERTE'
  const reste = Math.max(0, revenu - fixes - variables - invisibles - epargne)
  return { revenu, decouvert, fixes, variables, invisibles, epargne, reste, totalDepenses, budgetDisponible, soldeReel, soldeAjuste, decouvertUtilise, depassement, tauxFixes, tauxVariables, tauxInvisibles, tauxEpargne, tauxSolde, score, scoreLabel, overspendRatio }
}

function scoreTone(score) {
  if (score >= 90) return 'elite'
  if (score >= 75) return 'solid'
  if (score >= 55) return 'warm'
  return 'alert'
}

function parseBudgetInput(input) {
  const normalized = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bet puis\b/g, ',')
    .replace(/\bpuis\b/g, ',')
    .replace(/\bet\b/g, ',')
  const segments = normalized.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
  const updates = {}
  const matched = []
  for (const segment of segments) {
    const amountMatch = segment.match(/(\d+(?:[.,]\d+)?)\s*(euros?|e|€)?/)
    if (!amountMatch) continue
    const amount = Math.round(Number(amountMatch[1].replace(',', '.')))
    if (!Number.isFinite(amount)) continue
    let rule = PARSE_RULES.find((entry) =>
      entry.words.some((word) => segment.includes(word)),
    )
    if (!rule && /depens|depense|depensé|depensee|pai[eé]/.test(segment)) {
      rule = { key: 'variables' }
    }
    if (!rule) continue
    updates[rule.key] = (updates[rule.key] || 0) + amount
    matched.push({ key: rule.key, amount, raw: segment })
  }
  return { updates, matched }
}

function toTitleCase(value) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function parsedItemLabel(raw, key) {
  const fallback = {
    fixes: 'Charge fixe',
    variables: 'Dépense variable',
    invisibles: 'Dépense invisible',
    epargne: 'Épargne',
  }
  const cleaned = raw
    .replace(/(\d+(?:[.,]\d+)?)\s*(euros?|e|€)?/gi, ' ')
    .replace(/\bj['’]?ai\b/gi, ' ')
    .replace(/\b(je|me|mon|ma|mes|de|du|des|en|pour|sur|avec|ce|cette|le|la|les)\b/gi, ' ')
    .replace(/\b(depens|depense|dépense|depensé|dépensé|depensee|paye|payé|paye|salaire|revenu)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned ? toTitleCase(cleaned) : fallback[key]
}

function hasNamedItem(month, cat, pattern) {
  return (month.items || []).some((item) => item.cat === cat && pattern.test((item.name || '').toLowerCase()))
}

function getCalmMessage(metrics, prenom) {
  if (metrics.totalDepenses === 0) {
    return `${prenom ? `${prenom}, ` : ''}commence par ajouter ta première dépense. Ton score prendra sens ensuite.`
  }
  if (metrics.soldeAjuste >= 500) {
    return `${prenom ? `${prenom}, ` : ''}ton mois est confortable. Tu peux avancer sereinement.`
  }
  if (metrics.soldeAjuste >= 0) {
    return `${prenom ? `${prenom}, ` : ''}tu restes dans le vert. On garde juste le cap.`
  }
  if (metrics.decouvertUtilise > 0 && metrics.depassement === 0) {
    return `${prenom ? `${prenom}, ` : ''}tu t'appuies un peu sur le découvert. Rien de dramatique, mais il faut recréer de la marge.`
  }
  return `${prenom ? `${prenom}, ` : ''}on reprend la main étape par étape. La priorité est de calmer le mois.`
}

function hasMonthStarted(month) {
  if ((sumIncomeSources(month) || Number(month.revenu)) > 0) return true
  if ((month.items || []).length > 0) return true
  return ['fixes', 'variables', 'invisibles', 'epargne'].some((key) => Number(month[key]) > 0)
}

function hasMonthBasics(month) {
  const items = month.items || []
  const fixes = sumCat(items, 'fixes') || Number(month.fixes) || 0
  const variables = sumCat(items, 'variables') || Number(month.variables) || 0
  const invisibles = sumCat(items, 'invisibles') || Number(month.invisibles) || 0
  const epargne = sumCat(items, 'epargne') || Number(month.epargne) || 0
  const fixedCount = items.filter((item) => item.cat === 'fixes').length + (Number(month.fixes) > 0 ? 1 : 0)
  const hasRevenue = (sumIncomeSources(month) || Number(month.revenu)) > 0
  const hasHousing = hasNamedItem(month, 'fixes', /loyer|credit|crédit|immo|logement/)
  const hasSecondStructuralEntry =
    fixedCount >= 2 ||
    variables > 0 ||
    invisibles > 0 ||
    epargne > 0 ||
    Number(month.decouvert) > 0

  return hasRevenue && (hasHousing || fixes > 0) && hasSecondStructuralEntry
}

function getCoachingMessages(metrics, prevMetrics) {
  const messages = []
  if (prevMetrics && metrics.score > prevMetrics.score) {
    messages.push({ type: 'progress', icon: '↑', text: `Tu progresses de ${metrics.score - prevMetrics.score} points par rapport au mois précédent.` })
  }
  if (metrics.tauxInvisibles > 0.06) {
    messages.push({ type: 'alert', icon: '👻', text: `Les dépenses invisibles sont trop hautes (${pct(metrics.tauxInvisibles)}). Reviens sous 3%, soit ${fmt(metrics.revenu * 0.03)}.` })
  } else if (metrics.tauxInvisibles > 0.03) {
    messages.push({ type: 'warn', icon: '⚡', text: `Les invisibles restent à surveiller (${pct(metrics.tauxInvisibles)}). Encore un petit effort.` })
  } else if (metrics.tauxInvisibles > 0 && metrics.tauxInvisibles <= 0.03) {
    messages.push({ type: 'elite', icon: '✓', text: `Les invisibles sont bien tenues (${pct(metrics.tauxInvisibles)}). C'est propre.` })
  }
  if (metrics.tauxEpargne === 0) {
    messages.push({ type: 'alert', icon: '⚠', text: `Aucune épargne ce mois-ci. Commence simple avec 5%, soit ${fmt(metrics.revenu * 0.05)}.` })
  } else if (metrics.tauxEpargne < 0.1) {
    messages.push({ type: 'warn', icon: '📈', text: `Ton épargne est à ${pct(metrics.tauxEpargne)}. Le cap premium reste 20%, soit ${fmt(metrics.revenu * 0.2)}.` })
  } else if (metrics.tauxEpargne >= 0.2) {
    messages.push({ type: 'elite', icon: '🏆', text: `Tu es à 20% ou plus d'épargne. C'est une vraie base de construction.` })
  }
  if (metrics.tauxFixes > 0.55) {
    messages.push({ type: 'alert', icon: '🔒', text: `Tes charges fixes prennent ${pct(metrics.tauxFixes)} du revenu. L'objectif est de revenir sous 45%.` })
  }
  if (metrics.depassement > 0) {
    messages.push({ type: 'critical', icon: '🚨', text: `Tu dépasses ton budget de ${fmt(metrics.depassement)}. Il faut couper tout ce qui n'est pas essentiel.` })
  }
  if (prevMetrics && metrics.invisibles < prevMetrics.invisibles) {
    messages.push({ type: 'progress', icon: '↓', text: `Tu as réduit les invisibles de ${fmt(prevMetrics.invisibles - metrics.invisibles)}. Très bon signal.` })
  }
  if (messages.length === 0) {
    messages.push({ type: 'solid', icon: '⚡', text: `Ton budget est stable. L'objectif est surtout de garder ce rythme.` })
  }
  return messages.slice(0, 3)
}

function getActionPlan(metrics) {
  const actions = []
  const invisibleTarget = metrics.revenu * 0.03
  const epargneTarget = metrics.revenu * 0.2

  if (metrics.invisibles > invisibleTarget) {
    actions.push({
      title: 'Couper les invisibles',
      value: fmt(metrics.invisibles - invisibleTarget),
      detail: `Objectif simple: revenir sous ${fmt(invisibleTarget)} ce mois.`,
      tone: 'alert',
    })
  }

  if (metrics.epargne < epargneTarget) {
    actions.push({
      title: "Renforcer l'épargne",
      value: fmt(epargneTarget - metrics.epargne),
      detail: `Cap du mois: ${fmt(epargneTarget)} pour atteindre 20%.`,
      tone: 'gold',
    })
  }

  if (metrics.soldeAjuste < 200) {
    actions.push({
      title: 'Créer de la marge',
      value: fmt(200 - metrics.soldeAjuste),
      detail: 'Vise au moins 200€ de reste pour respirer.',
      tone: 'cyan',
    })
  }

  if (actions.length === 0) {
    actions.push({
      title: 'Consolider',
      value: fmt(metrics.epargne),
      detail: 'Le mois est propre. Le bon réflexe est de répéter cette structure.',
      tone: 'green',
    })
  }

  return actions.slice(0, 3)
}

function getBankAdvisorSummary(metrics, prevMetrics) {
  const safetyBuffer = Math.max(80, metrics.revenu * 0.05)
  const safeToSpend = Math.max(0, metrics.soldeAjuste - safetyBuffer)
  const hiddenLeak = Math.max(0, metrics.invisibles - metrics.revenu * 0.03)
  const savingsGap = Math.max(0, metrics.revenu * 0.2 - metrics.epargne)
  const deltaScore = prevMetrics ? metrics.score - prevMetrics.score : 0

  let posture = 'Mois stable'
  let intro = `Tu peux encore engager ${fmt(safeToSpend)} en gardant une petite marge de sécurité.`
  if (metrics.depassement > 0) {
    posture = 'Mois sous tension'
    intro = `Tu dépasses déjà ton budget de ${fmt(metrics.depassement)}. La priorité est de stopper les sorties non essentielles.`
  } else if (metrics.decouvertUtilise > 0) {
    posture = 'Équilibre fragile'
    intro = `Tu utilises ${fmt(metrics.decouvertUtilise)} de découvert. Il faut recréer de la marge avant d'ajouter quoi que ce soit.`
  } else if (metrics.soldeAjuste >= 400) {
    posture = 'Mois confortable'
    intro = `Ton mois est confortable. Tu peux répartir entre épargne, projets et respiration sans te mettre en risque.`
  }

  const bullets = []
  if (hiddenLeak > 0) bullets.push(`Réduire les invisibles de ${fmt(hiddenLeak)} remettrait ton mois dans une zone saine.`)
  if (savingsGap > 0) bullets.push(`Il manque ${fmt(savingsGap)} pour atteindre un rythme d'épargne premium à 20%.`)
  if (metrics.tauxFixes > 0.55) bullets.push(`Tes charges fixes sont hautes (${pct(metrics.tauxFixes)}). Toute baisse ici a un effet durable.`)
  if (deltaScore > 0) bullets.push(`Ton score progresse de ${deltaScore} points par rapport au mois précédent.`)
  if (bullets.length === 0) bullets.push('Rien d’urgent à corriger. Le plus important est de répéter ce rythme le mois prochain.')

  return {
    posture,
    intro,
    safeToSpend,
    hiddenLeak,
    bullets: bullets.slice(0, 3),
  }
}

function getPatrimonyPlan(metricsByMonth, profil) {
  const monthsWithRevenue = metricsByMonth.filter((item) => item.revenu > 0)
  const sample = monthsWithRevenue.length || 1
  const avgRevenue = monthsWithRevenue.reduce((sum, item) => sum + item.revenu, 0) / sample
  const avgSavings = monthsWithRevenue.reduce((sum, item) => sum + item.epargne, 0) / sample
  const avgFixes = monthsWithRevenue.reduce((sum, item) => sum + item.fixes, 0) / sample
  const totalSavings = metricsByMonth.reduce((sum, item) => sum + item.epargne, 0)
  const emergency3 = avgFixes * 3
  const emergency6 = avgFixes * 6
  const emergencyRatio = emergency3 > 0 ? totalSavings / emergency3 : 0
  const investableNow = Math.max(0, avgSavings - Math.max(0, emergency3 - totalSavings) / 6)

  let phase = 'Sécuriser'
  let nextMove = `Constituer un matelas de sécurité de ${fmt(emergency3)} avant d'accélérer l'investissement.`
  if (emergencyRatio >= 1 && avgSavings > avgRevenue * 0.1) {
    phase = 'Construire'
    nextMove = `Tu peux commencer à ventiler une partie de l'épargne vers le long terme, tout en gardant le matelas intact.`
  }
  if (emergencyRatio >= 1.5 && avgSavings >= avgRevenue * 0.15) {
    phase = 'Accélérer'
    nextMove = `Ton socle de sécurité tient. La priorité devient une allocation régulière long terme et des objectifs patrimoniaux clairs.`
  }

  const profileAllocations = {
    Salarié: [
      { label: 'Sécurité', split: '60%', detail: 'Livret A / cash de précaution' },
      { label: 'Long terme', split: '40%', detail: 'PEA / ETF progressif' },
    ],
    Étudiant: [
      { label: 'Sécurité', split: '80%', detail: 'Livret A / trésorerie études' },
      { label: 'Croissance', split: '20%', detail: 'Micro-investissement progressif' },
    ],
    Entrepreneur: [
      { label: 'Trésorerie', split: '70%', detail: 'Cash de sécurité perso + activité' },
      { label: 'Long terme', split: '30%', detail: 'PEA / ETF une fois le coussin posé' },
    ],
  }

  return {
    avgRevenue,
    avgSavings,
    avgFixes,
    totalSavings,
    emergency3,
    emergency6,
    emergencyRatio,
    investableNow,
    phase,
    nextMove,
    allocations: profileAllocations[profil] || profileAllocations.Salarié,
  }
}

function sumByOwner(collection, owner) {
  return (collection || []).filter((item) => item.owner === owner).reduce((sum, item) => sum + normalizeNumber(item.amount), 0)
}

function sumByScope(collection, scope) {
  return (collection || []).filter((item) => item.scope === scope).reduce((sum, item) => sum + normalizeNumber(item.amount), 0)
}

function getSegmentInsight({ segment, experience, month, metrics, metricsByMonth, partnerName, prenom }) {
  const items = month.items || []
  const incomeSources = month.incomeSources || []
  const avgIncome = metricsByMonth.filter((item) => item.revenu > 0).reduce((sum, item) => sum + item.revenu, 0) / Math.max(metricsByMonth.filter((item) => item.revenu > 0).length, 1)
  if (segment === 'variable') {
    const positiveMonths = metricsByMonth.map((item) => item.revenu).filter((value) => value > 0)
    const minIncome = positiveMonths.length ? Math.min(...positiveMonths) : metrics.revenu
    const incomeSpread = Math.max(0, avgIncome - minIncome)
    return {
      eyebrow: 'Revenus variables',
      title: 'Ton mois prudent',
      intro: `On ne pilote pas sur le meilleur mois. On pilote sur un revenu prudent de ${fmt(minIncome || metrics.revenu)}.`,
      pills: [
        { label: 'Revenu moyen', value: fmt(avgIncome) },
        { label: 'Filet prudent', value: fmt(minIncome || metrics.revenu) },
        { label: 'Écart à lisser', value: fmt(incomeSpread) },
      ],
      bullets: [
        'Garde tes charges fixes au niveau du mois prudent, pas du meilleur mois.',
        `Si une mission saute, ton matelas à reconstruire est d’environ ${fmt(incomeSpread)}.`,
        experience === 'guided' ? 'Commence par séparer revenu certain et revenu variable dans tes entrées du mois.' : 'Lis surtout la dispersion des revenus sur 3 mois.',
      ],
    }
  }
  if (segment === 'couple') {
    const meIncome = sumByOwner(incomeSources, 'moi')
    const partnerIncome = sumByOwner(incomeSources, 'partenaire')
    const sharedSpend = sumByOwner(items, 'commun')
    return {
      eyebrow: 'Couple / foyer',
      title: 'Équilibre du foyer',
      intro: `${prenom || 'Toi'} et ${partnerName || 'ton partenaire'} pouvez suivre ce qui est personnel et ce qui est commun sans tout mélanger.`,
      pills: [
        { label: 'Moi', value: fmt(meIncome) },
        { label: partnerName || 'Partenaire', value: fmt(partnerIncome) },
        { label: 'Commun', value: fmt(sharedSpend) },
      ],
      bullets: [
        'Mets les charges communes en owner “Commun” pour obtenir une lecture de foyer propre.',
        'Les dépenses perso peuvent rester visibles sans polluer le budget du couple.',
        experience === 'guided' ? 'Commence par les revenus, le logement et les charges communes.' : 'Utilise owner pour séparer rapidement perso et commun.',
      ],
    }
  }
  if (segment === 'pro') {
    const proIncome = sumByScope(incomeSources, 'pro')
    const proSpend = sumByScope(items, 'pro')
    const persoSpend = sumByScope(items, 'perso') + sumByScope(items, 'foyer')
    return {
      eyebrow: 'Pro + perso',
      title: 'Frontière des flux',
      intro: 'La base saine ici, c’est de voir immédiatement ce qui relève de ton activité et ce qui relève de ta vie perso.',
      pills: [
        { label: 'Revenus pro', value: fmt(proIncome) },
        { label: 'Dépenses pro', value: fmt(proSpend) },
        { label: 'Dépenses perso', value: fmt(persoSpend) },
      ],
      bullets: [
        'Tague en scope “Pro” les notes de frais, achats outils, transports clients et abonnements métier.',
        'Garde le budget perso lisible même si ton activité bouge vite.',
        experience === 'guided' ? 'Le réflexe: une ligne = un scope clair.' : 'Lis surtout le delta pro/perso pour éviter les angles morts.',
      ],
    }
  }
  return {
    eyebrow: 'Pilotage du mois',
    title: experience === 'expert' ? 'Lecture synthétique' : 'Cap du mois',
    intro: `Le plus important est de voir vite ce qui reste, ce qui fuit et ce que tu dois corriger maintenant.`,
    pills: [
      { label: 'Reste', value: fmt(metrics.soldeAjuste) },
      { label: 'Invisibles', value: fmt(metrics.invisibles) },
      { label: 'Épargne', value: fmt(metrics.epargne) },
    ],
    bullets: [
      'Entre d’abord les postes réels, pas des estimations vagues.',
      experience === 'guided' ? 'Si tu hésites, commence par logement, transports et abonnements.' : 'Garde surtout un œil sur le reste du mois et le poids des fixes.',
      'Le score sert à comparer des mois construits, pas à juger un mois vide.',
    ],
  }
}

// ─── Custom Cursor (desktop only) ────────────────────────────────────────────
function CustomCursor() {
  const dotRef = useRef(null)
  const ringRef = useRef(null)
  const stateRef = useRef({ mx: -200, my: -200, rx: -200, ry: -200, hover: false, click: false })

  useEffect(() => {
    if ('ontouchstart' in window) return
    const dot = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return
    const s = stateRef.current
    let raf

    const onMove = (e) => { s.mx = e.clientX; s.my = e.clientY }
    const onDown = () => { s.click = true }
    const onUp = () => { s.click = false }
    const onOver = (e) => { s.hover = !!e.target.closest('button, a, input, textarea, label, [role="button"]') }

    const loop = () => {
      s.rx += (s.mx - s.rx) * 0.11
      s.ry += (s.my - s.ry) * 0.11
      dot.style.transform = `translate(${s.mx}px,${s.my}px) translate(-50%,-50%) scale(${s.click ? 0.4 : 1})`
      const rScale = s.hover ? 1.7 : s.click ? 0.6 : 1
      ring.style.transform = `translate(${s.rx}px,${s.ry}px) translate(-50%,-50%) scale(${rScale})`
      ring.style.borderColor = s.hover ? 'rgba(244,200,107,0.9)' : 'rgba(244,200,107,0.55)'
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    document.addEventListener('mouseover', onOver)
    document.body.style.cursor = 'none'
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      document.removeEventListener('mouseover', onOver)
      document.body.style.cursor = ''
    }
  }, [])

  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || window.matchMedia('(pointer:coarse)').matches)
  if (isTouch) return null
  return (
    <div className="cursor-layer" aria-hidden="true">
      <div ref={dotRef} className="cursor-dot" />
      <div ref={ringRef} className="cursor-ring" />
    </div>
  )
}

// ─── Particles with gyroscope ─────────────────────────────────────────────────
function ParticlesBackground({ gyroX = 0, gyroY = 0 }) {
  const isMobile = typeof window !== 'undefined' && ('ontouchstart' in window || window.matchMedia('(pointer:coarse)').matches)
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const count = prefersReduced ? 0 : isMobile ? 18 : 50
  return (
    <div
      className="particles-layer"
      aria-hidden="true"
      style={{ '--gx': `${gyroX * 60}px`, '--gy': `${gyroY * 60}px` }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className="particle" style={{ '--i': index }} />
      ))}
    </div>
  )
}

// ─── Particle burst (canvas overlay) ─────────────────────────────────────────
function useParticleBurst() {
  const canvasRef = useRef(null)
  const burst = useCallback((x, y) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const particles = Array.from({ length: 42 }, () => ({
      x, y,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 14 - 4,
      life: 1,
      r: Math.random() * 5 + 2,
      color: Math.random() > 0.5 ? '#f4c86b' : '#86ff9b',
    }))
    let raf
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.life -= 0.025
        if (p.life <= 0) return
        alive = true
        ctx.globalAlpha = p.life
        ctx.fillStyle = p.color
        ctx.shadowBlur = 12; ctx.shadowColor = p.color
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      })
      ctx.globalAlpha = 1; ctx.shadowBlur = 0
      if (alive) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return { canvasRef, burst }
}

// ─── Badge Toast ──────────────────────────────────────────────────────────────
function BadgeToast({ badge, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div className={`badge-toast badge-toast--${badge.tier}`} role="alert">
      <span className="badge-toast__icon">{badge.icon}</span>
      <div className="badge-toast__body">
        <p className="badge-toast__label">Badge débloqué !</p>
        <strong className="badge-toast__name">{badge.name}</strong>
        <p className="badge-toast__desc">{badge.desc}</p>
      </div>
      <button className="badge-toast__close" onClick={onDismiss} aria-label="Fermer">✕</button>
    </div>
  )
}

// ─── Badge Shelf ──────────────────────────────────────────────────────────────
function BadgeShelf({ unlockedIds }) {
  return (
    <div className="badge-shelf">
      {BADGE_DEFS.map((b) => {
        const unlocked = unlockedIds.includes(b.id)
        return (
          <div key={b.id} className={`badge-item badge-item--${b.tier} ${unlocked ? 'is-unlocked' : 'is-locked'}`} title={b.desc}>
            <span className="badge-item__icon">{b.icon}</span>
            <span className="badge-item__name">{b.name}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Épargne Slider Premium ───────────────────────────────────────────────────
function EpargneSlider({ revenu, value, onChange }) {
  const ratio = revenu > 0 ? value / revenu : 0
  const max = Math.max(revenu * 0.45, 1000)
  const isElite = ratio >= 0.2
  const markers = [
    { r: 0.05, label: '5%' },
    { r: 0.1, label: '10%' },
    { r: 0.15, label: '15%' },
    { r: 0.2, label: '20%' },
  ]
  return (
    <div className={`epargne-slider ${isElite ? 'epargne-slider--elite' : ''}`}>
      <div className="epargne-slider__header">
        <span className="epargne-slider__label">Épargne</span>
        <strong className={`epargne-slider__value ${isElite ? 'epargne-slider__value--elite' : ''}`}>
          {fmt(value)}
          <span className="epargne-slider__pct"> — {Math.round(ratio * 100)}%</span>
        </strong>
      </div>
      <div className="epargne-slider__track-wrap">
        <div className="epargne-slider__track">
          <div className="epargne-slider__fill" style={{ width: `${Math.min(ratio / 0.45, 1) * 100}%` }} />
          {markers.map((m) => (
            <div
              key={m.r}
              className={`epargne-slider__marker ${ratio >= m.r ? 'is-hit' : ''}`}
              style={{ left: `${(m.r / 0.45) * 100}%` }}
            >
              <span className="epargne-slider__marker-label">{m.label}</span>
            </div>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={max}
          step={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="epargne-slider__input"
        />
      </div>
      {isElite && (
        <p className="epargne-slider__elite-msg">🏆 Zone d'accumulation de richesse</p>
      )}
    </div>
  )
}

// ─── NumberFlow ───────────────────────────────────────────────────────────────
function NumberFlow({ value, currency = false }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const target = Math.round(Math.abs(value))
    let frame = 0
    const totalFrames = 40
    const tick = () => {
      frame++
      const eased = 1 - Math.pow(1 - frame / totalFrames, 4)
      setDisplay(Math.round(target * eased))
      if (frame < totalFrames) requestAnimationFrame(tick)
    }
    const id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [value])
  const signed = value < 0 ? -display : display
  return currency ? fmt(signed) : `${signed}`
}

// ─── Delta ────────────────────────────────────────────────────────────────────
function Delta({ current, prev, currency = false, inverse = false }) {
  if (prev === undefined || prev === null) return null
  const diff = current - prev
  if (Math.abs(diff) < 1) return <span className="delta delta--neutral">—</span>
  const positive = inverse ? diff < 0 : diff > 0
  const formatted = currency ? fmt(Math.abs(diff)) : String(Math.abs(Math.round(diff)))
  return (
    <span className={`delta delta--${positive ? 'up' : 'down'}`}>
      {diff > 0 ? '+' : '−'}{formatted}
    </span>
  )
}

// ─── WealthRing ───────────────────────────────────────────────────────────────
function WealthRing({ metrics }) {
  const categories = [
    { label: 'Fixes', value: metrics.fixes, color: '#86a7ff' },
    { label: 'Variables', value: metrics.variables, color: '#7af7e3' },
    { label: 'Invisibles', value: metrics.invisibles, color: '#ff8f7a' },
    { label: 'Épargne', value: metrics.epargne, color: '#8fff92' },
    { label: 'Reste libre', value: metrics.reste, color: 'rgba(255,255,255,0.18)' },
  ]
  const total = categories.reduce((sum, item) => sum + item.value, 0) || 1
  const size = 320
  const radius = 122
  const circ = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="wealth-ring-shell">
      <div className="wealth-ring-wrapper">
        <svg viewBox={`0 0 ${size} ${size}`} className="wealth-ring" aria-label="Répartition du budget">
          <circle cx={size / 2} cy={size / 2} r={radius} className="wealth-ring__track" />
          {categories.map((item) => {
            const dash = circ * (item.value / total)
            const gap = circ - dash
            const dashOffset = -offset
            offset += dash
            return (
              <circle key={item.label} cx={size / 2} cy={size / 2} r={radius}
                className="wealth-ring__arc"
                style={{ '--arc': item.color, strokeDasharray: `${dash} ${gap}`, strokeDashoffset: dashOffset }}
              />
            )
          })}
        </svg>
        <div className="wealth-ring-center">
          <span className="wealth-ring-center__label">Revenu</span>
          <strong className="wealth-ring-center__value">{fmt(metrics.revenu)}</strong>
        </div>
      </div>
      <div className="wealth-ring-legend">
        {categories.map((item) => (
          <div key={item.label} className="wealth-ring-legend__item">
            <span className="wealth-ring-legend__dot" style={{ '--dot': item.color }} />
            <span>{item.label}</span>
            <strong>{fmt(item.value)}</strong>
            <span className="wealth-ring-legend__pct">{pct(item.value / (metrics.revenu || 1))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Waterfall ────────────────────────────────────────────────────────────────
function Waterfall({ metrics }) {
  const items = [
    { label: 'Revenu', value: metrics.revenu, color: 'gold' },
    { label: 'Fixes', value: metrics.fixes, color: 'blue' },
    { label: 'Variables', value: metrics.variables, color: 'cyan' },
    { label: 'Invisibles', value: metrics.invisibles, color: 'coral' },
    { label: 'Épargne', value: metrics.epargne, color: 'green' },
  ]
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="waterfall-scroll">
      <div className="waterfall">
        {items.map((item) => (
          <div key={item.label} className="waterfall__row">
            <div className="waterfall__meta">
              <span>{item.label}</span>
              <strong>{fmt(item.value)}</strong>
            </div>
            <div className="waterfall__track">
              <div className={`waterfall__bar waterfall__bar--${item.color}`} style={{ '--w': `${(item.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Coaching ─────────────────────────────────────────────────────────────────
function CoachingPanel({ metrics, prevMetrics }) {
  const messages = getCoachingMessages(metrics, prevMetrics)
  return (
    <div className="coaching-list">
      {messages.map((msg, i) => (
        <div key={i} className={`coaching-item coaching-item--${msg.type}`}>
          <span className="coaching-item__icon">{msg.icon}</span>
          <p>{msg.text}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <div className="field__control">
        <input type="number" inputMode="decimal" min="0" value={value || ''}
          onChange={(e) => onChange(Number(e.target.value) || 0)} />
        <span className="field__suffix">€</span>
      </div>
    </label>
  )
}

function ActionToast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(onDismiss, 2600)
    return () => window.clearTimeout(timeout)
  }, [toast, onDismiss])

  if (!toast) return null

  return (
    <div className={`action-toast action-toast--${toast.tone || 'ok'}`} role="status" aria-live="polite">
      <strong>{toast.title}</strong>
      {toast.text ? <span>{toast.text}</span> : null}
    </div>
  )
}

function StorageNotice({ notice, onRestart, onImport }) {
  if (!notice) return null
  return (
    <article className={`storage-notice storage-notice--${notice.tone || 'ok'}`} data-reveal>
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.text}</p>
      </div>
      <div className="storage-notice__actions">
        {onImport ? <button type="button" className="button button--ghost" onClick={onImport}>Importer un backup</button> : null}
        <button type="button" className="button button--primary" onClick={onRestart}>Recommencer</button>
      </div>
    </article>
  )
}

function IncomeSourcesEditor({ month, onAddSource, onDeleteSource, segment, partnerName, compact = false }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [owner, setOwner] = useState(getDefaultOwner(segment))
  const [scope, setScope] = useState(getDefaultScope(segment))
  const incomeSources = month.incomeSources || []
  const totalIncome = sumIncomeSources(month) || Number(month.revenu) || 0

  const submit = () => {
    const normalizedAmount = Number(amount)
    if (!name.trim() || !normalizedAmount) return
    onAddSource({ id: makeId(), name: name.trim(), amount: normalizedAmount, owner, scope })
    setName('')
    setAmount('')
  }

  useEffect(() => {
    setOwner(getDefaultOwner(segment))
    setScope(getDefaultScope(segment))
  }, [segment])

  return (
    <div className={`income-sources ${compact ? 'income-sources--compact' : ''}`}>
      <div className="income-sources__header">
        <div>
          <span className="income-sources__label">Revenus du mois</span>
          <strong className="income-sources__total">{fmt(totalIncome)}</strong>
        </div>
        <p className="income-sources__hint">Tu peux mettre salaire, CAF, missions freelance, remboursement client.</p>
      </div>
      {incomeSources.length ? (
        <div className="income-sources__list">
          {incomeSources.map((source) => (
            <div key={source.id} className="income-source-row">
              <span className="income-source-row__name">
                {source.name}
                {isCoupleSegment(segment) ? <span className="item-row__tag">{source.owner === 'moi' ? 'Moi' : source.owner === 'partenaire' ? (partnerName || 'Partenaire') : 'Commun'}</span> : null}
                {isProSegment(segment) ? <span className="item-row__tag">{source.scope === 'pro' ? 'Pro' : source.scope === 'foyer' ? 'Foyer' : 'Perso'}</span> : null}
              </span>
              <strong className="income-source-row__amount">{fmt(source.amount)}</strong>
              <button type="button" className="income-source-row__delete" onClick={() => onDeleteSource(source.id)} aria-label="Supprimer ce revenu">×</button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="income-sources__form">
        <input
          type="text"
          className="add-item-form__name"
          placeholder="Ex: Salaire, Mission client, CAF"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('income-amount')?.focus() }}
        />
        <div className="add-item-form__amount-wrap">
          <input
            id="income-amount"
            type="number"
            inputMode="decimal"
            min="0"
            className="add-item-form__amount"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          />
          <span className="add-item-form__suffix">€</span>
        </div>
        <button type="button" className="add-item-form__btn" onClick={submit} disabled={!name.trim() || !Number(amount)}>
          +
        </button>
      </div>
      {(isCoupleSegment(segment) || isProSegment(segment)) ? (
        <div className="meta-select-row">
          {isCoupleSegment(segment) ? (
            <label className="meta-select">
              <span>Qui reçoit ?</span>
              <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                {OWNER_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.id === 'partenaire' ? (partnerName || 'Partenaire') : option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {isProSegment(segment) ? (
            <label className="meta-select">
              <span>Scope</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                {SCOPE_OPTIONS.filter((option) => option.id !== 'foyer').map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {!incomeSources.length ? (
        <p className="income-sources__fallback">Si tu préfères, tu peux garder un seul montant total juste en dessous.</p>
      ) : null}
    </div>
  )
}

function SmartBudgetInput({ month, setMonth, onAddItem, onNotify }) {
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState(null)
  const preview = useMemo(() => parseBudgetInput(note), [note])

  const applyNote = () => {
    const { matched } = preview
    if (!matched.length) {
      setFeedback({
        tone: 'error',
        text: "Je n'ai rien reconnu. Essaie par exemple : salaire 2400, loyer 850, edf 45, netflix 17.",
      })
      return
    }

    let revenuAdded = 0
    let decouvertAdded = 0
    let addedItems = 0

    matched.forEach((match, index) => {
      if (match.key === 'revenu') {
        revenuAdded += match.amount
        return
      }
      if (match.key === 'decouvert') {
        decouvertAdded += match.amount
        return
      }
      onAddItem({
        id: makeId(),
        name: parsedItemLabel(match.raw, match.key),
        amount: match.amount,
        cat: match.key,
      }, { silent: true })
      addedItems += 1
    })

    if (revenuAdded > 0) {
      setMonth('revenu', (Number(month.revenu) || 0) + revenuAdded)
    }
    if (decouvertAdded > 0) {
      setMonth('decouvert', (Number(month.decouvert) || 0) + decouvertAdded)
    }

    const feedbackParts = []
    if (revenuAdded > 0) feedbackParts.push(`revenu +${fmt(revenuAdded)}`)
    if (decouvertAdded > 0) feedbackParts.push(`découvert +${fmt(decouvertAdded)}`)
    if (addedItems > 0) feedbackParts.push(`${addedItems} poste${addedItems > 1 ? 's' : ''} ajouté${addedItems > 1 ? 's' : ''}`)

    setFeedback({
      tone: 'ok',
      text: `C'est pris en compte : ${feedbackParts.join(', ')}.`,
    })
    onNotify?.({
      title: 'Note appliquée',
      text: `${addedItems} ligne${addedItems > 1 ? 's' : ''} ajoutée${addedItems > 1 ? 's' : ''}${revenuAdded ? ` · revenu ${fmt(revenuAdded)}` : ''}`,
      tone: 'ok',
    })
    setNote('')
  }

  return (
    <div className="smart-input">
      <label className="field">
        <span className="field__label">Note rapide</span>
        <div className="field__control field__control--textarea">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: salaire 2400, mission client 650, loyer 850, salle 35, halal food 18, remboursement ami 40"
          />
        </div>
      </label>
      <p className="smart-input__hint">Tu peux écrire librement: tabac, jeux, halal food, remboursement ami, salle de sport.</p>
      {preview.matched.length ? (
        <div className="smart-input__preview">
          {preview.matched.map((match, index) => (
            <span key={`${match.raw}-${index}`} className={`smart-input__chip smart-input__chip--${match.key}`}>
              {parsedItemLabel(match.raw, match.key)} · {fmt(match.amount)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="smart-input__actions">
        <button type="button" className="button button--ghost" onClick={applyNote} disabled={!note.trim()}>
          {preview.matched.length ? 'Appliquer ma note' : 'Analyser ma note'}
        </button>
        {feedback ? (
          <p className={`smart-input__feedback smart-input__feedback--${feedback.tone}`}>
            {feedback.text}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ─── Item entry system ────────────────────────────────────────────────────────
const CAT_LABELS = { fixes: 'Charges fixes', variables: 'Variables', invisibles: 'Invisibles', epargne: 'Épargne' }
const CAT_COLORS = { fixes: '#86a7ff', variables: '#7af7e3', invisibles: '#ff8f7a', epargne: '#8fff92' }

const ITEM_SUGGESTIONS = {
  fixes: [
    { name: 'Loyer', amount: 0 }, { name: 'Crédit immo', amount: 0 }, { name: 'EDF / Électricité', amount: 0 },
    { name: 'Internet / Box', amount: 0 }, { name: 'Téléphone', amount: 0 }, { name: 'Assurance', amount: 0 },
    { name: 'Mutuelle', amount: 0 }, { name: 'Salle de sport', amount: 35 },
  ],
  variables: [
    { name: 'Courses alimentaires', amount: 0 }, { name: 'Navigo mensuel', amount: 86 },
    { name: 'Essence', amount: 0 }, { name: 'Restaurant / Sorties', amount: 0 },
    { name: 'Pharmacie', amount: 0 }, { name: 'Shopping vêtements', amount: 0 },
  ],
  invisibles: [
    { name: 'Netflix', amount: 17 }, { name: 'Spotify', amount: 11 }, { name: 'Amazon Prime', amount: 7 },
    { name: 'Disney+', amount: 9 }, { name: 'YouTube Premium', amount: 8 }, { name: 'Uber / Deliveroo', amount: 0 },
  ],
  epargne: [
    { name: 'Livret A', amount: 0 }, { name: 'PEA', amount: 0 }, { name: 'Assurance vie', amount: 0 },
    { name: 'Épargne sécurité', amount: 0 },
  ],
}

function AddItemForm({ cat, onAdd, suggestions = [], segment, partnerName }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [tag, setTag] = useState('')
  const [activeSuggestion, setActiveSuggestion] = useState(null)
  const [owner, setOwner] = useState(getDefaultOwner(segment))
  const [scope, setScope] = useState(getDefaultScope(segment))

  const submit = (n, a, nextTag = tag) => {
    const amt = Number(a)
    if (!n.trim() || !amt) return
    onAdd({ id: makeId(), name: n.trim(), amount: amt, cat, tag: nextTag.trim(), owner, scope, createdAt: new Date().toISOString() })
    setName(''); setAmount(''); setTag(''); setActiveSuggestion(null)
  }

  const pickSuggestion = (s) => {
    if (s.amount > 0) {
      submit(s.name, s.amount)
    } else {
      setName(s.name); setActiveSuggestion(s.name)
      setTimeout(() => document.getElementById(`amount-${cat}`)?.focus(), 50)
    }
  }

  useEffect(() => {
    setOwner(getDefaultOwner(segment))
    setScope(getDefaultScope(segment))
  }, [segment])

  return (
    <div className="add-item-form">
      <div className="add-item-form__suggestions">
        {suggestions.map((s) => (
          <button key={s.name} type="button"
            className={`item-chip ${activeSuggestion === s.name ? 'item-chip--active' : ''}`}
            onClick={() => pickSuggestion(s)}>
            {s.name}{s.amount > 0 ? ` · ${fmt(s.amount)}` : ''}
          </button>
        ))}
      </div>
      <div className="add-item-form__row">
        <input type="text" className="add-item-form__name" placeholder="Nom libre: tabac, halal food, ami..."
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById(`amount-${cat}`)?.focus() }} />
        <div className="add-item-form__amount-wrap">
          <input id={`amount-${cat}`} type="number" inputMode="decimal" min="0"
            className="add-item-form__amount" placeholder="0"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(name, amount) }} />
          <span className="add-item-form__suffix">€</span>
        </div>
        <button type="button" className="add-item-form__btn"
          onClick={() => submit(name, amount)} disabled={!name.trim() || !Number(amount)}>
          +
        </button>
      </div>
      <input
        type="text"
        className="add-item-form__tag"
        placeholder="Catégorie perso facultative: tabac, ami, salle, halal..."
        value={tag}
        onChange={(e) => setTag(e.target.value)}
      />
      {(isCoupleSegment(segment) || isProSegment(segment)) ? (
        <div className="meta-select-row">
          {isCoupleSegment(segment) ? (
            <label className="meta-select">
              <span>Qui paie ?</span>
              <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                {OWNER_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.id === 'partenaire' ? (partnerName || 'Partenaire') : option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {(isCoupleSegment(segment) || isProSegment(segment)) ? (
            <label className="meta-select">
              <span>Scope</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                {SCOPE_OPTIONS.filter((option) => !isProSegment(segment) || option.id !== 'foyer').map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      <p className="add-item-form__hint">Tu n'es pas limité aux suggestions. Écris le nom réel de ta dépense.</p>
    </div>
  )
}

function ItemList({ items, cat, onDelete, onToggleRecurring, onEdit, segment, partnerName }) {
  const catItems = items.filter((i) => i.cat === cat)
  if (catItems.length === 0) return null
  const total = catItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  return (
    <div className="item-list">
      {catItems.map((item) => (
        <div key={item.id} className="item-row">
          <button
            type="button"
            className={"item-row__recurring " + (item.recurring ? "is-on" : "")}
            title={item.recurring ? "Récurrent (désactiver)" : "Marquer comme récurrent"}
            onClick={() => onToggleRecurring && onToggleRecurring(item.id)}
            aria-label="Récurrent"
          >↻</button>
          <span className="item-row__name">
            {item.name}
            {item.tag ? <span className="item-row__tag">{item.tag}</span> : null}
            {isCoupleSegment(segment) ? <span className="item-row__tag">{item.owner === 'moi' ? 'Moi' : item.owner === 'partenaire' ? (partnerName || 'Partenaire') : 'Commun'}</span> : null}
            {(isCoupleSegment(segment) || isProSegment(segment)) ? <span className="item-row__tag">{item.scope === 'pro' ? 'Pro' : item.scope === 'foyer' ? 'Foyer' : 'Perso'}</span> : null}
            {item.recurring ? <span className="recurring-badge"> ↻</span> : null}
          </span>
          <strong className="item-row__amount">{fmt(item.amount)}</strong>
          <button type="button" className="item-row__edit" onClick={() => onEdit(item)} aria-label="Modifier">✎</button>
          <button type="button" className="item-row__delete" onClick={() => onDelete(item.id)} aria-label="Supprimer">×</button>
        </div>
      ))}
      <div className="item-list__total">
        <span>Total {CAT_LABELS[cat]}</span>
        <strong>{fmt(total)}</strong>
      </div>
    </div>
  )
}

// ─── MonthEditor ──────────────────────────────────────────────────────────────
function MonthEditor({ month, setMonth, onAddItem, onDeleteItem, onToggleRecurring, onEditItem, onAddIncomeSource, onDeleteIncomeSource, metrics, onValidate, onNotify, segment, partnerName, experience }) {
  const [openCat, setOpenCat] = useState(null)
  const items = month.items || []

  return (
    <article className="panel panel--editor">
      <div className="panel__header">
        <span className="panel__eyebrow">Mes dépenses</span>
        <h3>{experience === 'expert' ? 'Édition du mois' : 'Score live'} <span className={`panel__score panel__score--${scoreTone(metrics.score)}`}>{metrics.score}</span></h3>
      </div>

      <div className="field-grid">
        <Field label="Revenu total" value={month.revenu} onChange={(v) => setMonth('revenu', v)} />
        <Field label="Découvert autorisé" value={month.decouvert} onChange={(v) => setMonth('decouvert', v)} />
      </div>

      <IncomeSourcesEditor month={month} onAddSource={onAddIncomeSource} onDeleteSource={onDeleteIncomeSource} segment={segment} partnerName={partnerName} compact />

      <SmartBudgetInput month={month} setMonth={setMonth} onAddItem={onAddItem} onNotify={onNotify} />

      <div className="editor-categories">
        {['fixes', 'variables', 'invisibles', 'epargne'].map((cat) => (
          <div key={cat} className={`editor-cat ${openCat === cat ? 'editor-cat--open' : ''}`}>
            <button type="button" className="editor-cat__header"
              onClick={() => setOpenCat(openCat === cat ? null : cat)}>
              <span className="editor-cat__dot" style={{ background: CAT_COLORS[cat] }} />
              <span className="editor-cat__label">{CAT_LABELS[cat]}</span>
              <strong className="editor-cat__total">{fmt(sumCat(items, cat))}</strong>
              <span className="editor-cat__toggle">{openCat === cat ? '▲' : '▼'}</span>
            </button>
            {openCat === cat && (
              <div className="editor-cat__body">
                <ItemList items={items} cat={cat} onDelete={onDeleteItem} onToggleRecurring={onToggleRecurring} onEdit={onEditItem} segment={segment} partnerName={partnerName} />
                <AddItemForm cat={cat} suggestions={ITEM_SUGGESTIONS[cat] || []} segment={segment} partnerName={partnerName} onAdd={(item) => { onAddItem(item); if (cat === 'epargne' && item.amount / ((sumIncomeSources(month) || month.revenu) || 1) >= 0.2) onValidate?.() }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </article>
  )
}

function QuickActionsBar({ onCopyPrev, onApplyDelta, canCopyPrev }) {
  return (
    <div className="quick-actions">
      <button type="button" className="quick-action" onClick={() => onApplyDelta('variables', -50)}>
        Variables -50
      </button>
      <button type="button" className="quick-action" onClick={() => onApplyDelta('invisibles', -30)}>
        Invisibles -30
      </button>
      <button type="button" className="quick-action" onClick={() => onApplyDelta('epargne', 50)}>
        Épargne +50
      </button>
      <button type="button" className="quick-action" onClick={() => onApplyDelta('revenu', 100)}>
        Revenu +100
      </button>
      <button type="button" className="quick-action quick-action--copy" disabled={!canCopyPrev} onClick={onCopyPrev}>
        Copier mois précédent
      </button>
    </div>
  )
}

function MonthPilotPanel({ metrics, month }) {
  const itemCount = (month.items || []).length
  const recurringCount = (month.items || []).filter((item) => item.recurring).length
  const riskLabel =
    metrics.depassement > 0
      ? 'Sous tension'
      : metrics.decouvertUtilise > 0
        ? 'Sous découvert'
        : metrics.soldeAjuste >= 300
          ? 'Confortable'
          : 'À surveiller'

  return (
    <section className="pilot-strip" data-reveal>
      <article className="panel panel--pilot">
        <div className="panel__header">
          <span className="panel__eyebrow">Lecture rapide</span>
          <h3>Ton mois, en un regard</h3>
        </div>
        <div className="pilot-grid">
          <div className="pilot-card">
            <span>Disponible</span>
            <strong>{fmt(metrics.budgetDisponible)}</strong>
            <p>Revenu + découvert autorisé</p>
          </div>
          <div className="pilot-card">
            <span>Déjà engagé</span>
            <strong>{fmt(metrics.totalDepenses)}</strong>
            <p>{itemCount} poste{itemCount > 1 ? 's' : ''} enregistré{itemCount > 1 ? 's' : ''}</p>
          </div>
          <div className="pilot-card">
            <span>Reste du mois</span>
            <strong>{fmt(metrics.soldeAjuste)}</strong>
            <p>{metrics.soldeAjuste >= 0 ? 'Tu gardes de la marge.' : 'Le mois demande un réajustement.'}</p>
          </div>
          <div className="pilot-card">
            <span>Attention</span>
            <strong>{riskLabel}</strong>
            <p>{recurringCount} dépense{recurringCount > 1 ? 's' : ''} récurrente{recurringCount > 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="pilot-breakdown">
          {[
            ['Fixes', metrics.fixes],
            ['Variables', metrics.variables],
            ['Invisibles', metrics.invisibles],
            ['Épargne', metrics.epargne],
          ].map(([label, value]) => (
            <div key={label} className="pilot-breakdown__row">
              <span>{label}</span>
              <strong>{fmt(value)}</strong>
              <span>{pct((value || 0) / (metrics.revenu || 1))}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

function SegmentInsightPanel({ segment, experience, month, metrics, metricsByMonth, prenom, partnerName }) {
  const insight = getSegmentInsight({ segment, experience, month, metrics, metricsByMonth, partnerName, prenom })
  return (
    <section className="pilot-strip" data-reveal>
      <article className="panel panel--segment">
        <div className="panel__header">
          <span className="panel__eyebrow">{insight.eyebrow}</span>
          <h3>{insight.title}</h3>
        </div>
        <p className="segment-panel__intro">{insight.intro}</p>
        <div className="segment-panel__pills">
          {insight.pills.map((pill) => (
            <div key={pill.label} className="segment-panel__pill">
              <span>{pill.label}</span>
              <strong>{pill.value}</strong>
            </div>
          ))}
        </div>
        <div className="advisor-list">
          {insight.bullets.map((item) => (
            <p key={item} className="advisor-item">{item}</p>
          ))}
        </div>
      </article>
    </section>
  )
}

function ActionPlan({ metrics }) {
  const actions = getActionPlan(metrics)
  return (
    <article className="panel panel--action">
      <div className="panel__header">
        <span className="panel__eyebrow">À faire maintenant</span>
        <h3>3 priorités, pas plus</h3>
      </div>
      <div className="action-list">
        {actions.map((action) => (
          <div key={action.title} className={`action-card action-card--${action.tone}`}>
            <span className="action-card__title">{action.title}</span>
            <strong className="action-card__value">{action.value}</strong>
            <p className="action-card__detail">{action.detail}</p>
          </div>
        ))}
      </div>
    </article>
  )
}

function WarmWelcome({ metrics, prenom }) {
  return (
    <article className="warm-welcome" data-reveal>
      <div className="warm-welcome__bubble">
        <span className="warm-welcome__label">Point du jour</span>
        <p className="warm-welcome__text">{getCalmMessage(metrics, prenom)}</p>
        <div className="warm-welcome__footer">
          {metrics.totalDepenses === 0 ? (
            <>
              <span>Point de départ</span>
              <strong>{fmt(metrics.revenu)}</strong>
              <span>de revenu posé pour ce mois</span>
            </>
          ) : (
            <>
              <span>Il te reste</span>
              <strong>{fmt(metrics.soldeAjuste)}</strong>
              <span>pour ce mois</span>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function DailyCapturePanel({ month, onCopyPrev, onApplyDelta, canCopyPrev }) {
  const lastItems = [...(month.items || [])].slice(-5).reverse()
  const recurringCount = (month.items || []).filter((item) => item.recurring).length

  return (
    <section className="control-room control-room--quick" data-reveal>
      <div className="daily-capture">
        <article className="panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Au quotidien</span>
            <h3>Aller vite, sans friction</h3>
          </div>
          <p className="daily-capture__lead">
            Utilise la note rapide, les raccourcis et les récurrents pour garder ton budget vivant sans friction.
          </p>
          <QuickActionsBar
            onCopyPrev={onCopyPrev}
            onApplyDelta={onApplyDelta}
            canCopyPrev={canCopyPrev}
          />
        </article>
        <article className="panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Repères</span>
            <h3>Derniers mouvements</h3>
          </div>
          <div className="daily-capture__meta">
            <span>{(month.items || []).length} entrée{(month.items || []).length > 1 ? 's' : ''} ce mois</span>
            <strong>{recurringCount} récurrente{recurringCount > 1 ? 's' : ''}</strong>
          </div>
          <div className="daily-capture__list">
            {lastItems.length ? lastItems.map((item) => (
              <div key={item.id} className="daily-capture__item">
                <span>{item.name}</span>
                <strong>{fmt(item.amount)}</strong>
              </div>
            )) : (
              <p className="daily-capture__empty">Aucune dépense récente pour l’instant.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  )
}

function BankAdvisorPanel({ metrics, prevMetrics }) {
  const advisor = getBankAdvisorSummary(metrics, prevMetrics)

  return (
    <article className="panel panel--advisor">
      <div className="panel__header">
        <span className="panel__eyebrow">Conseil du mois</span>
        <h3>{advisor.posture}</h3>
      </div>
      <p className="advisor-intro">{advisor.intro}</p>
      <div className="advisor-kpis">
        <div className="advisor-kpi">
          <span>Encore possible</span>
          <strong>{fmt(advisor.safeToSpend)}</strong>
        </div>
        <div className="advisor-kpi">
          <span>À couper si besoin</span>
          <strong>{fmt(advisor.hiddenLeak)}</strong>
        </div>
      </div>
      <div className="advisor-list">
        {advisor.bullets.map((item) => (
          <p key={item} className="advisor-item">{item}</p>
        ))}
      </div>
    </article>
  )
}

function SetupIntro({ monthLabel, prenom, segment }) {
  const stepTwo =
    segment === 'couple'
      ? 'Ajoute les revenus du foyer, le logement et les charges communes.'
      : segment === 'pro'
        ? 'Ajoute tes charges perso, puis sépare ce qui est pro.'
        : segment === 'variable'
          ? 'Ajoute d’abord le revenu prudent du mois, puis les charges qui tombent quoi qu’il arrive.'
          : "Ajoute ton loyer, ton électricité, tes assurances, tes abonnements."
  return (
    <article className="panel panel--setup" data-reveal>
      <div className="panel__header">
        <span className="panel__eyebrow">Configuration</span>
        <h3>{prenom ? `${prenom}, on commence simplement.` : 'On commence simplement.'}</h3>
      </div>
      <div className="setup-list">
        <p className="setup-item">1. Entre ton revenu du mois.</p>
        <p className="setup-item">2. {stepTwo}</p>
        <p className="setup-item">3. Ensuite seulement l'app te montrera ton vrai budget et tes analyses.</p>
      </div>
      <div className="setup-footnote">
        <span>{monthLabel}</span>
        <strong>Aucune estimation tant que tu n'as pas saisi ta base.</strong>
      </div>
    </article>
  )
}

const SETUP_STEPS = [
  {
    id: 'revenu',
    title: 'Ton revenu du mois',
    text: 'Commence par ton salaire ou revenu mensuel principal.',
    cat: null,
  },
  {
    id: 'logement',
    title: 'Ton logement',
    text: 'Loyer, crédit immobilier. Ajoute-les un par un.',
    cat: 'fixes',
    suggestions: [{ name: 'Loyer', amount: 0 }, { name: 'Crédit immo', amount: 0 }],
  },
  {
    id: 'factures',
    title: 'Tes charges fixes',
    text: 'EDF, internet, téléphone, assurance, salle de sport, mutuelle.',
    cat: 'fixes',
    suggestions: [
      { name: 'EDF / Électricité', amount: 0 }, { name: 'Internet / Box', amount: 0 },
      { name: 'Téléphone', amount: 0 }, { name: 'Assurance habitation', amount: 0 },
      { name: 'Mutuelle', amount: 0 }, { name: 'Salle de sport', amount: 35 },
    ],
  },
  {
    id: 'transport',
    title: 'Tes transports',
    text: 'Navigo, essence, tickets de métro, péages.',
    cat: 'variables',
    suggestions: [
      { name: 'Navigo mensuel', amount: 86 }, { name: 'Essence', amount: 0 },
      { name: 'Ticket de métro', amount: 2 },
    ],
  },
  {
    id: 'courses',
    title: 'Courses & sorties',
    text: 'Supermarché, restaurant, shopping, pharmacie.',
    cat: 'variables',
    suggestions: [
      { name: 'Courses alimentaires', amount: 0 }, { name: 'Restaurant / Sorties', amount: 0 },
      { name: 'Shopping', amount: 0 }, { name: 'Pharmacie', amount: 0 },
    ],
  },
  {
    id: 'abonnements',
    title: 'Tes abonnements',
    text: 'Netflix, Spotify, Amazon, petites dépenses qui coulent en silence.',
    cat: 'invisibles',
    suggestions: [
      { name: 'Netflix', amount: 17 }, { name: 'Spotify', amount: 11 },
      { name: 'Amazon Prime', amount: 7 }, { name: 'Disney+', amount: 9 },
      { name: 'YouTube Premium', amount: 8 },
    ],
  },
  {
    id: 'epargne',
    title: 'Ton épargne',
    text: 'Même 50€ par mois, ça change la trajectoire.',
    cat: 'epargne',
    suggestions: [
      { name: 'Livret A', amount: 0 }, { name: 'PEA', amount: 0 },
      { name: 'Assurance vie', amount: 0 },
    ],
  },
]

function getSuggestedStep(month) {
  if ((sumIncomeSources(month) || Number(month.revenu)) <= 0) return 0
  if (!hasNamedItem(month, 'fixes', /loyer|credit|crédit|immo|logement/)) return 1
  if (!hasNamedItem(month, 'fixes', /edf|electricite|électricité|internet|box|telephone|téléphone|assurance|mutuelle|salle/)) return 2
  if (!hasNamedItem(month, 'variables', /navigo|essence|metro|métro|transport|ticket/)) return 3
  if (!hasNamedItem(month, 'variables', /course|restaurant|sortie|shopping|pharmacie/)) return 4
  if (sumCat(month.items, 'invisibles') <= 0) return 5
  if (sumCat(month.items, 'epargne') <= 0) return 6
  return 6
}

function BudgetSetupWizard({
  month,
  setMonth,
  onAddItem,
  onDeleteItem,
  onToggleRecurring,
  onEditItem,
  onAddIncomeSource,
  onDeleteIncomeSource,
  monthLabel,
  prenom,
  onFinish,
  onNotify,
  segment,
  partnerName,
  experience,
}) {
  const [step, setStep] = useState(() => getSuggestedStep(month))
  const current = SETUP_STEPS[step]
  const items = month.items || []

  const next = () => {
    if (step === SETUP_STEPS.length - 1) { onFinish?.(); return }
    setStep((s) => Math.min(s + 1, SETUP_STEPS.length - 1))
  }
  const prev = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <article className="panel panel--setup-wizard" data-reveal>
      <div className="panel__header">
        <span className="panel__eyebrow">Setup guidé — {monthLabel}</span>
        <h3>{prenom ? `${prenom}, on construit ton budget.` : 'On construit ton budget.'}</h3>
      </div>

      <div className="setup-steps">
        {SETUP_STEPS.map((item, index) => {
          let done = false
          if (index === 0) done = (sumIncomeSources(month) || Number(month.revenu)) > 0
          if (item.id === 'logement') done = hasNamedItem(month, 'fixes', /loyer|credit|crédit|immo|logement/)
          if (item.id === 'factures') done = hasNamedItem(month, 'fixes', /edf|electricite|électricité|internet|box|telephone|téléphone|assurance|mutuelle|salle/)
          if (item.id === 'transport') done = hasNamedItem(month, 'variables', /navigo|essence|metro|métro|transport|ticket/)
          if (item.id === 'courses') done = hasNamedItem(month, 'variables', /course|restaurant|sortie|shopping|pharmacie/)
          if (item.id === 'abonnements') done = sumCat(items, 'invisibles') > 0
          if (item.id === 'epargne') done = sumCat(items, 'epargne') > 0
          return (
            <button key={item.id} type="button"
              className={`setup-step ${index === step ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
              onClick={() => setStep(index)}>
              <span>{done ? '✓' : String(index + 1).padStart(2, '0')}</span>
              <strong>{item.title}</strong>
            </button>
          )
        })}
      </div>

      <div className="setup-wizard-card">
        <span className="setup-wizard-card__eyebrow">Étape {step + 1} / {SETUP_STEPS.length}</span>
        <h4>{current.title}</h4>
        <p>{current.text} {segment === 'couple' && current.id === 'revenu' ? 'Tu peux séparer toi, ton partenaire et le commun.' : ''}</p>

        <SmartBudgetInput month={month} setMonth={setMonth} onAddItem={onAddItem} onNotify={onNotify} />

        {current.id === 'revenu' ? (
          <div className="setup-wizard-fields">
            <IncomeSourcesEditor month={month} onAddSource={onAddIncomeSource} onDeleteSource={onDeleteIncomeSource} segment={segment} partnerName={partnerName} />
            <Field label="Revenu total du mois" value={month.revenu} onChange={(v) => setMonth('revenu', v)} />
            <Field label="Découvert autorisé (si applicable)" value={month.decouvert} onChange={(v) => setMonth('decouvert', v)} />
          </div>
        ) : (
          <div className="setup-wizard-items">
            <ItemList items={items} cat={current.cat} onDelete={onDeleteItem} onToggleRecurring={onToggleRecurring} onEdit={onEditItem} segment={segment} partnerName={partnerName} />
            <AddItemForm cat={current.cat} suggestions={current.suggestions || []} onAdd={onAddItem} segment={segment} partnerName={partnerName} />
          </div>
        )}

        <div className="setup-wizard-actions">
          <button type="button" className="button button--ghost" onClick={prev} disabled={step === 0}>
            Retour
          </button>
          <button type="button" className="button button--primary" onClick={next}>
            {step === SETUP_STEPS.length - 1 ? 'Voir mon budget ↗' : experience === 'expert' ? 'Suivant' : 'Continuer →'}
          </button>
        </div>
      </div>
    </article>
  )
}

function MonthCompareStrip({ months, metricsByMonth, activeMonth, setActiveMonth }) {
  return (
    <div className="month-compare-strip" data-reveal>
      {metricsByMonth.map((item, index) => {
        const ready = hasMonthBasics(months[index])
        return (
        <button
          key={MONTHS[index]}
          type="button"
          className={index === activeMonth ? 'month-compare-card is-active' : 'month-compare-card'}
          onClick={() => setActiveMonth(index)}
        >
          <span className="month-compare-card__label">{MONTHS[index]}</span>
          <strong className={`month-compare-card__score ${ready ? `score-color--${scoreTone(item.score)}` : ''}`}>{ready ? item.score : '—'}</strong>
          <span className="month-compare-card__meta">{ready ? `Épargne ${fmt(item.epargne)}` : 'Base à compléter'}</span>
          <span className="month-compare-card__meta">{ready ? `Invisibles ${fmt(item.invisibles)}` : 'Ajoute les charges'}</span>
        </button>
        )
      })}
    </div>
  )
}

function MonthNavigator({ activeMonth, setActiveMonth }) {
  return (
    <div className="month-switcher" data-reveal>
      <button
        type="button"
        className="month-switcher__button"
        onClick={() => setActiveMonth(clamp(activeMonth - 1, 0, 2))}
        disabled={activeMonth === 0}
      >
        ←
        <span>Précédent</span>
      </button>
      <div className="month-switcher__current">
        <strong>{MONTHS[activeMonth]}</strong>
        <span>Swipe ou utilise les flèches</span>
      </div>
      <button
        type="button"
        className="month-switcher__button"
        onClick={() => setActiveMonth(clamp(activeMonth + 1, 0, 2))}
        disabled={activeMonth === 2}
      >
        <span>Suivant</span>
        →
      </button>
    </div>
  )
}

function ViewGuide({ view }) {
  const guides = {
    dashboard: {
      title: 'Commence ici',
      text: "Lis d'abord ton reste du mois, puis ajoute ou corrige tes dépenses.",
    },
    bilan: {
      title: 'Lire le bilan',
      text: 'Compare les 3 mois pour voir si ton score, ton épargne et tes invisibles progressent vraiment.',
    },
    vision: {
      title: 'Comprendre la vision',
      text: "Ici on parle d'épargne de sécurité et de trajectoire long terme, pas de trading.",
    },
    badges: {
      title: 'Pourquoi les badges',
      text: 'Ils servent juste à rendre les bons réflexes visibles. Le vrai objectif reste ton budget.',
    },
  }
  const guide = guides[view]
  if (!guide) return null
  return (
    <article className="panel panel--guide" data-reveal>
      <div className="panel__header">
        <span className="panel__eyebrow">Repère</span>
        <h3>{guide.title}</h3>
      </div>
      <p className="guide-text">{guide.text}</p>
    </article>
  )
}

function ModeSwitcher({ state, setState }) {
  return (
    <section className="control-room control-room--modes" data-reveal>
      <div className="mode-switcher">
        <article className="panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Mode budget</span>
            <h3>À qui parle l’app ?</h3>
          </div>
          <div className="mode-switcher__chips">
            {SEGMENT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={state.segment === option.id ? 'mode-chip is-active' : 'mode-chip'}
                onClick={() => setState((current) => ({ ...current, segment: option.id }))}
              >
                <strong>{option.label}</strong>
                <span>{option.intro}</span>
              </button>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel__header">
            <span className="panel__eyebrow">Expérience</span>
            <h3>Comment tu veux lire l’app ?</h3>
          </div>
          <div className="mode-switcher__chips mode-switcher__chips--compact">
            {EXPERIENCE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={state.experience === option.id ? 'mode-chip is-active' : 'mode-chip'}
                onClick={() => setState((current) => ({ ...current, experience: option.id }))}
              >
                <strong>{option.label}</strong>
                <span>{option.intro}</span>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}

// ─── Orbs ─────────────────────────────────────────────────────────────────────
function GlowingOrb({ className }) {
  return (
    <div className={`glow-orb ${className}`} aria-hidden="true">
      <div className="glow-orb__core" />
      <div className="glow-orb__ring glow-orb__ring--one" />
      <div className="glow-orb__ring glow-orb__ring--two" />
    </div>
  )
}
function GlowingBackdrop() {
  return <><GlowingOrb className="glow-orb--left" /><GlowingOrb className="glow-orb--right" /></>
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState(initialState)
  const [slideIndex, setSlideIndex] = useState(0)
  const [view, setView] = useState('dashboard')
  const [showLoader, setShowLoader] = useState(true)
  const [pointer, setPointer] = useState({ x: 0.52, y: 0.38 })
  const [gyro, setGyro] = useState({ x: 0, y: 0 })
  const [unlockedBadges, setUnlockedBadges] = useState([])
  const [badgeToast, setBadgeToast] = useState(null)
  const [actionToast, setActionToast] = useState(null)
  const [onboardingError, setOnboardingError] = useState('')
  const [storageNotice, setStorageNotice] = useState(null)
  const swipeRef = useRef({ startX: 0, currentX: 0, startTime: 0, velocity: 0 })
  const importRef = useRef(null)
  const deferredPointer = useDeferredValue(pointer)
  const { canvasRef, burst } = useParticleBurst()

  // Persist state
  useEffect(() => {
    try {
      const persisted = readPersistedState()
      setState(persisted.state)
      setStorageNotice(persisted.notice)
    } catch {}
    try {
      const savedBadges = window.localStorage.getItem(BADGES_KEY)
      if (savedBadges) setUnlockedBadges(JSON.parse(savedBadges))
    } catch {}
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
  }, [state])

  useEffect(() => {
    try { window.localStorage.setItem(BADGES_KEY, JSON.stringify(unlockedBadges)) } catch {}
  }, [unlockedBadges])

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme || 'dark'
  }, [state.theme])

  // Loader
  useEffect(() => {
    const t = setTimeout(() => setShowLoader(false), 2400)
    return () => clearTimeout(t)
  }, [])

  // Mouse + keyboard
  useEffect(() => {
    const onMove = (e) => {
      startTransition(() => setPointer({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }))
    }
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setActiveMonth(clamp(state.activeMonth + 1, 0, 2))
      if (e.key === 'ArrowLeft') setActiveMonth(clamp(state.activeMonth - 1, 0, 2))
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('keydown', onKey) }
  }, [])

  // Gyroscope (mobile)
  useEffect(() => {
    const onOrientation = (e) => {
      const x = clamp((e.gamma || 0) / 45, -1, 1) * 0.5 + 0.5
      const y = clamp((e.beta || 0) / 45, -1, 1) * 0.5 + 0.5
      setGyro({ x: x - 0.5, y: y - 0.5 })
    }
    window.addEventListener('deviceorientation', onOrientation, { passive: true })
    return () => window.removeEventListener('deviceorientation', onOrientation)
  }, [])

  // Floating dock auto-hide on scroll
  useEffect(() => {
    let lastY = window.scrollY
    const dock = document.querySelector('.floating-dock')
    const onScroll = () => {
      const y = window.scrollY
      if (y > lastY + 8) dock?.classList.add('is-hidden')
      else if (y < lastY - 8) dock?.classList.remove('is-hidden')
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Reveal animation
  useEffect(() => {
    const nodes = document.querySelectorAll('[data-reveal]')
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.1 })
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [state.onboardingDone, view])

  const metricsByMonth = useMemo(() => state.months.map(calcMonth), [state.months])
  const metrics = metricsByMonth[state.activeMonth]
  const prevMetrics = state.activeMonth > 0 ? metricsByMonth[state.activeMonth - 1] : null
  const monthStarted = hasMonthStarted(state.months[state.activeMonth])
  const monthReady = hasMonthBasics(state.months[state.activeMonth])
  const averageScore = Math.round(metricsByMonth.reduce((s, m) => s + m.score, 0) / metricsByMonth.length)
  const totalEpargne = metricsByMonth.reduce((s, m) => s + m.epargne, 0)
  const totalInvisible = metricsByMonth.reduce((s, m) => s + m.invisibles, 0)
  const streak = metricsByMonth.filter((m) => m.revenu > 0).length
  const totalIncome = sumIncomeSources(state.months[state.activeMonth]) || metrics.revenu

  // Badge unlock check
  useEffect(() => {
    if (!state.onboardingDone) return
    BADGE_DEFS.forEach((badge) => {
      if (unlockedBadges.includes(badge.id)) return
      if (badge.check(metricsByMonth)) {
        setUnlockedBadges((prev) => [...prev, badge.id])
        setBadgeToast(badge)
      }
    })
  }, [metricsByMonth, state.onboardingDone])

  const mouseStyle = {
    '--mx': `${deferredPointer.x * 100}%`,
    '--my': `${deferredPointer.y * 100}%`,
    '--score-fill': `${metrics.score}%`,
  }

  const notify = useCallback((toast) => {
    setActionToast({ tone: 'ok', ...toast, id: makeId() })
  }, [])

  const setMonth = (key, value) => {
    setState((c) => ({
      ...c,
      months: c.months.map((m, i) => i === c.activeMonth ? { ...m, [key]: value } : m),
    }))
  }

  const setActiveMonth = (idx) => {
    setState((c) => {
      const prev = c.months[idx - 1]
      const target = c.months[idx]
      if (prev && target && (target.items || []).length === 0 && target.revenu === 0) {
        const filled = applyRecurring(prev, target)
        return { ...c, activeMonth: idx, months: c.months.map((m, i) => i === idx ? filled : m) }
      }
      return { ...c, activeMonth: idx }
    })
  }

  const addItem = (item, options = {}) => {
    const normalizedItem = {
      ...item,
      owner: item.owner || getDefaultOwner(state.segment),
      scope: item.scope || getDefaultScope(state.segment),
      tag: item.tag || '',
      createdAt: item.createdAt || new Date().toISOString(),
    }
    setState((c) => ({
      ...c,
      months: c.months.map((m, i) =>
        i === c.activeMonth ? { ...m, items: [...(m.items || []), normalizedItem] } : m,
      ),
    }))
    if (!options.silent) notify({ title: 'Dépense ajoutée', text: `${normalizedItem.name} · ${fmt(normalizedItem.amount)}` })
  }

  const deleteItem = (itemId) => {
    const activeItem = (state.months[state.activeMonth].items || []).find((it) => it.id === itemId)
    setState((c) => ({
      ...c,
      months: c.months.map((m, i) =>
        i === c.activeMonth ? { ...m, items: (m.items || []).filter((it) => it.id !== itemId) } : m,
      ),
    }))
    if (activeItem) notify({ title: 'Dépense supprimée', text: activeItem.name })
  }

  const toggleRecurring = (itemId) => {
    setState((c) => ({
      ...c,
      months: c.months.map((m, i) =>
        i === c.activeMonth
          ? { ...m, items: (m.items || []).map((it) => it.id === itemId ? { ...it, recurring: !it.recurring } : it) }
          : m,
      ),
    }))
  }

  const editItem = (item) => {
    const nextName = window.prompt('Modifier le libellé', item.name)
    if (nextName === null) return
    const nextAmountRaw = window.prompt('Modifier le montant', String(item.amount))
    if (nextAmountRaw === null) return
    const nextTag = window.prompt('Modifier la catégorie perso (facultatif)', item.tag || '')
    if (nextTag === null) return
    const nextAmount = Number(nextAmountRaw.replace(',', '.'))
    if (!nextName.trim() || !nextAmount) return
    setState((c) => ({
      ...c,
      months: c.months.map((m, i) =>
        i === c.activeMonth
          ? {
              ...m,
              items: (m.items || []).map((it) => it.id === item.id ? { ...it, name: nextName.trim(), amount: nextAmount, tag: nextTag.trim() } : it),
            }
          : m,
      ),
    }))
    notify({ title: 'Dépense modifiée', text: `${nextName.trim()} · ${fmt(nextAmount)}` })
  }

  const addIncomeSource = (source) => {
    const normalizedSource = {
      ...source,
      owner: source.owner || getDefaultOwner(state.segment),
      scope: source.scope || getDefaultScope(state.segment),
    }
    setState((c) => ({
      ...c,
      months: c.months.map((m, i) =>
        i === c.activeMonth ? { ...m, incomeSources: [...(m.incomeSources || []), normalizedSource] } : m,
      ),
    }))
    notify({ title: 'Revenu ajouté', text: `${normalizedSource.name} · ${fmt(normalizedSource.amount)}` })
  }

  const deleteIncomeSource = (sourceId) => {
    const activeSource = (state.months[state.activeMonth].incomeSources || []).find((source) => source.id === sourceId)
    setState((c) => ({
      ...c,
      months: c.months.map((m, i) =>
        i === c.activeMonth ? { ...m, incomeSources: (m.incomeSources || []).filter((source) => source.id !== sourceId) } : m,
      ),
    }))
    if (activeSource) notify({ title: 'Revenu supprimé', text: activeSource.name })
  }

  const exportData = () => {
    const lines = [
      ['mois', 'type', 'categorie', 'sous_categorie', 'owner', 'scope', 'nom', 'montant'],
      ...state.months.flatMap((month, index) => {
        const monthLabel = MONTHS[index]
        const incomeLines = (month.incomeSources || []).map((source) => [monthLabel, 'revenu', 'revenu', '', source.owner || '', source.scope || '', source.name, source.amount])
        const fallbackIncome = !incomeLines.length && Number(month.revenu) > 0
          ? [[monthLabel, 'revenu', 'revenu', '', '', '', 'Revenu total', Number(month.revenu)]]
          : []
        const itemLines = (month.items || []).map((item) => [monthLabel, 'depense', item.cat, item.tag || '', item.owner || '', item.scope || '', item.name, item.amount])
        return [...incomeLines, ...fallbackIncome, ...itemLines]
      }),
    ]
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mois-clair-export.csv'
    a.click()
    URL.revokeObjectURL(url)
    notify({ title: 'Export prêt', text: 'Le fichier CSV peut être ouvert dans Excel, Numbers ou Google Sheets.' })
  }

  const exportMonthlyPdf = () => {
    const month = state.months[state.activeMonth]
    const grouped = ['fixes', 'variables', 'invisibles', 'epargne'].map((cat) => ({
      cat,
      label: CAT_LABELS[cat],
      total: sumCat(month.items || [], cat),
      items: (month.items || []).filter((item) => item.cat === cat),
    })).filter((group) => group.total > 0 || group.items.length)
    const incomeLines = (month.incomeSources || []).length
      ? (month.incomeSources || []).map((source) => `<tr><td>${source.name}</td><td>${source.owner || '—'}</td><td>${source.scope || '—'}</td><td>${fmt(source.amount)}</td></tr>`).join('')
      : `<tr><td>Revenu total</td><td>—</td><td>—</td><td>${fmt(metrics.revenu)}</td></tr>`
    const groupedHtml = grouped.map((group) => `
      <section class="pdf-section">
        <h3>${group.label} <span>${fmt(group.total)}</span></h3>
        <table>
          <thead><tr><th>Nom</th><th>Catégorie perso</th><th>Owner</th><th>Scope</th><th>Montant</th></tr></thead>
          <tbody>
            ${group.items.map((item) => `<tr><td>${item.name}</td><td>${item.tag || '—'}</td><td>${item.owner || '—'}</td><td>${item.scope || '—'}</td><td>${fmt(item.amount)}</td></tr>`).join('') || `<tr><td colspan="5">Aucune ligne</td></tr>`}
          </tbody>
        </table>
      </section>
    `).join('')
    const popup = window.open('', '_blank', 'width=860,height=980')
    if (!popup) {
      notify({ title: 'Popup bloquée', text: 'Autorise les popups pour générer le PDF du mois.', tone: 'error' })
      return
    }
    popup.document.write(`
      <html lang="fr">
        <head>
          <title>${APP_NAME} — ${MONTHS[state.activeMonth]}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #1f2230; }
            h1, h2, h3 { margin: 0; }
            .top { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:24px; }
            .brand { font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:#8a6d2e; }
            .hero { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; margin:24px 0; }
            .card { border:1px solid #e6dcc4; border-radius:16px; padding:14px 16px; background:#fffaf1; }
            .card span { display:block; font-size:12px; color:#6b6d7e; margin-bottom:6px; }
            .card strong { font-size:20px; }
            .pdf-section { margin-top:22px; }
            .pdf-section h3 { display:flex; justify-content:space-between; margin-bottom:10px; font-size:16px; }
            table { width:100%; border-collapse:collapse; }
            th, td { border-bottom:1px solid #ece7da; padding:10px 8px; text-align:left; font-size:14px; }
            th { color:#6b6d7e; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; }
            .lead { color:#4d5368; line-height:1.6; margin-top:10px; }
            @media print { body { margin: 18px; } }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <div class="brand">${APP_NAME}</div>
              <h1>Bilan mensuel — ${MONTHS[state.activeMonth]}</h1>
              <p class="lead">${getCalmMessage(metrics, state.prenom)}</p>
            </div>
            <div>
              <strong>${state.prenom ? state.prenom : 'Budget personnel'}</strong><br />
              <span>Généré le ${new Date().toLocaleDateString('fr-FR')}</span>
            </div>
          </div>
          <section class="pdf-section">
            <h3>Revenus <span>${fmt(metrics.revenu)}</span></h3>
            <table>
              <thead><tr><th>Source</th><th>Owner</th><th>Scope</th><th>Montant</th></tr></thead>
              <tbody>${incomeLines}</tbody>
            </table>
          </section>
          <div class="hero">
            <div class="card"><span>Reste du mois</span><strong>${fmt(metrics.soldeAjuste)}</strong></div>
            <div class="card"><span>Dépenses</span><strong>${fmt(metrics.totalDepenses)}</strong></div>
            <div class="card"><span>Épargne</span><strong>${fmt(metrics.epargne)}</strong></div>
            <div class="card"><span>Score</span><strong>${metrics.totalDepenses === 0 ? 'À lancer' : `${metrics.score}/100`}</strong></div>
          </div>
          ${groupedHtml}
        </body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
    notify({ title: 'PDF lancé', text: 'La fenêtre d’impression s’ouvre. Tu peux enregistrer le bilan en PDF.' })
  }

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ state, unlockedBadges, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mois-clair-backup.json'
    a.click()
    URL.revokeObjectURL(url)
    notify({ title: 'Backup créé', text: 'Garde ce fichier si tu changes de téléphone ou de navigateur.' })
  }

  const importBackup = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      setState(normalizeState(parsed.state || parsed))
      setUnlockedBadges(Array.isArray(parsed.unlockedBadges) ? parsed.unlockedBadges : [])
      notify({ title: 'Backup restauré', text: 'Tes données ont été réimportées sur cet appareil.' })
    } catch {
      notify({ title: 'Import impossible', text: 'Le fichier ne ressemble pas à un backup valide.', tone: 'error' })
    } finally {
      event.target.value = ''
    }
  }

  const shareSummary = async () => {
    const shareText = `${state.prenom ? `${state.prenom} · ` : ''}${MONTHS[state.activeMonth]} — reste du mois ${fmt(metrics.soldeAjuste)}, épargne ${fmt(metrics.epargne)}, score ${metrics.score}/100.`
    try {
      if (navigator.share) {
        await navigator.share({ title: APP_NAME, text: shareText })
      } else {
        await navigator.clipboard.writeText(shareText)
      }
      notify({ title: 'Partage prêt', text: navigator.share ? 'Le partage natif est ouvert.' : 'Résumé copié dans le presse-papiers.' })
    } catch {}
  }

  const applyDeltaToMonth = (key, delta) => {
    // For quick actions: adds a synthetic item
    const catMap = { variables: 'variables', invisibles: 'invisibles', epargne: 'epargne', fixes: 'fixes' }
    if (key === 'revenu') {
      setState((c) => ({
        ...c,
        months: c.months.map((m, i) =>
          i === c.activeMonth ? { ...m, revenu: Math.max(0, (Number(m.revenu) || 0) + delta) } : m,
        ),
      }))
      notify({ title: 'Revenu ajusté', text: `${delta > 0 ? '+' : ''}${fmt(delta)}` })
      return
    }
    if (catMap[key]) {
      const label = delta > 0 ? `Ajout ${FIELD_LABELS[key]}` : `Réduction ${FIELD_LABELS[key]}`
      const abs = Math.abs(delta)
      if (delta > 0) {
        addItem({ id: makeId(), name: label, amount: abs, cat: catMap[key] })
      } else {
        // For negative delta, remove the last item of that category if possible
        setState((c) => {
          const m = c.months[c.activeMonth]
          const items = (m.items || [])
          const catItems = items.filter((i) => i.cat === key)
          if (catItems.length > 0) {
            const last = catItems[catItems.length - 1]
            const newAmt = Math.max(0, last.amount - abs)
            return {
              ...c,
              months: c.months.map((mo, i) =>
                i === c.activeMonth
                  ? { ...mo, items: items.map((it) => it.id === last.id ? { ...it, amount: newAmt } : it).filter((it) => it.amount > 0) }
                  : mo,
              ),
            }
          }
          return c
        })
        notify({ title: 'Ajustement appliqué', text: `${FIELD_LABELS[key]} ${delta}` })
      }
    }
  }

  const copyPreviousMonth = () => {
    if (state.activeMonth === 0) return
    setState((c) => ({
      ...c,
      months: c.months.map((m, i) => (
        i === c.activeMonth
          ? {
              ...c.months[c.activeMonth - 1],
              incomeSources: [...(c.months[c.activeMonth - 1].incomeSources || [])].map((source) => ({ ...source, id: makeId() })),
              items: [...(c.months[c.activeMonth - 1].items || [])].map((item) => ({ ...item, id: makeId() })),
            }
          : m
      )),
    }))
    notify({ title: 'Mois recopié', text: 'Le mois précédent a servi de base.' })
  }

  // Swipe with momentum
  const handleTouchStart = (e) => {
    swipeRef.current = { startX: e.touches[0].clientX, currentX: e.touches[0].clientX, startTime: Date.now(), velocity: 0 }
  }
  const handleTouchMove = (e) => {
    const now = Date.now()
    const dx = e.touches[0].clientX - swipeRef.current.currentX
    const dt = now - swipeRef.current.startTime || 1
    swipeRef.current.velocity = dx / dt
    swipeRef.current.currentX = e.touches[0].clientX
    swipeRef.current.startTime = now
  }
  const handleTouchEnd = () => {
    const delta = swipeRef.current.currentX - swipeRef.current.startX
    const velocity = swipeRef.current.velocity
    if (delta < -40 || velocity < -0.5) setActiveMonth(clamp(state.activeMonth + 1, 0, 2))
    if (delta > 40 || velocity > 0.5) setActiveMonth(clamp(state.activeMonth - 1, 0, 2))
  }

  const handleValidation = useCallback((e) => {
    const el = e?.currentTarget ?? e?.target
    if (el) {
      const rect = el.getBoundingClientRect()
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2)
    } else {
      burst(window.innerWidth / 2, window.innerHeight / 2)
    }
  }, [burst])

  if (showLoader) {
    return (
      <main className="app-shell app-shell--loader" style={mouseStyle}>
        <ParticlesBackground gyroX={gyro.x} gyroY={gyro.y} />
        <GlowingBackdrop />
        <section className="liquid-loader">
          <div className="liquid-loader__pool" />
          <div className="liquid-loader__logo">
            <span>MOIS</span>
            <span>CLAIR</span>
          </div>
          <p className="liquid-loader__tag">Forge en cours</p>
        </section>
      </main>
    )
  }

  if (!state.onboardingDone) {
    const slide = onboardingSlides[slideIndex]
    return (
      <main className="app-shell app-shell--intro" style={mouseStyle}>
        <CustomCursor />
        <ParticlesBackground gyroX={gyro.x} gyroY={gyro.y} />
        <GlowingBackdrop />
        <section className="intro-stage">
              <div className="intro-stage__brand">
            <span>{APP_NAME}</span>
            <p>Protocole 3 mois</p>
          </div>
          <article className="intro-card">
            <div className="intro-card__progress">
              {onboardingSlides.map((item, index) => (
                <span key={item.id} className={index === slideIndex ? 'is-active' : ''} />
              ))}
            </div>
            <h1>{slide.title}</h1>
            <p>{slide.text}</p>
            {slide.id === 'launch' && (
              <div className="intro-form">
                <label className="field">
                  <span className="field__label">Prénom</span>
                  <div className="field__control field__control--text">
                    <input type="text" placeholder="Ton prénom" value={state.prenom}
                      aria-invalid={Boolean(onboardingError)}
                      onChange={(e) => {
                        setOnboardingError('')
                        setState((c) => ({ ...c, prenom: e.target.value }))
                      }} />
                  </div>
                </label>
                <label className="field">
                  <span className="field__label">Email <span className="field__optional">(optionnel)</span></span>
                  <div className="field__control field__control--text">
                    <input type="email" placeholder="ton@email.com" value={state.email || ''}
                      onChange={(e) => setState((c) => ({ ...c, email: e.target.value }))} />
                  </div>
                </label>
                <label className="field">
                  <span className="field__label">Profil</span>
                  <div className="field__control field__control--text">
                    <select
                      value={state.profil}
                      onChange={(e) => setState((c) => ({ ...c, profil: e.target.value }))}
                    >
                      {PROFILE_OPTIONS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="field">
                  <span className="field__label">Mode budget</span>
                  <div className="field__control field__control--text">
                    <select
                      value={state.segment}
                      onChange={(e) => setState((c) => ({ ...c, segment: e.target.value }))}
                    >
                      {SEGMENT_OPTIONS.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="field">
                  <span className="field__label">Expérience</span>
                  <div className="field__control field__control--text">
                    <select
                      value={state.experience}
                      onChange={(e) => setState((c) => ({ ...c, experience: e.target.value }))}
                    >
                      {EXPERIENCE_OPTIONS.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                </label>
                {state.segment === 'couple' ? (
                  <label className="field">
                    <span className="field__label">Prénom du partenaire</span>
                    <div className="field__control field__control--text">
                      <input type="text" placeholder="Prénom du partenaire" value={state.partnerName}
                        onChange={(e) => setState((c) => ({ ...c, partnerName: e.target.value }))} />
                    </div>
                  </label>
                ) : null}
                <Field label="Ton revenu total du mois" value={state.months[2].revenu}
                  onChange={(v) => setState((c) => ({ ...c, months: c.months.map((m, i) => i === 2 ? { ...m, revenu: v } : m) }))} />
                {onboardingError ? <p className="form-error">{onboardingError}</p> : null}
                <p className="privacy-inline">Ton prénom est requis pour démarrer. L'email reste optionnel. Si tu laisses ton email, il sert uniquement à recevoir des nouvelles ou rappels du produit.</p>
              </div>
            )}
            <div className="intro-actions">
              {slideIndex > 0
                ? <button type="button" className="button button--ghost" onClick={() => setSlideIndex((c) => c - 1)}>Retour</button>
                : <span />
              }
              {slideIndex < onboardingSlides.length - 1
                ? <button type="button" className="button button--primary" onClick={() => setSlideIndex((c) => c + 1)}>Continuer</button>
                : <button type="button" className="button button--primary"
                    onClick={(e) => {
                      if (!state.prenom.trim()) {
                        setOnboardingError('Entre ton prénom pour personnaliser l’app et continuer.')
                        return
                      }
                      setOnboardingError('')
                      setState((c) => ({ ...c, onboardingDone: true }))
                      handleValidation(e)
                      if (state.email && FORMSPREE_ID) {
                        fetch('https://formspree.io/f/' + FORMSPREE_ID, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                          body: JSON.stringify({ email: state.email, prenom: state.prenom, source: 'budget-ossema-onboarding' }),
                        }).catch(() => {})
                      }
                    }}>
                    Entrer dans l'app
                  </button>
              }
            </div>
          </article>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell" style={mouseStyle}>
      <CustomCursor />
      <canvas ref={canvasRef} className="burst-canvas" aria-hidden="true" />
      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-noise" aria-hidden="true" />
      <ParticlesBackground gyroX={gyro.x} gyroY={gyro.y} />
      <GlowingBackdrop />

      {/* Badge toast */}
      {badgeToast && (
        <BadgeToast badge={badgeToast} onDismiss={() => setBadgeToast(null)} />
      )}
      <ActionToast toast={actionToast} onDismiss={() => setActionToast(null)} />
      <input ref={importRef} type="file" accept="application/json" className="visually-hidden" onChange={importBackup} />
      <StorageNotice
        notice={storageNotice}
        onImport={() => importRef.current?.click()}
        onRestart={() => {
          LEGACY_STORAGE_KEYS.forEach((key) => {
            try { window.localStorage.removeItem(key) } catch {}
          })
          try { window.localStorage.removeItem(BADGES_KEY) } catch {}
          setState(initialState)
          setUnlockedBadges([])
          setStorageNotice(null)
          notify({ title: 'Base réinitialisée', text: 'On repart proprement sur cette version.' })
        }}
      />

      <header className="topbar" data-reveal>
        <div className="brand-lockup">
          <span className="brand-mark">{APP_NAME}</span>
          <span className="brand-slash" />
          <span className="brand-subline">{state.prenom ? `Budget de ${state.prenom}` : 'Protocole 3 mois'} · {SEGMENT_OPTIONS.find((item) => item.id === state.segment)?.label}</span>
        </div>
        <div className="topbar-status">
          <div className="status-pill streak-pill">
            <span>Streak</span>
            <div className="streak-flames">
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className={`streak-flame ${i < streak ? `streak-flame--${i === 0 ? 'bronze' : i === 1 ? 'silver' : 'gold'}` : 'streak-flame--empty'}`}>
                  🔥
                </span>
              ))}
            </div>
          </div>
          <div className="status-pill">
            <span>{monthReady ? 'Moyenne 3 mois' : 'Configuration'}</span>
            <strong>{monthReady ? averageScore : 'En cours'}</strong>
          </div>
          <div className="status-pill status-pill--reset">
            <button type="button" className="reset-btn" title="Partager mon résumé" onClick={shareSummary} style={{ marginRight: '4px' }}>
              ↗
            </button>
            <button type="button" className="reset-btn" title="Exporter le mois en PDF" onClick={exportMonthlyPdf} style={{ marginRight: '4px' }}>
              PDF
            </button>
            <button type="button" className="reset-btn" title="Exporter en CSV" onClick={exportData} style={{ marginRight: '4px' }}>
              ↓
            </button>
            <button type="button" className="reset-btn" title="Importer un backup" onClick={() => importRef.current?.click()} style={{ marginRight: '4px' }}>
              ↑
            </button>
            <button type="button" className="reset-btn" title="Créer un backup JSON" onClick={exportBackup} style={{ marginRight: '4px' }}>
              ⎘
            </button>
            <button type="button" className="reset-btn" title={state.theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'} onClick={() => setState((c) => ({ ...c, theme: c.theme === 'dark' ? 'light' : 'dark' }))} style={{ marginRight: '4px' }}>
              {state.theme === 'dark' ? '☀' : '☾'}
            </button>
            <button type="button" className="reset-btn" title="Réinitialiser"
              onClick={() => { if (window.confirm('Réinitialiser toutes les données ?')) { window.localStorage.removeItem(STORAGE_KEY); window.localStorage.removeItem(BADGES_KEY); setState({ ...initialState, onboardingDone: false }); setUnlockedBadges([]) } }}>
              ↺
            </button>
          </div>
        </div>
      </header>

      <section className="hero hero--dashboard" data-reveal>
        <div className="hero-copy">
          <div className="eyebrow-row">
            <span className="eyebrow">Copilote financier</span>
            <span className="eyebrow eyebrow--muted">{EXPERIENCE_OPTIONS.find((item) => item.id === state.experience)?.label} · 3 mois d'un coup</span>
          </div>
          <h1>Voir clair.<span>Agir vite.</span></h1>
          <p className="hero-text">
            {monthReady
              ? "Tu vois ce qu'il te reste, ce qui mérite ton attention et la direction que prend ton mois."
              : "Commence par poser ta base. L'app devient vraiment utile quand le mois est construit."}
          </p>
          <div className="top-nav-pills">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} type="button"
                className={view === item.id ? 'top-nav-pill is-active' : 'top-nav-pill'}
                onClick={() => setView(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hero-visual hero-visual--score"
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          {/* Score sphere V3 */}
          <div className={`score-sphere score-sphere--${scoreTone(metrics.score)}`}>
            <div className="score-sphere__glow" />
            <div className="score-sphere__core">
              <span>{monthReady && metrics.totalDepenses > 0 ? 'Score' : 'Base du mois'}</span>
              <strong>{monthReady && metrics.totalDepenses > 0 ? <NumberFlow value={metrics.score} /> : fmt(totalIncome)}</strong>
              <p>{monthReady && metrics.totalDepenses > 0 ? metrics.scoreLabel : 'Commence par ajouter ta première dépense — ton score prendra sens.'}</p>
            </div>
            <div className="score-sphere__ring" />
            <div className="score-sphere__ring score-sphere__ring--outer" />
          </div>

          <div className="month-breadcrumb">
            {MONTHS.map((item, index) => (
              <button key={item} type="button"
                className={index === state.activeMonth ? 'month-breadcrumb__dot is-active' : 'month-breadcrumb__dot'}
                onClick={() => setActiveMonth(index)}
                aria-label={item} />
            ))}
          </div>

          <div className="score-readout">
            <article>
              <span>{monthReady ? 'Reste du mois' : 'Étape 1'}</span>
              <strong>{monthReady ? <NumberFlow value={metrics.soldeAjuste} currency /> : 'Entrer le revenu'}</strong>
              {monthReady && prevMetrics && <Delta current={metrics.soldeAjuste} prev={prevMetrics.soldeAjuste} currency />}
            </article>
            <article>
              <span>{monthReady ? 'Épargne' : 'Étape 2'}</span>
              <strong>{monthReady ? <NumberFlow value={metrics.epargne} currency /> : 'Ajouter les charges'}</strong>
              {monthReady && prevMetrics && <Delta current={metrics.epargne} prev={prevMetrics.epargne} currency />}
            </article>
            <article>
              <span>{monthReady ? 'Invisibles' : 'Étape 3'}</span>
              <strong>{monthReady ? <NumberFlow value={metrics.invisibles} currency /> : 'Lire ton budget'}</strong>
              {monthReady && prevMetrics && <Delta current={metrics.invisibles} prev={prevMetrics.invisibles} currency inverse />}
            </article>
          </div>
        </div>
      </section>

      {monthReady ? <WarmWelcome metrics={metrics} prenom={state.prenom} /> : null}

      {monthReady ? <MonthPilotPanel metrics={metrics} month={state.months[state.activeMonth]} /> : null}

      {monthReady ? (
        <SegmentInsightPanel
          segment={state.segment}
          experience={state.experience}
          month={state.months[state.activeMonth]}
          metrics={metrics}
          metricsByMonth={metricsByMonth}
          prenom={state.prenom}
          partnerName={state.partnerName}
        />
      ) : null}

      {monthStarted ? (
        <MonthCompareStrip
          months={state.months}
          metricsByMonth={metricsByMonth}
          activeMonth={state.activeMonth}
          setActiveMonth={setActiveMonth}
        />
      ) : null}

      <div className="active-month-label" data-reveal>
        <span className="eyebrow">{MONTHS[state.activeMonth]}</span>
      </div>
      <ModeSwitcher state={state} setState={setState} />
      <MonthNavigator activeMonth={state.activeMonth} setActiveMonth={setActiveMonth} />
      <ViewGuide view={view} />

      {view === 'dashboard' && (
        <>
          {monthReady ? <ActionPlan metrics={metrics} /> : <SetupIntro monthLabel={MONTHS[state.activeMonth]} prenom={state.prenom} segment={state.segment} />}

          <section className="control-room" data-reveal>
            <div className="control-room__grid">
              {monthReady ? (
                <MonthEditor
                  month={state.months[state.activeMonth]}
                  setMonth={setMonth}
                  onAddItem={addItem}
                  onDeleteItem={deleteItem}
                  onEditItem={editItem}
                  onAddIncomeSource={addIncomeSource}
                  onDeleteIncomeSource={deleteIncomeSource}
                  metrics={metrics}
                  onToggleRecurring={toggleRecurring}
                  onValidate={handleValidation}
                  onNotify={notify}
                  segment={state.segment}
                  partnerName={state.partnerName}
                  experience={state.experience}
                />
              ) : (
                <BudgetSetupWizard
                  month={state.months[state.activeMonth]}
                  setMonth={setMonth}
                  onAddItem={addItem}
                  onDeleteItem={deleteItem}
                  onEditItem={editItem}
                  monthLabel={MONTHS[state.activeMonth]}
                  prenom={state.prenom}
                  onToggleRecurring={toggleRecurring}
                  onAddIncomeSource={addIncomeSource}
                  onDeleteIncomeSource={deleteIncomeSource}
                  onFinish={handleValidation}
                  onNotify={notify}
                  segment={state.segment}
                  partnerName={state.partnerName}
                  experience={state.experience}
                />
              )}
              <article className="panel">
                <div className="panel__header">
                  <span className="panel__eyebrow">Wealth ring — allocation du revenu</span>
                  <h3>{MONTHS[state.activeMonth]}</h3>
                </div>
                {monthReady ? (
                  <WealthRing metrics={metrics} />
                ) : (
                  <div className="empty-panel">
                    <p className="empty-panel__title">Ajoute d'abord ton budget de base.</p>
                    <p className="empty-panel__text">Le ring apparaîtra dès que tu auras saisi ton revenu et au moins un poste de dépense ou de découvert.</p>
                  </div>
                )}
              </article>
            </div>
          </section>

          {monthStarted ? (
            <DailyCapturePanel
              month={state.months[state.activeMonth]}
              onCopyPrev={copyPreviousMonth}
              onApplyDelta={applyDeltaToMonth}
              canCopyPrev={state.activeMonth > 0}
            />
          ) : null}

          {monthReady ? (
            <section className="dashboard" data-reveal>
              <div className="dashboard-grid">
                <article className="panel panel--wide">
                  <div className="panel__header">
                    <span className="panel__eyebrow">Cashflow waterfall</span>
                    <h3>La rivière du mois</h3>
                  </div>
                  <Waterfall metrics={metrics} />
                </article>
                <article className="panel">
                  <div className="panel__header">
                    <span className="panel__eyebrow">Ratios</span>
                    <h3>Respiration</h3>
                  </div>
                  <div className="ratio-list">
                    {[
                      { label: 'Fixes', r: metrics.tauxFixes, ok: metrics.tauxFixes <= 0.45, elite: false },
                      { label: 'Variables', r: metrics.tauxVariables, ok: metrics.tauxVariables <= 0.3, elite: false },
                      { label: 'Invisibles', r: metrics.tauxInvisibles, ok: metrics.tauxInvisibles <= 0.03, elite: false },
                      { label: 'Épargne', r: metrics.tauxEpargne, ok: metrics.tauxEpargne >= 0.1, elite: metrics.tauxEpargne >= 0.2 },
                    ].map(({ label, r, ok, elite }) => (
                      <div key={label} className="ratio-row">
                        <span>{label}</span>
                        <strong>{pct(r)}</strong>
                        <span className={`ratio-badge ratio-badge--${elite ? 'elite' : ok ? 'ok' : 'warn'}`}>
                          {elite ? '★' : ok ? '✓' : '!'}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="panel">
                  <div className="panel__header">
                    <span className="panel__eyebrow">Coach budget</span>
                    <h3>Actions</h3>
                  </div>
                  <CoachingPanel metrics={metrics} prevMetrics={prevMetrics} />
                </article>
                <BankAdvisorPanel metrics={metrics} prevMetrics={prevMetrics} />
              </div>
            </section>
          ) : null}
        </>
      )}

      {view === 'bilan' && (
        <section className="engine" data-reveal>
          <div className="section-heading">
            <span className="eyebrow">Bilan cinématique</span>
            <h2>Les 3 mois côte à côte.</h2>
          </div>
          <div className="timeline-grid timeline-grid--months">
            {metricsByMonth.map((item, index) => (
              (() => {
                const ready = hasMonthBasics(state.months[index])
                return (
              <article key={MONTHS[index]}
                className={`timeline-card ${index === state.activeMonth ? 'timeline-card--active' : ''}`}
                onClick={() => setActiveMonth(index)}
                style={{ cursor: 'pointer' }}>
                <span className="timeline-step">{MONTHS[index]}</span>
                <h3 className={ready ? `score-color--${scoreTone(item.score)}` : ''}>{ready ? <NumberFlow value={item.score} /> : '—'}</h3>
                <p className="timeline-label">{ready ? item.scoreLabel : 'Base à compléter'}</p>
                <p>Solde ajusté: {fmt(item.soldeAjuste)}</p>
                <p>Épargne: {fmt(item.epargne)}</p>
                <p>Invisibles: {fmt(item.invisibles)}</p>
                {ready && index > 0 && hasMonthBasics(state.months[index - 1]) && (
                  <div className="timeline-deltas">
                    <Delta current={item.score} prev={metricsByMonth[index - 1].score} />
                    <span className="delta-label">score</span>
                  </div>
                )}
              </article>
                )
              })()
            ))}
          </div>
          <article className="panel panel--chart">
            <div className="panel__header">
              <span className="panel__eyebrow">Courbe 3 mois — normalisée par série</span>
              <h3>Solde · Score · Épargne</h3>
            </div>
            <ThreeMonthChart metricsByMonth={metricsByMonth} />
          </article>
        </section>
      )}

      {view === 'vision' && (
        (() => {
          const plan = getPatrimonyPlan(metricsByMonth, state.profil)
          const monthly = plan.avgSavings
          const livretA = Math.round(monthly * ((Math.pow(1 + 0.03 / 12, 12) - 1) / (0.03 / 12) || 0))
          const pea = Math.round(monthly * ((Math.pow(1 + 0.07 / 12, 12) - 1) / (0.07 / 12) || 0))
          const linear = Math.round(monthly * 12)
          return (
            <section className="pricing pricing--vision" data-reveal>
              <div className="section-heading">
                <span className="eyebrow">Gestion de patrimoine</span>
                <h2>Tu ne suis plus juste un budget, tu construis une trajectoire.</h2>
              </div>
              <div className="vision-grid">
                <article className="panel panel--vision">
                  <div className="vision-grid-bg" />
                  <div className="vision-grid-bg vision-grid-bg--layer2" />
                  <div className="panel__header">
                    <span className="panel__eyebrow">Phase patrimoniale</span>
                    <h3>{plan.phase}</h3>
                  </div>
                  <div className="vision-value">{fmt(plan.totalSavings)}</div>
                  <p className="vision-text">
                    {plan.nextMove}
                  </p>
                  <div className="waypoints">
                    {[
                      { label: '3k', target: 3000, cls: 'waypoint--one' },
                      { label: '6k', target: 6000, cls: 'waypoint--two' },
                      { label: '12k', target: 12000, cls: 'waypoint--three' },
                    ].map((wp) => {
                      const progress = clamp(plan.totalSavings / wp.target, 0, 1)
                      return (
                        <span
                          key={wp.label}
                          className={"waypoint " + wp.cls + (progress >= 1 ? " waypoint--reached" : "")}
                          style={{ '--wp-progress': progress }}
                        >
                          {wp.label}
                        </span>
                      )
                    })}
                  </div>
                </article>
                <article className="panel">
                  <div className="panel__header">
                    <span className="panel__eyebrow">Conseiller patrimoine</span>
                    <h3>Plan de match</h3>
                  </div>
                  <div className="advisor-kpis advisor-kpis--stack">
                    <div className="advisor-kpi">
                      <span>Revenu moyen</span>
                      <strong>{fmt(plan.avgRevenue)}</strong>
                    </div>
                    <div className="advisor-kpi">
                      <span>Épargne mensuelle</span>
                      <strong>{fmt(plan.avgSavings)}</strong>
                    </div>
                    <div className="advisor-kpi">
                      <span>Investissable maintenant</span>
                      <strong>{fmt(plan.investableNow)}</strong>
                    </div>
                  </div>
                  <div className="advisor-list">
                    <p className="advisor-item">Fond de sécurité 3 mois: <strong>{fmt(plan.emergency3)}</strong></p>
                    <p className="advisor-item">Fond de sécurité 6 mois: <strong>{fmt(plan.emergency6)}</strong></p>
                    <p className="advisor-item">Profil retenu: <strong>{state.profil}</strong></p>
                  </div>
                </article>
                <article className="panel">
                  <div className="panel__header">
                    <span className="panel__eyebrow">Allocation simple</span>
                    <h3>Répartition conseillée</h3>
                  </div>
                  <div className="allocation-list">
                    {plan.allocations.map((item) => (
                      <div key={item.label} className="allocation-item">
                        <div>
                          <span className="allocation-item__label">{item.label}</span>
                          <p className="allocation-item__detail">{item.detail}</p>
                        </div>
                        <strong className="allocation-item__split">{item.split}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="emergency-rule">Cadre pédagogique: on sécurise d’abord, on investit ensuite, on accélère seulement quand la base tient.</p>
                </article>
                <article className="panel" style={{ gridColumn: '1 / -1' }}>
                  <div className="panel__header">
                    <span className="panel__eyebrow">Projection pédagogique</span>
                    <h3>12 mois si tu tiens le rythme</h3>
                  </div>
                  <div className="compound-rows">
                    <div className="compound-row compound-row--blue">
                      <span className="compound-label">Livret A (3%/an)</span>
                      <strong className="compound-val">{fmt(livretA)}</strong>
                      <span className="compound-gain">+{fmt(livretA - linear)}</span>
                    </div>
                    <div className="compound-row compound-row--gold">
                      <span className="compound-label">PEA / ETF (7% moy.)</span>
                      <strong className="compound-val">{fmt(pea)}</strong>
                      <span className="compound-gain">+{fmt(pea - linear)}</span>
                    </div>
                    <div className="compound-row compound-row--muted">
                      <span className="compound-label">Sans rendement</span>
                      <strong className="compound-val">{fmt(linear)}</strong>
                      <span className="compound-gain">base</span>
                    </div>
                  </div>
                  <div className="glossary-grid">
                    <div className="glossary-item">
                      <strong>Livret A</strong>
                      <span>Épargne sécurisée et disponible à tout moment. C’est souvent le premier coussin d’urgence.</span>
                    </div>
                    <div className="glossary-item">
                      <strong>PEA / ETF</strong>
                      <span>Placement plus long terme. On y va seulement quand la base de sécurité existe déjà.</span>
                    </div>
                  </div>
                  <div className="insight-list">
                    <p className="insight-item">Score moyen 3 mois: <strong>{averageScore}</strong></p>
                    <p className="insight-item">Épargne totale 3 mois: <strong>{fmt(totalEpargne)}</strong></p>
                    <p className="insight-item">Dépenses invisibles 3 mois: <strong>{fmt(totalInvisible)}</strong></p>
                    <p className="insight-item">Libérable si invisibles à 3%: <strong>{fmt(Math.max(0, totalInvisible - metricsByMonth.reduce((s, m) => s + m.revenu * 0.03, 0)))}</strong></p>
                    <p className="insight-item">Objectif premium à 20%: <strong>{fmt(metricsByMonth.reduce((s, m) => s + m.revenu * 0.2, 0))}</strong></p>
                  </div>
                  <div className="emergency-fund">
                    <p className="emergency-desc">
                      {plan.totalSavings <= 0
                        ? "Tu pars de zéro, ce n'est pas grave. Le premier palier utile est 100€ puis 500€."
                        : `Tu as déjà sécurisé ${pct(plan.emergencyRatio)} de ton premier coussin d'urgence.`}
                    </p>
                    <div className="emergency-bar-wrap">
                      <div className="emergency-bar-label">
                        <span>Fond d'urgence 3 mois</span>
                        <strong>{fmt(plan.totalSavings)} / {fmt(plan.emergency3)}</strong>
                      </div>
                      <div className="emergency-bar">
                        <div className="emergency-bar__fill" style={{ width: `${Math.min(plan.emergencyRatio, 1) * 100}%`, background: 'linear-gradient(90deg, #64f7ff, #ffcf69)' }} />
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          )
        })()
      )}

      {view === 'badges' && (
        <section className="engine" data-reveal>
          <div className="section-heading">
            <span className="eyebrow">Collection</span>
            <h2>Tes badges de discipline.</h2>
          </div>
          <BadgeShelf unlockedIds={unlockedBadges} />
        </section>
      )}

      <div className="floating-dock" data-reveal>
        {NAV_ITEMS.map((item) => (
          <button key={item.id} type="button"
            className={view === item.id ? 'dock-item is-active' : 'dock-item'}
            onClick={() => setView(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <footer className="legal-footer">
        <span>Version bêta. Les données restent sur ton appareil sauf email volontaire.</span>
        <span>Confidentialité: email optionnel, aucun partage automatique sans action de ta part.</span>
      </footer>
    </main>
  )
}

// ─── 3-month chart ────────────────────────────────────────────────────────────
function ThreeMonthChart({ metricsByMonth }) {
  const width = 900; const height = 280
  const pad = { top: 24, right: 60, bottom: 48, left: 48 }
  const iW = width - pad.left - pad.right; const iH = height - pad.top - pad.bottom
  const series = [
    { key: 'soldeAjuste', label: 'Solde', color: '#f4c86b', unit: '€' },
    { key: 'epargne', label: 'Épargne', color: '#86ff9b', unit: '€' },
    { key: 'score', label: 'Score', color: '#6fe8ff', unit: '' },
  ]
  const normalizedSeries = series.map((s) => {
    const values = metricsByMonth.map((m) => m[s.key])
    const min = Math.min(...values); const max = Math.max(...values)
    const range = max - min || 1
    return { ...s, values, normed: values.map((v) => (v - min) / range), min, max }
  })
  const xFor = (i) => pad.left + (i / (metricsByMonth.length - 1)) * iW
  const yFor = (n) => pad.top + (1 - n) * iH
  return (
    <div className="chart-wrapper">
      <div className="chart-legend">
        {normalizedSeries.map((s) => (
          <span key={s.key} className="chart-legend-item" style={{ '--line': s.color }}>
            <span className="chart-legend-dot" />{s.label}
          </span>
        ))}
        <span className="chart-legend-note">Chaque courbe est normalisée sur son propre min–max</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="three-month-chart">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={pad.left} x2={width - pad.right} y1={yFor(t)} y2={yFor(t)} className="three-month-chart__grid" />
        ))}
        {metricsByMonth.map((_, i) => (
          <line key={i} x1={xFor(i)} x2={xFor(i)} y1={pad.top} y2={height - pad.bottom} className="three-month-chart__grid three-month-chart__grid--v" />
        ))}
        {normalizedSeries.map((s) => {
          const d = s.normed.map((n, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(n)}`).join(' ')
          return <path key={s.key} d={d} style={{ '--line': s.color }} className="three-month-chart__line" />
        })}
        {normalizedSeries.map((s) => s.normed.map((n, i) => {
          const x = xFor(i); const y = yFor(n)
          const displayVal = s.unit === '€' ? fmt(s.values[i]) : String(Math.round(s.values[i]))
          return (
            <g key={`${s.key}-${i}`} className="chart-point-group">
              <circle cx={x} cy={y} r="7" fill={s.color} className="three-month-chart__point" />
              <text x={x} y={y - 14} textAnchor="middle" className="three-month-chart__val" style={{ fill: s.color }}>{displayVal}</text>
            </g>
          )
        }))}
        {MONTHS.map((label, i) => (
          <text key={label} x={xFor(i)} y={height - 8} textAnchor="middle" className="three-month-chart__month">
            {label.split(' ')[0]}
          </text>
        ))}
      </svg>
    </div>
  )
}
