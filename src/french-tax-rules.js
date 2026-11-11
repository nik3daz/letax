// Baseline French Tax Regex, Cerfa Box Dictionary & Spatial Heuristic Engine
// All UI labels, column names, and explanations are in English while matching French tax documents.

export const DOCUMENT_TYPES = [
  {
    id: 'avis_impot',
    label: "Income Tax Assessment Notice (Avis d'Impôt)",
    shortLabel: "Tax Notice (Avis)",
    category: 'standard',
    color: '#10b981',
    keywords: [
      "avis d'impôt",
      "avis d'imposition",
      'direction générale des finances publiques',
      'revenu fiscal de référence',
      'impôt sur les revenus',
      'numéro fiscal'
    ],
    defaultColumns: [
      'Tax_Year',
      'Tax_ID_SPI',
      'Household_Shares',
      'Gross_Global_Income',
      'Taxable_Income',
      'Net_Income_Tax',
      'Reference_Tax_Income_RFR',
      'Balance_Due'
    ]
  },
  {
    id: 'decl_2042',
    label: 'Income Tax Return Form (Cerfa 2042 / 2042-C)',
    shortLabel: 'Form 2042',
    category: 'standard',
    color: '#3b82f6',
    keywords: [
      '2042',
      'déclaration des revenus',
      'déclaration en ligne',
      'traitements et salaires',
      '1aj',
      '1bj'
    ],
    defaultColumns: [
      'Tax_Year',
      'Tax_ID_SPI',
      '1AJ_Salary_Decl1',
      '1BJ_Salary_Decl2',
      '1AS_Pensions_Decl1',
      '2DC_Dividends',
      '2TR_Fixed_Income_Interest',
      '4BA_Net_Rental_Income',
      '6DE_Deductible_CSG',
      '7UF_Charitable_Donations'
    ]
  },
  {
    id: 'ifu_2561',
    label: 'Single Tax Statement / Investment Income (IFU Cerfa 2561)',
    shortLabel: 'Bank IFU 2561',
    category: 'standard',
    color: '#6366f1',
    keywords: [
      'imprimé fiscal unique',
      '2561',
      'revenus de capitaux mobiliers',
      'justificatif fiscal',
      '2dc',
      '2tr',
      '2ck'
    ],
    defaultColumns: [
      'Tax_Year',
      'Financial_Institution',
      '2DC_Dividends',
      '2TR_Fixed_Income_Interest',
      '2CG_Income_Without_Deductible_CSG',
      '2BH_Income_With_Deductible_CSG',
      '2CK_Prepaid_Tax_Credit_PFU'
    ]
  },
  {
    id: 'bulletin_paie',
    label: 'Payslip / Annual Employee Tax Certificate',
    shortLabel: 'Payslip / Salary',
    category: 'standard',
    color: '#0ea5e9',
    keywords: [
      'bulletin de paie',
      'bulletin de salaire',
      'net imposable',
      'cumul net imposable',
      'net à payer avant impôt',
      'prélèvement à la source'
    ],
    defaultColumns: [
      'Tax_Year',
      'Employer',
      'Annual_Taxable_Net_Salary',
      'Net_Pay',
      'PAS_Withholding_Tax'
    ]
  },
  {
    id: 'taxe_fonciere',
    label: 'Property Tax Notice (Taxe Foncière)',
    shortLabel: 'Property Tax',
    category: 'standard',
    color: '#f59e0b',
    keywords: [
      'taxes foncières',
      'taxe foncière',
      'propriétés bâties',
      'cotisation totale',
      'ordures ménagères'
    ],
    defaultColumns: [
      'Tax_Year',
      'Property_Municipality',
      'Net_Taxable_Base',
      'Waste_Collection_Tax_TEOM',
      'Total_Property_Tax'
    ]
  },
  {
    id: 'facture_charge',
    label: 'Deductible Expense / Tax Credit Certificate (CESU, Charity)',
    shortLabel: 'Certificate / Credit',
    category: 'standard',
    color: '#14b8a6',
    keywords: [
      'attestation fiscale',
      'reçu au titre des dons',
      'services à la personne',
      'crédit d’impôt',
      'cesu',
      'urssaf'
    ],
    defaultColumns: [
      'Tax_Year',
      'Issuing_Organization',
      '7DB_Home_Services_Expenses',
      '7UF_Charitable_Donations',
      'Total_Amount_Paid'
    ]
  },
  {
    id: 'non_standard',
    label: 'Non-Standard / Other Document',
    shortLabel: 'Non-Standard',
    category: 'non_standard',
    color: '#a855f7',
    keywords: [],
    defaultColumns: ['Tax_Year', 'Primary_Amount']
  }
];

// Dictionary of common French Cerfa Tax Box Codes with English explanations
export const CERFA_BOX_DICTIONARY = {
  '1AJ': { column: '1AJ_Salary_Decl1', label: 'Wages & Salaries (Declarant 1)' },
  '1BJ': { column: '1BJ_Salary_Decl2', label: 'Wages & Salaries (Declarant 2)' },
  '1CJ': { column: '1CJ_Salary_Dep1', label: 'Wages & Salaries (Dependent 1)' },
  '1AP': { column: '1AP_Other_Income_Decl1', label: 'Other Taxable Employment Income (Declarant 1)' },
  '1BP': { column: '1BP_Other_Income_Decl2', label: 'Other Taxable Employment Income (Declarant 2)' },
  '1AK': { column: '1AK_Actual_Expenses_Decl1', label: 'Itemized Professional Expenses (Declarant 1)' },
  '1BK': { column: '1BK_Actual_Expenses_Decl2', label: 'Itemized Professional Expenses (Declarant 2)' },
  '1AS': { column: '1AS_Pensions_Decl1', label: 'Pensions, Retirement & Annuities (Declarant 1)' },
  '1BS': { column: '1BS_Pensions_Decl2', label: 'Pensions, Retirement & Annuities (Declarant 2)' },
  '2DC': { column: '2DC_Dividends', label: 'Dividends & Equity Distributions (Eligible for 40% Allowance)' },
  '2TR': { column: '2TR_Fixed_Income_Interest', label: 'Interest & Fixed-Income Investment Returns' },
  '2CG': { column: '2CG_Income_Without_Deductible_CSG', label: 'Investment Income Not Eligible for Deductible CSG' },
  '2BH': { column: '2BH_Income_With_Deductible_CSG', label: 'Investment Income Subject to Social Contributions (With Deductible CSG)' },
  '2CK': { column: '2CK_Prepaid_Tax_Credit_PFU', label: 'Tax Credit Equal to Non-Final Flat Tax Withholding (12.8% PFU)' },
  '2OP': { column: '2OP_Progressive_Scale_Election', label: 'Election for Progressive Income Tax Scale on Investment Income' },
  '3VG': { column: '3VG_Capital_Gains', label: 'Taxable Capital Gains on Securities' },
  '3VH': { column: '3VH_Capital_Losses', label: 'Capital Losses on Securities' },
  '4BE': { column: '4BE_Micro_Foncier_Gross_Rent', label: 'Micro-Foncier: Gross Rental Income (Before 30% Allowance)' },
  '4BA': { column: '4BA_Net_Rental_Income', label: 'Net Taxable Rental Income (Actual Regime / Régime Réel)' },
  '4BB': { column: '4BB_Rental_Deficit_Global', label: 'Rental Deficit Deductible from Overall Global Income' },
  '4BC': { column: '4BC_Rental_Deficit_Carryforward', label: 'Prior Years Rental Deficits Not Yet Deducted' },
  '5HQ': { column: '5HQ_Micro_BNC_Decl1', label: 'Non-Commercial Professional Income (Micro-BNC Gross Receipts)' },
  '5KO': { column: '5KO_Micro_BIC_Sales_Decl1', label: 'Commercial & Industrial Income (Micro-BIC Sales)' },
  '5KP': { column: '5KP_Micro_BIC_Services_Decl1', label: 'Commercial Services Income (Micro-BIC Services)' },
  '6DE': { column: '6DE_Deductible_CSG', label: 'Deductible CSG on Investment & Property Income' },
  '6DD': { column: '6DD_Misc_Deductions', label: 'Miscellaneous Deductions from Global Income' },
  '6NS': { column: '6NS_PER_Retirement_Contrib_Decl1', label: 'PER Retirement Savings Plan Contributions (Declarant 1)' },
  '6NT': { column: '6NT_PER_Retirement_Contrib_Decl2', label: 'PER Retirement Savings Plan Contributions (Declarant 2)' },
  '7UF': { column: '7UF_Charitable_Donations', label: 'Donations to General Interest Charities (66% Tax Reduction)' },
  '7UD': { column: '7UD_Aid_Org_Donations', label: 'Donations to Organizations Helping People in Difficulty (75% Tax Reduction)' },
  '7DB': { column: '7DB_Home_Services_Expenses', label: 'Home Employment / Domestic Services Expenses (50% Tax Credit)' },
  '8HV': { column: '8HV_PAS_Withheld_Decl1', label: 'Pay-As-You-Earn Withholding Tax Already Deducted (Declarant 1)' },
  '8HW': { column: '8HW_PAS_Withheld_Decl2', label: 'Pay-As-You-Earn Withholding Tax Already Deducted (Declarant 2)' }
};

// Standard Named Anchor Rules for French Tax Docs (English columns & labels)
export const BUILTIN_EXTRACTION_RULES = [
  {
    id: 'rule_rfr',
    column: 'Reference_Tax_Income_RFR',
    label: 'Reference Tax Income (Revenu Fiscal de Référence / RFR)',
    docTypes: ['avis_impot', 'decl_2042'],
    pattern: /(?:revenu\s+fiscal\s+de\s+r[ée]f[ée]rence|r\.?f\.?r\.?)[^\d\n\r-]{0,45}(-?\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_rbg',
    column: 'Gross_Global_Income',
    label: 'Gross Global Income (Revenu Brut Global)',
    docTypes: ['avis_impot', 'decl_2042'],
    pattern: /revenu\s+brut\s+global[^\d\n\r-]{0,45}(-?\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_rev_imposable',
    column: 'Taxable_Income',
    label: 'Net Taxable Income (Revenu Imposable)',
    docTypes: ['avis_impot', 'decl_2042'],
    pattern: /revenu\s+imposable[^\d\n\r-]{0,45}(-?\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_impot_net',
    column: 'Net_Income_Tax',
    label: 'Net Income Tax Before Credits (Impôt sur le Revenu Net)',
    docTypes: ['avis_impot'],
    pattern: /(?:imp[ôo]t\s+sur\s+les?\s+revenus?\s+net|imp[ôo]t\s+net\s+avant\s+cr[ée]dits?)[^\d\n\r-]{0,45}(-?\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_solde_payer',
    column: 'Balance_Due',
    label: 'Balance Due / Amount Payable (Solde à Payer)',
    docTypes: ['avis_impot'],
    pattern: /(?:montant\s+net\s+[àa]\s+payer|solde\s+[àa]\s+payer|somme\s+qu['’]il\s+vous\s+reste\s+[àa]\s+payer|montant\s+de\s+votre\s+imp[ôo]t)[^\d\n\r-]{0,45}(-?\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_parts',
    column: 'Household_Shares',
    label: 'Number of Household Tax Shares (Nombre de Parts)',
    docTypes: ['avis_impot', 'decl_2042'],
    pattern: /nombre\s+de\s+parts[^\d\n\r]{0,35}(\d+(?:[,.]\d{1,2})?)/i,
    type: 'number'
  },
  {
    id: 'rule_num_fiscal',
    column: 'Tax_ID_SPI',
    label: 'French Tax ID Number (Numéro Fiscal / SPI)',
    docTypes: ['avis_impot', 'decl_2042', 'taxe_fonciere'],
    pattern: /(?:num[ée]ro\s+fiscal(?:\s+de\s+r[ée]f[ée]rence)?|n[°º]\s*fiscal)[^\d\n\r]{0,25}(\d[\d\s\u00A0]{11,16}\d)/i,
    type: 'identifier'
  },
  {
    id: 'rule_annee',
    column: 'Tax_Year',
    label: 'Income Tax Year (Année des Revenus)',
    docTypes: ['avis_impot', 'decl_2042', 'ifu_2561', 'bulletin_paie', 'taxe_fonciere', 'facture_charge', 'non_standard'],
    pattern: /(?:revenus\s+(?:de\s+l['’]ann[ée]e\s+)?|ann[ée]e\s+des\s+revenus\s*[:\s]*|au\s+titre\s+de\s+l['’]ann[ée]e\s+|exercice\s+)(202[0-9])/i,
    type: 'year'
  },
  {
    id: 'rule_cumul_net_imposable',
    column: 'Annual_Taxable_Net_Salary',
    label: 'Annual Cumulative Taxable Net Salary (Cumul Net Imposable)',
    docTypes: ['bulletin_paie'],
    pattern: /(?:cumul\s+net\s+imposable|net\s+imposable\s+annuel|r[ée]mun[ée]ration\s+nette\s+imposable)[^\d\n\r-]{0,40}(\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_net_a_payer',
    column: 'Net_Pay',
    label: 'Net Pay (Net à Payer)',
    docTypes: ['bulletin_paie'],
    pattern: /(?:net\s+[àa]\s+payer(?:\s+au\s+salari[ée])?)[^\d\n\r-]{0,40}(\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_pas_source',
    column: 'PAS_Withholding_Tax',
    label: 'Withholding Tax at Source (Prélèvement à la Source)',
    docTypes: ['bulletin_paie', 'avis_impot'],
    pattern: /(?:pr[ée]l[èe]vement\s+[àa]\s+la\s+source|retenue\s+[àa]\s+la\s+source)[^\d\n\r-]{0,45}(\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_taxe_fonciere_total',
    column: 'Total_Property_Tax',
    label: 'Total Property Tax Payable (Montant Taxe Foncière)',
    docTypes: ['taxe_fonciere'],
    pattern: /(?:montant\s+de\s+vos\s+taxes\s+fonci[èe]res|cotisation\s+totale|montant\s+[àa]\s+payer)[^\d\n\r-]{0,45}(\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_teom',
    column: 'Waste_Collection_Tax_TEOM',
    label: 'Household Waste Collection Tax (TEOM / Ordures Ménagères)',
    docTypes: ['taxe_fonciere'],
    pattern: /(?:ordures\s+m[ée]nag[èe]res|teom)[^\d\n\r-]{0,45}(\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_base_fonciere',
    column: 'Net_Taxable_Base',
    label: 'Net Taxable Property Base (Base Nette Imposable)',
    docTypes: ['taxe_fonciere'],
    pattern: /base\s+nette\s+imposable[^\d\n\r-]{0,45}(\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  },
  {
    id: 'rule_total_ttc',
    column: 'Total_Amount_Paid',
    label: 'Total Amount Paid / Invoiced (Montant Total)',
    docTypes: ['facture_charge', 'non_standard'],
    pattern: /(?:montant\s+total(?:\s+ttc)?|total\s+des\s+sommes\s+vers[ée]es|somme\s+de|net\s+[àa]\s+payer\s+ttc)[^\d\n\r-]{0,45}(\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/i,
    type: 'amount'
  }
];

/**
 * Normalize a French formatted number string into a clean float or integer.
 * Examples:
 *  "42 150,50 €" -> 42150.5
 *  "12.345,00"   -> 12345
 *  "1 250"       -> 1250
 */
export function parseFrenchNumber(rawStr) {
  if (!rawStr) return null;
  let cleaned = String(rawStr)
    .replace(/[€$£%]/g, '')
    .replace(/[\s\u00A0\u202F]/g, '')
    .trim();

  // Handle dot thousand separators when comma decimal is present (e.g. 12.345,67)
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function formatFrenchNumber(num) {
  if (num === null || num === undefined || num === '') return '';
  const n = Number(num);
  if (!Number.isFinite(n)) return String(num);
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2
  }).format(n);
}

/**
 * Classify a token box into 'cerfa_code', 'amount', 'number', 'year', or 'text'
 */
export function classifyTokenBox(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return 'text';

  // Exact or parenthesized 3-char Cerfa box code (e.g. 1AJ, (2DC), Case 6DE)
  const cerfaMatch = trimmed.match(/^\(?([1-8][A-Z]{2})\)?$/);
  if (cerfaMatch && CERFA_BOX_DICTIONARY[cerfaMatch[1]]) {
    return 'cerfa_code';
  }

  // Contains Euro symbol or French formatted currency number
  if (
    /(?:^|\s)-?\d{1,3}(?:[\s\u00A0.]\d{3})+(?:[,.]\d{1,2})?\s*€?$/.test(trimmed) ||
    /-?\d+(?:[,.]\d{1,2})?\s*€/.test(trimmed)
  ) {
    return 'amount';
  }

  // Standalone multi-digit number
  if (/^-?\d{2,7}(?:[,.]\d{1,2})?$/.test(trimmed)) {
    if (/^20[12]\d$/.test(trimmed)) return 'year';
    return 'number';
  }

  return 'text';
}

/**
 * Find the best matching bounding box token for an extracted value & context snippet
 */
export function findBestTokenBox(tokens, rawValue, lineText = '') {
  if (!tokens || !tokens.length || !rawValue) return null;
  const targetClean = String(rawValue).replace(/[\s\u00A0€]/g, '');
  if (!targetClean) return null;

  // 1. Direct substring match on token text (normalized)
  const candidates = tokens.filter((t) => {
    const tClean = (t.text || '').replace(/[\s\u00A0€]/g, '');
    return tClean && (tClean === targetClean || tClean.includes(targetClean) || targetClean.includes(tClean));
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1 && lineText) {
    // Pick candidate whose line context overlaps most
    const lineWords = lineText.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    let best = candidates[0];
    let bestScore = -1;
    for (const c of candidates) {
      const nearby = tokens.filter(
        (other) => other.page === c.page && Math.abs(other.y - c.y) < 2.5
      );
      const joined = nearby.map((n) => n.text.toLowerCase()).join(' ');
      let score = 0;
      for (const w of lineWords) {
        if (joined.includes(w)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  return candidates[0] || null;
}

/**
 * Run the full baseline French Tax analysis on extracted document text + tokens
 */
export function analyzeFrenchTaxDocument(fullText, tokens = [], customRules = [], avgOcrConfidence = 98) {
  const lower = (fullText || '').toLowerCase();

  // 1. Score Document Types
  let bestDocType = DOCUMENT_TYPES.find((d) => d.id === 'non_standard');
  let bestScore = 0;

  for (const docType of DOCUMENT_TYPES) {
    if (docType.id === 'non_standard') continue;
    let score = 0;
    for (const kw of docType.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += kw.length > 5 ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDocType = docType;
    }
  }

  // 2. Scan lines for all detected numbers, amounts, and Cerfa box codes
  const lines = (fullText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const detectedEntities = [];
  const extractedFieldsMap = new Map();

  // Helper to add or update an extracted field
  const registerField = ({
    column,
    label,
    rawValue,
    normalizedValue,
    sourceMethod,
    confidence = 0.92,
    cerfaCode = null,
    contextLine = ''
  }) => {
    if (!column || rawValue === undefined || rawValue === null) return;
    const matchedBox = findBestTokenBox(tokens, rawValue, contextLine);
    const existing = extractedFieldsMap.get(column);
    if (!existing || confidence > existing.confidence) {
      extractedFieldsMap.set(column, {
        id: `field_${column}_${Math.random().toString(36).slice(2, 7)}`,
        column,
        label: label || column,
        rawValue: String(rawValue).trim(),
        value: normalizedValue !== null && normalizedValue !== undefined ? normalizedValue : String(rawValue).trim(),
        sourceMethod,
        confidence,
        cerfaCode,
        verified: false,
        contextLine: contextLine.slice(0, 140),
        boxId: matchedBox ? matchedBox.id : null,
        page: matchedBox ? matchedBox.page : 1
      });
    }
  };

  // 2A. Extract Cerfa Box codes (e.g., "1AJ ... 42 150" or "Case 2DC : 1 250 €")
  const cerfaLineRegex = /\b([1-8][A-Z]{2})\b[^\d\n\r-]{0,55}(-?\d{1,3}(?:[\s\u00A0.]\d{3})*(?:[,.]\d{1,2})?)/g;
  for (const line of lines) {
    let m;
    cerfaLineRegex.lastIndex = 0;
    while ((m = cerfaLineRegex.exec(line)) !== null) {
      const code = m[1].toUpperCase();
      const rawNum = m[2].trim();
      const dictEntry = CERFA_BOX_DICTIONARY[code];
      const numVal = parseFrenchNumber(rawNum);
      if (numVal !== null) {
        const matchedBox = findBestTokenBox(tokens, rawNum, line);
        detectedEntities.push({
          id: `ent_${Math.random().toString(36).slice(2, 8)}`,
          kind: 'cerfa_code',
          code,
          label: dictEntry ? `${code} — ${dictEntry.label}` : `Cerfa Box ${code}`,
          suggestedColumn: dictEntry ? dictEntry.column : `Box_${code}`,
          rawValue: rawNum,
          value: numVal,
          contextLine: line,
          boxId: matchedBox?.id || null,
          page: matchedBox?.page || 1
        });

        if (dictEntry) {
          registerField({
            column: dictEntry.column,
            label: `${code} — ${dictEntry.label}`,
            rawValue: rawNum,
            normalizedValue: numVal,
            sourceMethod: 'Cerfa Regex',
            confidence: 0.95,
            cerfaCode: code,
            contextLine: line
          });
        }
      }
    }

    // Also scan every French currency / significant number on this line for the "Numbers & Codes" tab
    const amountRegex = /(-?\d{1,3}(?:[\s\u00A0.]\d{3})+(?:[,.]\d{1,2})?(?:\s*€)?|-?\d+(?:[,.]\d{1,2})?\s*€)/g;
    let am;
    while ((am = amountRegex.exec(line)) !== null) {
      const rawAmt = am[1].trim();
      const numVal = parseFrenchNumber(rawAmt);
      if (numVal === null) continue;
      // Avoid duplicating if it looks like a 4-digit year without €
      if (!rawAmt.includes('€') && numVal >= 1990 && numVal <= 2035 && rawAmt.replace(/\s/g, '').length === 4) {
        continue;
      }
      const matchedBox = findBestTokenBox(tokens, rawAmt, line);
      const labelGuess = line
        .replace(rawAmt, '')
        .replace(/[.:…_|-]+/g, ' ')
        .trim()
        .slice(0, 65);
      detectedEntities.push({
        id: `ent_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'amount',
        code: null,
        label: labelGuess || 'Detected Amount',
        suggestedColumn: slugifyColumnName(labelGuess || 'Extracted_Amount'),
        rawValue: rawAmt,
        value: numVal,
        contextLine: line,
        boxId: matchedBox?.id || null,
        page: matchedBox?.page || 1
      });
    }
  }

  // 2B. Run Built-in + Custom Anchor Regex Rules
  const allRules = [...BUILTIN_EXTRACTION_RULES, ...(customRules || [])];
  for (const rule of allRules) {
    let regex = rule.pattern;
    if (typeof regex === 'string') {
      try {
        regex = new RegExp(regex, 'i');
      } catch {
        continue;
      }
    }
    const match = fullText.match(regex);
    if (match && match[1]) {
      const rawVal = match[1].trim();
      let normVal = rawVal;
      if (rule.type === 'amount' || rule.type === 'number') {
        const parsed = parseFrenchNumber(rawVal);
        if (parsed !== null) normVal = parsed;
      } else if (rule.type === 'identifier') {
        normVal = rawVal.replace(/[\s\u00A0]/g, '');
      }
      const matchLine = lines.find((l) => l.includes(rawVal)) || match[0];
      registerField({
        column: rule.column,
        label: rule.label || rule.column,
        rawValue: rawVal,
        normalizedValue: normVal,
        sourceMethod: rule.isCustom ? 'Custom Rule' : 'Regex Rule',
        confidence: 0.9,
        contextLine: matchLine
      });
    }
  }

  // Fallback year detection if Tax_Year wasn't caught
  if (!extractedFieldsMap.has('Tax_Year')) {
    const yearMatch = fullText.match(/\b(202[1-6])\b/);
    if (yearMatch) {
      registerField({
        column: 'Tax_Year',
        label: 'Detected Tax Year',
        rawValue: yearMatch[1],
        normalizedValue: Number(yearMatch[1]),
        sourceMethod: 'Heuristic',
        confidence: 0.75,
        contextLine: `Detected year: ${yearMatch[1]}`
      });
    }
  }

  const extractedFields = Array.from(extractedFieldsMap.values());

  // Mark matched tokens so the PDF overlay can highlight them in Emerald
  const matchedBoxIds = new Set(extractedFields.map((f) => f.boxId).filter(Boolean));
  for (const t of tokens) {
    t.isMapped = matchedBoxIds.has(t.id);
  }

  // 3. Determine Triage Status ('standard' | 'needs_review' | 'non_standard')
  let triageStatus = 'non_standard';
  if (bestDocType.id !== 'non_standard' && extractedFields.length >= 3 && avgOcrConfidence >= 80) {
    triageStatus = 'standard';
  } else if (bestDocType.id !== 'non_standard' || extractedFields.length >= 2) {
    triageStatus = 'needs_review';
  }

  return {
    docType: bestDocType.id,
    docTypeLabel: bestDocType.label,
    triageStatus,
    extractedFields,
    detectedEntities: deduplicateEntities(detectedEntities)
  };
}

function deduplicateEntities(entities) {
  const seen = new Set();
  const out = [];
  for (const e of entities) {
    const key = `${e.kind}|${e.rawValue}|${e.contextLine.slice(0, 40)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

export function slugifyColumnName(str) {
  if (!str) return 'Extracted_Field';
  const cleaned = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  return cleaned || 'Amount';
}
