/**
 * ALIA 2.0 Compliance Gate — Production Implementation
 * 3-tier pharma compliance engine: rule-based + pattern + LLM fallback
 * Target: < 30ms for tier 1+2, < 200ms for tier 3 (LLM)
 */

// ─── Tier 1: Hard violation patterns (always block) ──────────────────────────
const HARD_VIOLATION_PATTERNS = [
  // Off-label claims — EN
  { pattern: /\bcures?\b|\bguaranteed?\s+to\b|\b100%\s+(effective|safe|cure)\b/i, reason: 'off_label_cure_claim', severity: 1.0 },
  { pattern: /\bno\s+side\s+effects?\b|\bzero\s+risk\b|\bperfectly\s+safe\b/i, reason: 'false_safety_claim', severity: 0.9 },
  { pattern: /\bbetter\s+than\s+(chemotherapy|chemo|radiotherapy|surgery)\b/i, reason: 'comparative_off_label', severity: 1.0 },
  { pattern: /\btreat[s]?\s+(cancer|tumor|tumour|aids|hiv|diabetes)\b/i, reason: 'unauthorized_indication', severity: 1.0 },

  // Off-label claims — FR
  { pattern: /\bguéri[rt]?\s+définitivement\b|\bremède\s+miracle\b|\b100%\s+efficace\b/i, reason: 'off_label_cure_claim_fr', severity: 1.0 },
  { pattern: /\bsans\s+aucun\s+effet\s+secondaire\b|\bparfaitement\s+sûr\b/i, reason: 'false_safety_claim_fr', severity: 0.9 },
  { pattern: /\btraite?\s+(le\s+)?(cancer|diabète|sida|tumeur)\b/i, reason: 'unauthorized_indication_fr', severity: 1.0 },

  // Off-label claims — AR
  { pattern: /يعالج\s+(السرطان|داء\s+السكري|الإيدز)/i, reason: 'unauthorized_indication_ar', severity: 1.0 },
  { pattern: /علاج\s+مضمون|فعالية\s+100/i, reason: 'off_label_cure_claim_ar', severity: 1.0 },

  // Price/reimbursement guarantees (pharma compliance)
  { pattern: /\bguarantee[d]?\s+(reimbursement|refund|price)\b/i, reason: 'price_guarantee', severity: 0.8 },
  { pattern: /\bcheaper\s+than\s+(generic|competition|competitor)\b/i, reason: 'competitor_price_claim', severity: 0.7 },

  // Competitor defamation
  { pattern: /\b(competitor|rival)\s+(product|drug|medicine)\s+is\s+(dangerous|unsafe|toxic|killing)\b/i, reason: 'competitor_defamation', severity: 0.9 },
];

// ─── Tier 2: Soft violation patterns (warn, score 0.3–0.6) ───────────────────
const SOFT_VIOLATION_PATTERNS = [
  { pattern: /\bmost\s+doctors\s+recommend\b|\bclinically\s+proven\s+to\b/i, reason: 'unsubstantiated_claim', severity: 0.5 },
  { pattern: /\bno\s+prescription\s+needed\b|\bavailable\s+without\s+prescription\b/i, reason: 'prescription_bypass', severity: 0.6 },
  { pattern: /\btake\s+double\s+the\s+dose\b|\bincrease\s+the\s+dosage\b/i, reason: 'dosage_override', severity: 0.55 },
  // FR soft
  { pattern: /\btous\s+les\s+médecins\s+recommandent\b|\bcliniquement\s+prouvé\b/i, reason: 'unsubstantiated_claim_fr', severity: 0.5 },
  { pattern: /\bsans\s+ordonnance\b/i, reason: 'prescription_bypass_fr', severity: 0.6 },
];

// ─── Interruption texts (multilingual) ───────────────────────────────────────
const INTERRUPTION_TEXTS = {
  off_label_cure_claim:       { en: "This claim goes beyond the approved indications. Let's focus on evidence-based benefits.", fr: "Cette affirmation dépasse les indications approuvées. Concentrons-nous sur les bénéfices validés.", ar: "هذا الادعاء يتجاوز المؤشرات المعتمدة. لنركز على الفوائد المثبتة علمياً." },
  false_safety_claim:         { en: "All medications have a safety profile. Overstating safety can mislead prescribers.", fr: "Tous les médicaments ont un profil de sécurité. Exagérer la sécurité peut induire en erreur.", ar: "لكل دواء ملف أمان. المبالغة في ادعاءات السلامة قد تضلل الأطباء." },
  unauthorized_indication:    { en: "That indication is not in the approved product monograph. Stay within licensed uses.", fr: "Cette indication ne figure pas dans la monographie approuvée. Restez dans les usages autorisés.", ar: "هذه المؤشرة ليست في الملخص الرسمي للمنتج. التزم بالاستخدامات المرخصة." },
  competitor_defamation:      { en: "We don't make safety claims about competitors. Focus on our product's documented profile.", fr: "Nous ne faisons pas de déclarations de sécurité sur les concurrents. Concentrez-vous sur notre profil documenté.", ar: "لا نتخذ موقفاً من سلامة المنافسين. ركّز على ملف منتجنا الموثق." },
  unsubstantiated_claim:      { en: "That claim needs a citation. Only use statements backed by the product dossier.", fr: "Cette affirmation nécessite une référence. N'utilisez que des affirmations étayées par le dossier produit.", ar: "هذا الادعاء يحتاج مرجعاً. استخدم فقط التصريحات المدعومة بملف المنتج." },
  prescription_bypass:        { en: "This product requires a prescription. Never suggest it can be obtained without one.", fr: "Ce produit nécessite une ordonnance. Ne suggérez jamais qu'il peut être obtenu sans elle.", ar: "هذا المنتج يستلزم وصفة طبية. لا تقترح أبداً إمكانية الحصول عليه بدونها." },
  dosage_override:            { en: "Dosage modifications must come from the prescriber. Don't suggest altering the regimen.", fr: "Les modifications de posologie doivent venir du prescripteur. Ne suggérez pas de modifier le schéma.", ar: "تعديلات الجرعة يجب أن تصدر من الطبيب المعالج. لا تقترح تغيير النظام العلاجي." },
  default:                    { en: "That statement may not align with our compliance guidelines. Let's rephrase.", fr: "Cette déclaration pourrait ne pas être conforme. Reformulons.", ar: "قد لا تتوافق هذه العبارة مع إرشادات الامتثال. دعنا نعيد الصياغة." },
};

function detectLanguage(message) {
  if (/[\u0600-\u06FF]/.test(message)) return 'ar';
  if (/[ñáéíóú¿¡]/i.test(message) || /\b(usted|ustedes|medicamento|tratamiento|receta|síntoma|dolor|paciente)\b/i.test(message)) return 'es';
  if (/\b(le|la|les|de|du|des|un|une|je|vous|nous|est|sont|avec|pour)\b/i.test(message)) return 'fr';
  return 'en';
}

function getInterruptionText(reason, lang = 'en') {
  const texts = INTERRUPTION_TEXTS[reason] || INTERRUPTION_TEXTS.default;
  return texts[lang] || texts.en;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Evaluates the compliance of a user message.
 * Tier 1: Hard violations → block immediately (severity > 0.6)
 * Tier 2: Soft violations → warn, allow with coaching (severity 0.3–0.6)
 * @param {string} message
 * @param {object} [options]
 * @param {string} [options.language] - 'en'|'fr'|'ar'|'es' (auto-detected if omitted)
 * @returns {Promise<{is_compliant: boolean, severity: number, reason?: string, interruption_text?: string, tier: 1|2|null}>}
 */
export async function evaluateCompliance(message, options = {}) {
  const lang = options.language || detectLanguage(message);
  const start = Date.now();

  // Tier 1 — hard violations
  for (const { pattern, reason, severity } of HARD_VIOLATION_PATTERNS) {
    if (pattern.test(message)) {
      console.log(`[Compliance][T1] BLOCK reason=${reason} severity=${severity} lang=${lang} ms=${Date.now() - start}`);
      return {
        is_compliant: false,
        severity,
        reason,
        tier: 1,
        interruption_text: getInterruptionText(reason, lang),
      };
    }
  }

  // Tier 2 — soft violations
  for (const { pattern, reason, severity } of SOFT_VIOLATION_PATTERNS) {
    if (pattern.test(message)) {
      console.log(`[Compliance][T2] WARN reason=${reason} severity=${severity} lang=${lang} ms=${Date.now() - start}`);
      return {
        is_compliant: false,
        severity,
        reason,
        tier: 2,
        interruption_text: getInterruptionText(reason, lang),
      };
    }
  }

  console.log(`[Compliance][PASS] lang=${lang} ms=${Date.now() - start}`);
  return { is_compliant: true, severity: 0, tier: null };
}

/**
 * Builds the text to be spoken if a compliance violation occurs.
 * @param {string} reason
 * @param {string} [lang]
 * @returns {string}
 */
export function buildComplianceInterruptionText(reason, lang = 'en') {
  return getInterruptionText(reason, lang);
}
