// On-Device Sample French Tax Document Generator
// Generates realistic digital PDFs (via jsPDF) + a simulated scanned document (PNG)
// so users can immediately test PDF.js native extraction, Tesseract French OCR, and Triage.

export async function generateSampleFrenchTaxFiles() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    throw new Error('jsPDF library is not loaded');
  }

  const files = [];

  // 1. Standard Digital PDF: Avis d'Impôt sur les Revenus (2026 sur revenus 2025)
  {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('DIRECTION GENERALE DES FINANCES PUBLIQUES', 40, 48);
    doc.setFontSize(18);
    doc.text("AVIS D'IMPOT 2026", 40, 75);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text("Impôt sur les revenus de l'année 2025", 40, 95);

    doc.setDrawColor(180);
    doc.rect(38, 112, 515, 72);
    doc.setFontSize(10);
    doc.text('Numéro fiscal : 12 34 567 890 123', 50, 132);
    doc.text('Nombre de parts : 2,5', 50, 150);
    doc.text('Contribuables : M. MARTIN JEAN et MME MARTIN CLAIRE', 50, 168);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DETAIL DES REVENUS DECLARES', 40, 215);
    doc.line(40, 222, 550, 222);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const rows = [
      ['Traitements et salaires Déclarant 1 (1AJ)', '54 800 €'],
      ['Traitements et salaires Déclarant 2 (1BJ)', '38 450 €'],
      ['Revenus des actions et parts - Dividendes (2DC)', '3 200 €'],
      ['Intérêts et produits de placement à revenu fixe (2TR)', '890 €'],
      ['CSG déductible calculée (6DE)', '412 €'],
      ['Revenu brut global', '83 925 €'],
      ['Revenu imposable', '83 513 €'],
      ['Impôt sur les revenus net avant crédits', '7 420 €'],
      ['Prélèvement à la source déjà retenu (8HV)', '6 980 €'],
      ['Solde à payer au 15/09/2026', '440 €']
    ];

    let y = 246;
    for (const [label, val] of rows) {
      doc.text(label, 48, y);
      doc.setFont('helvetica', 'bold');
      doc.text(val, 460, y);
      doc.setFont('helvetica', 'normal');
      y += 26;
    }

    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(1.5);
    doc.rect(38, 520, 515, 48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Revenu fiscal de référence (RFR) : 87 125 €', 50, 549);

    const arrayBuffer = doc.output('arraybuffer');
    files.push({
      name: '01_Avis_Impot_2026_Revenus_2025_Martin.pdf',
      type: 'application/pdf',
      buffer: arrayBuffer
    });
  }

  // 2. Standard Digital PDF: IFU / Imprimé Fiscal Unique 2561 (Banque)
  {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('IMPRIME FISCAL UNIQUE (CERFA 2561)', 40, 55);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text("Relevé des Revenus de Capitaux Mobiliers - Année des revenus 2025", 40, 78);
    doc.text('Etablissement payeur : BANQUE POPULAIRE RIVES DE PARIS', 40, 98);
    doc.text('Titulaire : M. JEAN MARTIN', 40, 116);

    doc.line(40, 132, 550, 132);
    doc.setFont('helvetica', 'bold');
    doc.text('Rubriques Déclaration 2042', 45, 155);
    doc.text('Code Case', 360, 155);
    doc.text('Montant à déclarer', 450, 155);
    doc.line(40, 163, 550, 163);

    doc.setFont('helvetica', 'normal');
    const ifuRows = [
      ['Revenus des actions et parts ouvrant droit à abattement', '2DC', '3 200 €'],
      ['Produits de placement à revenu fixe (intérêts livrets fiscalisés)', '2TR', '890 €'],
      ['Revenus déjà soumis aux prélèvements sociaux avec CSG déductible', '2BH', '4 090 €'],
      ["Crédit d'impôt égal au prélèvement forfaitaire non libératoire (12,8%)", '2CK', '524 €']
    ];

    let y = 190;
    for (const [desc, code, amt] of ifuRows) {
      doc.text(desc, 45, y);
      doc.setFont('helvetica', 'bold');
      doc.text(code, 370, y);
      doc.text(amt, 465, y);
      doc.setFont('helvetica', 'normal');
      y += 30;
    }

    const arrayBuffer = doc.output('arraybuffer');
    files.push({
      name: '02_IFU_2561_Banque_Populaire_2025.pdf',
      type: 'application/pdf',
      buffer: arrayBuffer
    });
  }

  // 3. Simulated Scanned PNG Image: Attestation Fiscale CESU / Emploi à domicile (Tests Tesseract OCR!)
  {
    const canvas = document.createElement('canvas');
    canvas.width = 1100;
    canvas.height = 760;
    const ctx = canvas.getContext('2d');

    // Warm paper background with subtle scan noise
    ctx.fillStyle = '#fcfbf7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Slight paper border
    ctx.strokeStyle = '#d6d3c9';
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('URSSAF - CENTRE NATIONAL CESU', 65, 95);

    ctx.font = 'bold 24px Arial';
    ctx.fillText("ATTESTATION FISCALE ANNUELLE - EXERCICE 2025", 65, 145);

    ctx.font = '20px Arial';
    ctx.fillText("Services à la personne / Emploi d'un salarié à domicile", 65, 185);
    ctx.fillText('Bénéficiaire : M. JEAN MARTIN', 65, 225);

    ctx.beginPath();
    ctx.moveTo(65, 255);
    ctx.lineTo(1020, 255);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '21px Arial';
    ctx.fillText('Salaires nets versés en 2025 :', 75, 315);
    ctx.font = 'bold 22px Arial';
    ctx.fillText('4 120 €', 740, 315);

    ctx.font = '21px Arial';
    ctx.fillText('Cotisations sociales versées :', 75, 365);
    ctx.font = 'bold 22px Arial';
    ctx.fillText('1 730 €', 740, 365);

    ctx.font = 'bold 22px Arial';
    ctx.fillText("Dépenses d'emploi à domicile à reporter case 7DB :", 75, 435);
    ctx.fillText('5 850 €', 740, 435);

    ctx.font = '20px Arial';
    ctx.fillText('Montant total des sommes versées en 2025 : 5 850 €', 75, 505);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const buffer = await blob.arrayBuffer();
    files.push({
      name: '03_Scan_Attestation_CESU_Emploi_Domicile_2025.png',
      type: 'image/png',
      buffer
    });
  }

  // 4. Non-Standard PDF Document: Facture / Décompte Travaux & Honoraires Foncier Locatif
  {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('CABINET D’ARCHITECTURE & GESTION PATRIMONIALE LEROY', 40, 55);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('14 Rue de la République, 69002 LYON — SIRET 812 944 102 00018', 40, 73);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('RECAPITULATIF TRAVAUX DEDUCTIBLES — BIEN LOCATIF LYON', 40, 115);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Client : M. et Mme MARTIN — Référence dossier : LYON-2025-88B', 40, 136);
    doc.text('Date du relevé : 18/12/2025', 40, 154);

    doc.line(40, 172, 550, 172);
    const items = [
      ['Réfection toiture et zinguerie (Facture Entreprise Dupuis)', '6 480,00 €'],
      ['Remplacement chaudière gaz condensation', '3 920,50 €'],
      ['Honoraires de maîtrise d’œuvre et diagnostic énergétique', '1 150,00 €'],
      ['Primes d’assurance propriétaire non-occupant (PNO)', '345,00 €'],
      ['Total charges travaux fonciers 2025', '11 895,50 €']
    ];

    let y = 200;
    for (const [label, amt] of items) {
      doc.text(label, 48, y);
      doc.setFont('helvetica', 'bold');
      doc.text(amt, 455, y);
      doc.setFont('helvetica', 'normal');
      y += 28;
    }

    doc.setFontSize(9);
    doc.text(
      'Note : Document non-standardisé Cerfa. A ventiler dans la déclaration des revenus fonciers (2044 / 4BA).',
      40,
      370
    );

    const arrayBuffer = doc.output('arraybuffer');
    files.push({
      name: '04_NonStandard_Decompte_Travaux_Locatif_2025.pdf',
      type: 'application/pdf',
      buffer: arrayBuffer
    });
  }

  return files;
}
