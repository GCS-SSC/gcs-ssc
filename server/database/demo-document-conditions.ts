import PizZip from 'pizzip'

const xmlText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const paragraph = (text: string, numbered = false): string => `<w:p><w:pPr>${numbered ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}<w:spacing w:after="120"/></w:pPr><w:r><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r></w:p>`

/**
 * Creates a sample whose two-year Agreement produces continuous numbering after exclusions.
 * @param language - Demo template language.
 * @returns A Word template containing all supported condition operators.
 */
export const createDemoConditionTemplate = (language: 'en' | 'fr'): Buffer => {
  const french = language === 'fr'
  const clauses: Array<[string, string, string]> = [
    ['stream.name = \'Core Stream\' or stream.name = \'Volet principal\'', 'Core stream reporting applies.', 'Les rapports du volet principal s’appliquent.'],
    ['budget.fiscalYearCount = 2', 'Equal: submit two annual reports.', 'Égal : présentez deux rapports annuels.'],
    ['budget.fiscalYearCount != 2', 'Not equal: use the alternative reporting schedule.', 'Différent : utilisez l’autre calendrier de rapports.'],
    ['budget.fiscalYearCount != 0', 'Not equal: an annual reporting schedule is required.', 'Différent : un calendrier de rapports annuels est requis.'],
    ['budget.fiscalYearCount >= 2', 'Greater than or equal: retain two-year reporting records.', 'Supérieur ou égal : conservez les dossiers de rapports de deux ans.'],
    ['budget.fiscalYearCount <= 2', 'Less than or equal: the maximum two-year schedule applies.', 'Inférieur ou égal : le calendrier maximal de deux ans s’applique.'],
    ['budget.fiscalYearCount > 1', 'Greater than: provide a multi-year summary.', 'Supérieur : fournissez un sommaire pluriannuel.'],
    ['budget.fiscalYearCount >= 3', 'Greater than or equal: arrange a third-year review.', 'Supérieur ou égal : prévoyez un examen de troisième année.'],
    ['budget.fiscalYearCount < 3', 'Less than: use the short reporting schedule.', 'Inférieur : utilisez le calendrier abrégé.'],
    ['budget.fiscalYearCount <= 1', 'Less than or equal: submit a single-year report.', 'Inférieur ou égal : présentez un rapport d’une seule année.'],
    ['budget.fiscalYearCount >= 2 and budget.fiscalYearCount <= 2', 'And: both two-year limits are satisfied.', 'And : les deux limites de deux ans sont respectées.'],
    ['budget.fiscalYearCount = 1 or budget.fiscalYearCount = 2', 'Or: the one-year or two-year schedule applies.', 'Or : le calendrier d’un an ou de deux ans s’applique.'],
    ['budget.fiscalYearCount = 2 or budget.fiscalYearCount = 1 and budget.fiscalYearCount > 3', 'Precedence: and is evaluated before or.', 'Priorité : and est évalué avant or.'],
    ['(budget.fiscalYearCount = 2 or budget.fiscalYearCount = 1) and budget.fiscalYearCount > 3', 'Parentheses: this alternative requires more than three years.', 'Parenthèses : cette option exige plus de trois ans.'],
    ['((budget.fiscalYearCount = 2 or budget.fiscalYearCount = 1) and budget.fiscalYearCount < 3)', 'Parentheses: the grouped short schedule applies.', 'Parenthèses : le calendrier abrégé regroupé s’applique.']
  ]
  const body = [
    paragraph(french ? 'Exemple de clauses conditionnelles' : 'Conditional clauses example'),
    paragraph(french ? 'Entente : {{ agreement.number }} — {{ agreement.title }}' : 'Agreement: {{ agreement.number }} — {{ agreement.title }}'),
    paragraph(french ? 'Exercices : {{ budget.fiscalYearCount }}' : 'Fiscal years: {{ budget.fiscalYearCount }}'),
    paragraph(french ? 'Conservez les pièces justificatives.' : 'Retain supporting records.', true),
    ...clauses.flatMap(([condition, en, fr]) => [paragraph(`{{#if ${condition}}}`), paragraph(french ? fr : en, true), paragraph('{{/if}}')]),
    paragraph(french ? 'Signez l’entente{{#if budget.fiscalYearCount > 1}} et le sommaire pluriannuel{{/if}}.' : 'Sign the agreement{{#if budget.fiscalYearCount > 1}} and the multi-year summary{{/if}}.', true)
  ].join('')
  const zip = new PizZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>')
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>')
  zip.file('word/numbering.xml', '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`)
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}
