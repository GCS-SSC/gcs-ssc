/**
 * DBML Exporter (with optional TableGroup / Enum output)
 * - Preserves varchar(n), char(n), numeric(p,s), citext, jsonb, etc.
 * - Export all sheets
 * - Export current sheet
 * - Export current sheet tables only (no enums, no table groups)
 * - On ALL Sheets export, appends Triggers / Functions sheet contents as multiline comments
 *
 * UPDATED:
 * - Supports field-level FK settings in Relation column, e.g.
 *   ForeignKey, Common GWCOA.egcs_cn_number [delete: restrict, update: no action]
 * - Supports new "Default value" column in column G
 * - Description is now column H
 * - DBML v2 output; unsupported PostgreSQL indexes and external refs remain comments
 * - Explicit worksheet _deleted columns take precedence over the legacy implicit field
 */

const ChartDB_DBMLExport = (() => {
  let tables = new Map(); // tableName -> { fields: [], refs: [], indexes: [], checks: [], _fieldSet, _indexSet, _refSet }
  let enumsMap = new Map(); // enumName -> [values]
  let tableGroups = new Map(); // sheetName -> Set<tableNameSanitized>

  function exportDBML() {
    buildAndShowDBML({
      currentSheetOnly: false,
      includeEnums: true,
      includeTableGroups: true,
      includeExtraCommentSheets: true
    });
  }

  function exportCurrentSheetDBML() {
    buildAndShowDBML({
      currentSheetOnly: true,
      includeEnums: true,
      includeTableGroups: true,
      includeExtraCommentSheets: false
    });
  }

  function exportCurrentSheetTablesOnlyDBML() {
    buildAndShowDBML({
      currentSheetOnly: true,
      includeEnums: false,
      includeTableGroups: false,
      includeExtraCommentSheets: false
    });
  }

  function buildAndShowDBML({
    currentSheetOnly,
    includeEnums,
    includeTableGroups,
    includeExtraCommentSheets
  }) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();

    tables.clear();
    enumsMap.clear();
    tableGroups.clear();

    const enumsSheet = ss.getSheetByName('Enums');
    if (enumsSheet) {
      const data = enumsSheet.getDataRange().getValues();
      let currentEnum = null;
      let values = [];

      data.forEach((row) => {
        const cell = (row[0] || '').toString().trim();
        if (!cell) return;

        if (/^[A-Z]/.test(cell)) {
          if (currentEnum) enumsMap.set(currentEnum, values);
          currentEnum = sanitizeEnumName(cell);
          values = [];
        } else {
          values.push(cell);
        }
      });

      if (currentEnum) enumsMap.set(currentEnum, values);
    }

    let sheets = ss.getSheets().filter(sheet => !isSpecialNonTableSheet(sheet.getName()));

    if (currentSheetOnly) {
      if (!activeSheet || isSpecialNonTableSheet(activeSheet.getName())) {
        SpreadsheetApp.getUi().alert('The active sheet is not a table sheet. Please select a table sheet first.');
        return;
      }
      sheets = [activeSheet];
    }

    sheets.forEach(sheet => {
      const sheetName = sheet.getName();

      if (!tableGroups.has(sheetName)) tableGroups.set(sheetName, new Set());
      const groupSet = tableGroups.get(sheetName);

      const data = sheet.getDataRange().getValues();
      let currentTableName = null;
      let mode = null;

      let indexColMap = null;
      let checkColMap = null;
      let refColMap = null;

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const firstCell = String(row[0] || '').trim();

        if (!firstCell) {
          if (mode === 'fields' && currentTableName && tables.get(currentTableName).fields.length > 0) {
            const continuation = String(row[7] || '').trim();
            if (continuation) {
              const t = tables.get(currentTableName);
              const lastField = t.fields[t.fields.length - 1];
              lastField.description += '\n' + continuation;
            }
          }
          continue;
        }

        if (
          firstCell &&
          i + 1 < data.length &&
          String(data[i + 1][0] || '').toLowerCase().includes('logical')
        ) {
          const parsedTable = parseTableOptionsRow(row);
          currentTableName = parsedTable.tableName;

          if (!tables.has(currentTableName)) {
            tables.set(currentTableName, {
              fields: [],
              refs: [],
              indexes: [],
              checks: [],
              includeDeleted: parsedTable.includeDeleted,
              _fieldSet: new Set(),
              _indexSet: new Set(),
              _refSet: new Set()
            });
          } else {
            const existing = tables.get(currentTableName);
            existing.includeDeleted = existing.includeDeleted && parsedTable.includeDeleted;
          }

          groupSet.add(sanitize(currentTableName));

          mode = 'fields';
          indexColMap = null;
          checkColMap = null;
          refColMap = null;
          i++;
          continue;
        }

        if (!currentTableName) continue;

        if (firstCell.toLowerCase() === 'index name') {
          mode = 'indexes';
          indexColMap = buildIndexColumnMap(row);
          checkColMap = null;
          refColMap = null;
          continue;
        }

        if (firstCell.toLowerCase() === 'check name') {
          mode = 'checks';
          checkColMap = buildCheckColumnMap(row);
          indexColMap = null;
          refColMap = null;
          continue;
        }

        if (firstCell.toLowerCase() === 'ref name') {
          mode = 'refs';
          refColMap = buildRefColumnMap(row);
          indexColMap = null;
          checkColMap = null;
          continue;
        }

        if (mode === 'fields' && firstCell.toLowerCase() === 'logical name') continue;

        const t = tables.get(currentTableName);

        if (mode === 'indexes') {
          const indexName = String(row[indexColMap?.name ?? 0] || '').trim();
          const indexFieldRaw = String(row[indexColMap?.expr ?? 1] || '').trim();
          const indexTypeRaw = String(row[indexColMap?.type ?? 2] || '').trim();
          const whereRaw = String(row[indexColMap?.where ?? -1] || '').trim();
          const constraintRaw = String(row[indexColMap?.constraint ?? 5] || '').trim();
          const functionsRaw = String(row[indexColMap?.functions ?? -1] || '').trim();

          if (!indexName && !indexFieldRaw) continue;

          const indexKey = [
            indexName,
            indexFieldRaw,
            indexTypeRaw,
            whereRaw,
            functionsRaw,
            constraintRaw
          ].join('|');

          if (!t._indexSet.has(indexKey)) {
            t._indexSet.add(indexKey);
            t.indexes.push({
              name: indexName,
              expr: indexFieldRaw,
              type: indexTypeRaw,
              where: whereRaw,
              functions: functionsRaw,
              constraint: constraintRaw
            });
          }
          continue;
        }

        if (mode === 'checks') {
          const checkName = String(row[checkColMap?.name ?? 0] || '').trim();
          const checkExpr = String(row[checkColMap?.expr ?? 5] || '').trim();

          if (!checkName || !checkExpr) continue;

          t.checks.push({
            name: checkName,
            expr: checkExpr
          });
          continue;
        }

        if (mode === 'refs') {
          const refName = String(row[refColMap?.name ?? 0] || '').trim();
          const sourceRaw = String(row[refColMap?.source ?? 1] || '').trim();
          // Existing workbook Ref sections store targets in F even with a Target header in C.
          const targetRaw = String(row[refColMap?.target ?? 2] || row[refColMap?.constraint ?? 5] || '').trim();
          const deferred = targetRaw.match(/\s+(?:NOT\s+)?DEFERRABLE(?:\s+INITIALLY\s+(?:DEFERRED|IMMEDIATE))?$/i);
          const targetWithSettings = deferred ? targetRaw.slice(0, deferred.index).trim() : targetRaw;
          const refSettings = extractTrailingRelationSettings(targetWithSettings);
          const settingsSuffix = refSettings ? ' ' + refSettings : '';
          const deferredComment = deferred ? ' // PostgreSQL: ' + deferred[0].trim() : '';

          if (!sourceRaw || !targetRaw) continue;

          const sourceExpr = normalizeRefSectionSource(sourceRaw, currentTableName);
          const targetExpr = normalizeTargetRefSide(stripTrailingRelationSettings(targetWithSettings));

          if (!sourceExpr || !targetExpr) continue;

          const refLine = refName
            ? `Ref ${sanitize(refName)}: ${sourceExpr} > ${targetExpr}${settingsSuffix}${deferredComment}`
            : `Ref: ${sourceExpr} > ${targetExpr}${settingsSuffix}${deferredComment}`;

          if (!t._refSet.has(refLine)) {
            t._refSet.add(refLine);
            t.refs.push(refLine);
          }

          continue;
        }

        if (mode !== 'fields') continue;

        const logicalName = firstCell;
        const optional = String(row[2] || '').trim().toUpperCase();
        const typeRaw = String(row[3] || '').trim();
        const relationRaw = String(row[4] || '').trim();
        const constraints = String(row[5] || '').trim();
        const defaultValue = String(row[6] ?? '').trim();
        const description = String(row[7] || '').trim();

        let fieldType = mapTypeExact(typeRaw);

        if (relationRaw) {
          const relMain = stripTrailingRelationSettings(relationRaw);
          const relLower = relMain.toLowerCase();
          if (relLower.startsWith('enum') || relLower.match(/base/i)) {
            const parts = relMain.split(',');
            if (parts[1]) fieldType = sanitizeEnumName(parts[1].trim());
          }
        }

        const settings = [];
        if (logicalName.toLowerCase() === 'id') settings.push('pk');
        if (optional === 'N') settings.push('not null');
        settings.push(...parseFieldConstraintsToSettings(constraints, { allowDefault: !defaultValue }));

        if (defaultValue) {
          settings.push(`default: ${normalizeDefaultValue(defaultValue)}`);
        }

        const fieldKey = `${sanitize(logicalName)}|${fieldType}|${settings.join(',')}|${description}`;
        if (!t._fieldSet.has(fieldKey)) {
          t._fieldSet.add(fieldKey);
          t.fields.push({
            name: logicalName,
            type: fieldType,
            settings: [...new Set(settings)],
            description
          });
        }

        if (relationRaw && stripTrailingRelationSettings(relationRaw).toLowerCase().startsWith('foreignkey')) {
          const relationMeta = parseFieldRelation(relationRaw);
          const fkSpec = relationMeta.targetSpec;

          const isCompositeRef = fkSpec.includes('>') || /\.\s*\(.+\)/.test(fkSpec);

          if (!isCompositeRef) {
            const parsedRef = parseForeignKeySpec(
              fkSpec,
              logicalName,
              currentTableName,
              relationMeta.refSettings
            );

            if (parsedRef && !t._refSet.has(parsedRef)) {
              t._refSet.add(parsedRef);
              t.refs.push(parsedRef);
            }
          }
        }
      }
    });

    let dbml = '';

    if (includeEnums) {
      enumsMap.forEach((values, name) => {
        dbml += `Enum ${name} {\n  ${values.map(value => JSON.stringify(value)).join('\n  ')}\n}\n\n`;
      });
    }

    tables.forEach((table, tableName) => {
      dbml += `Table ${sanitize(tableName)} {\n`;
      if (table.includeDeleted !== false && !table.fields.some(f => sanitize(f.name) === '_deleted')) {
        dbml += `  _deleted boolean [not null, default: false]\n`;
      }

      table.fields.forEach(f => {
        dbml += `  ${sanitize(f.name)} ${/\s/.test(f.type) ? JSON.stringify(f.type) : f.type}`;
        if (f.settings.length) dbml += ` [${f.settings.join(', ')}]`;
        if (f.description) {
          const safeDescription = f.description.replace(/\*\//g, '* /');
          if (safeDescription.includes('\n')) {
            dbml += ` /*\n${safeDescription}\n  */`;
          } else {
            dbml += ` // ${safeDescription}`;
          }
        }
        dbml += '\n';
      });

      if (table.indexes.length) {
        const hasSupportedIndex = table.indexes.some(ix => !ix.where && (!ix.type || /^(btree|hash)$/i.test(ix.type.trim())));
        if (hasSupportedIndex) dbml += `\n  Indexes {\n`;
        table.indexes.forEach(ix => {
          const expr = normalizeIndexExprWithFunctions(ix.expr, ix.functions);
          const attrs = [];

          if (ix.name) attrs.push(`name: '${escapeSingleQuotes(ix.name)}'`);
          if (ix.type && /^(btree|hash)$/i.test(ix.type.trim())) attrs.push(`type: ${ix.type.trim().toLowerCase()}`);

          const c = (ix.constraint || '').toLowerCase().trim();
          if (c) {
            c.split(/[,\s]+/).filter(Boolean).forEach(tok => {
              if (tok === 'unique' || tok === 'pk') attrs.push(tok);
            });
          }

          // DBML cannot express partial indexes or PostgreSQL-specific access methods.
          // Comment the whole index: emitting UNIQUE without WHERE would change its meaning.
          if (ix.where || (ix.type && !/^(btree|hash)$/i.test(ix.type.trim()))) {
            const details = `PostgreSQL index ${ix.name}: ${expr} [${attrs.join(', ')}] USING ${ix.type || 'btree'}${ix.where ? ' WHERE ' + ix.where : ''}`;
            dbml += `    // ${details.replace(/[\r\n]+/g, ' ')}\n`;
            return;
          }

          dbml += `    ${expr}`;
          if (attrs.length) dbml += ` [${attrs.join(', ')}]`;
          dbml += `\n`;
        });
        if (hasSupportedIndex) dbml += `  }\n`;
      }

      if (table.checks.length) {
        dbml += `\n  checks {\n`;
        table.checks.forEach(ch => {
          const expr = normalizeCheckExpr(ch.expr);
          const attrs = [];
          if (ch.name) attrs.push(`name: '${escapeSingleQuotes(ch.name)}'`);
          dbml += `    ${expr}`;
          if (attrs.length) dbml += ` [${attrs.join(', ')}]`;
          dbml += `\n`;
        });
        dbml += `  }\n`;
      }

      dbml += '}\n';

      if (table.refs.length) {
        const exportedTables = new Set(Array.from(tables.keys()).map(sanitize));
        dbml += table.refs.map(ref => {
          const endpoints = ref.match(/:\s*([A-Za-z0-9_]+)\..*?>\s*([A-Za-z0-9_]+)\./);
          return endpoints && (!exportedTables.has(endpoints[1]) || !exportedTables.has(endpoints[2]))
            ? '// External relationship (table outside this export): ' + ref
            : ref;
        }).join('\n') + '\n';
      }
      dbml += '\n';
    });

    if (includeTableGroups) {
      tableGroups.forEach((set, sheetName) => {
        const names = Array.from(set).filter(Boolean);
        if (!names.length) return;

        dbml += `TableGroup ${sanitize(sheetName)} {\n`;
        names.forEach(tn => {
          dbml += `  ${tn}\n`;
        });
        dbml += `}\n\n`;
      });
    }

    if (!currentSheetOnly && includeExtraCommentSheets) {
      const extraBlocks = [];

      const triggersText = readExtraSheetAsCommentBlock(ss, [
        'triggers',
        'triggers.csv',
        'Triggers',
        'Triggers.csv'
      ], 'Triggers');

      if (triggersText) extraBlocks.push(triggersText);

      const functionsText = readExtraSheetAsCommentBlock(ss, [
        'functions',
        'functions.csv',
        'Functions',
        'Functions.csv'
      ], 'Functions');

      if (functionsText) extraBlocks.push(functionsText);

      if (extraBlocks.length) {
        dbml += '\n';
        dbml += extraBlocks.join('\n\n');
        dbml += '\n';
      }
    }

    let fileName = 'export.dbml';
    let dialogTitle = 'DBML Export (All Sheets)';

    if (currentSheetOnly && includeEnums && includeTableGroups) {
      fileName = `${sanitize(activeSheet.getName())}.dbml`;
      dialogTitle = 'DBML Export (Current Sheet)';
    } else if (currentSheetOnly && !includeEnums && !includeTableGroups) {
      fileName = `${sanitize(activeSheet.getName())}_tables_only.dbml`;
      dialogTitle = 'DBML Export (Current Sheet, Tables Only)';
    } else if (currentSheetOnly) {
      fileName = `${sanitize(activeSheet.getName())}_partial.dbml`;
      dialogTitle = 'DBML Export (Current Sheet)';
    }

    const encodedDBML = encodeURIComponent(dbml);
    const htmlOutput = HtmlService.createHtmlOutput(`
      <textarea style="width:100%; height:400px;">${escapeHtml(dbml)}</textarea>
      <br/>
      <a href="data:text/plain;charset=utf-8,${encodedDBML}" download="${fileName}"
        style="display:inline-block;padding:8px 12px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:4px;">
        ⬇ Download DBML
      </a>
    `).setWidth(700).setHeight(500);

    SpreadsheetApp.getUi().showModalDialog(htmlOutput, dialogTitle);
  }

  function isSpecialNonTableSheet(name) {
    const n = String(name || '').trim().toLowerCase();
    return n === 'enums' || n === 'triggers' || n === 'triggers.csv' || n === 'functions' || n === 'functions.csv';
  }

  function parseTableOptionsRow(row) {
    const tableName = String(row[0] || '').trim();
    const rawOption = String(row[5] ?? '').trim().toLowerCase();

    let includeDeleted = true;

    if (
      rawOption === 'no_deleted' ||
      rawOption === 'soft_delete=false' ||
      rawOption === 'deleted=false' ||
      rawOption === 'false' ||
      rawOption === 'n'
    ) {
      includeDeleted = false;
    }

    return {
      tableName,
      includeDeleted
    };
  }

  function readExtraSheetAsCommentBlock(ss, candidateNames, label) {
    const sheet = findSheetByAnyName(ss, candidateNames);
    if (!sheet) return '';

    const values = sheet.getDataRange().getDisplayValues();
    if (!values || !values.length) return '';

    const rows = values
      .map(row => row.map(cell => String(cell || '')))
      .filter(row => row.some(cell => cell.trim() !== ''));

    if (!rows.length) return '';

    const headerRow = rows[0].map(x => x.trim());
    const headerMap = buildLooseHeaderMap(headerRow);

    const lowerLabel = String(label || '').toLowerCase();
    const isFunctions = lowerLabel.includes('function');
    const isTriggers = lowerLabel.includes('trigger');

    const hasRecognizedHeaders =
      headerMap.name != null ||
      headerMap.functionBody != null ||
      headerMap.triggerReference != null ||
      headerMap.reference != null ||
      headerMap.functions != null;

    const dataRows = hasRecognizedHeaders ? rows.slice(1) : rows;
    const blocks = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      if (isFunctions) {
        const functionName = getCell(row, headerMap.name, 0).trim();
        const functionSql = getFirstNonEmptyCell(row, [
          headerMap.functionBody,
          headerMap.triggerReference
        ]).trim();
        const referenceText = getFirstNonEmptyCell(row, [
          headerMap.reference
        ]).trim();

        if (!functionName && !functionSql) continue;

        const title = functionName ? `Function: ${functionName}` : 'Function';
        const metaLines = [];
        if (referenceText) metaLines.push(`Reference: ${referenceText}`);

        const body = functionSql || rowToPrettyText(row.slice(1));
        if (!body) continue;

        blocks.push(`/*
${title}
${metaLines.join('\n')}${metaLines.length ? '\n' : ''}${'-'.repeat(title.length)}
${body.replace(/\*\//g, '* /')}
*/`);
        continue;
      }

      if (isTriggers) {
        const triggerName = getCell(row, headerMap.name, 0).trim();
        const triggerSql = getFirstNonEmptyCell(row, [
          headerMap.triggerReference,
          headerMap.functionBody
        ]).trim();
        const referenceText = getFirstNonEmptyCell(row, [
          headerMap.reference
        ]).trim();
        const functionsText = getFirstNonEmptyCell(row, [
          headerMap.functions
        ]).trim();

        if (!triggerName && !triggerSql) continue;

        const title = triggerName ? `Trigger: ${triggerName}` : 'Trigger';
        const metaLines = [];
        if (referenceText) metaLines.push(`Reference: ${referenceText}`);
        if (functionsText) metaLines.push(`Functions: ${functionsText}`);

        const body = triggerSql || rowToPrettyText(row.slice(1));
        if (!body) continue;

        blocks.push(`/*
${title}
${metaLines.join('\n')}${metaLines.length ? '\n' : ''}${'-'.repeat(title.length)}
${body.replace(/\*\//g, '* /')}
*/`);
        continue;
      }

      const text = rowToPrettyText(row);
      if (text) {
        blocks.push(`/*
${label}
${'='.repeat(label.length)}
${text.replace(/\*\//g, '* /')}
*/`);
      }
    }

    return blocks.join('\n\n');
  }

  function buildLooseHeaderMap(headerRow) {
    const map = {};

    headerRow.forEach((header, idx) => {
      const h = normalizeLooseHeader(header);

      if (h === 'name') map.name = idx;
      else if (h === 'functionbody' || h === 'body') map.functionBody = idx;
      else if (h === 'triggerreference' || h === 'triggerbody') map.triggerReference = idx;
      else if (h === 'reference') map.reference = idx;
      else if (h === 'functions' || h === 'function') map.functions = idx;
    });

    return map;
  }

  function normalizeLooseHeader(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function getCell(row, idx, fallbackIdx) {
    const useIdx = idx != null ? idx : fallbackIdx;
    if (useIdx == null || useIdx < 0 || useIdx >= row.length) return '';
    return String(row[useIdx] || '');
  }

  function getFirstNonEmptyCell(row, indexes) {
    for (let i = 0; i < indexes.length; i++) {
      const idx = indexes[i];
      if (idx == null || idx < 0 || idx >= row.length) continue;
      const value = String(row[idx] || '');
      if (value.trim()) return value;
    }
    return '';
  }

  function rowToPrettyText(cells) {
    const parts = (cells || []).map(cell => String(cell || ''));

    while (parts.length && parts[parts.length - 1].trim() === '') {
      parts.pop();
    }

    if (!parts.length) return '';

    const nonEmpty = parts.filter(x => x.trim() !== '');

    if (nonEmpty.length === 1) {
      return nonEmpty[0].trimRight();
    }

    const multilineParts = parts.filter(x => x.includes('\n') && x.trim() !== '');
    if (multilineParts.length) {
      return parts
        .filter(x => x.trim() !== '')
        .map((part, idx) => {
          const trimmed = part.trimRight();
          if (idx === 0) return trimmed.trim();
          return trimmed;
        })
        .join('\n');
    }

    return parts
      .filter(x => x.trim() !== '')
      .map(x => x.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findSheetByAnyName(ss, candidateNames) {
    for (let i = 0; i < candidateNames.length; i++) {
      const s = ss.getSheetByName(candidateNames[i]);
      if (s) return s;
    }

    const normalizedWanted = candidateNames.map(normalizeLooseSheetName);
    const allSheets = ss.getSheets();

    for (let i = 0; i < allSheets.length; i++) {
      const sheet = allSheets[i];
      const normalizedActual = normalizeLooseSheetName(sheet.getName());
      if (normalizedWanted.includes(normalizedActual)) return sheet;
    }

    return null;
  }

  function normalizeLooseSheetName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/\.csv$/i, '');
  }

  function sanitize(name) {
    return String(name).trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  }

  function sanitizeEnumName(name) {
    return String(name).trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  }

  function mapTypeExact(type) {
    const raw = String(type || '').trim();
    if (!raw) return 'varchar';

    const t = raw.toLowerCase();

    if (/^varchar\s*\(\s*\d+\s*\)$/.test(t)) return t;
    if (/^character varying\s*\(\s*\d+\s*\)$/.test(t)) return t;
    if (/^char\s*\(\s*\d+\s*\)$/.test(t)) return t;
    if (/^character\s*\(\s*\d+\s*\)$/.test(t)) return t;
    if (/^(numeric|decimal)\s*\(\s*\d+\s*(,\s*\d+\s*)?\)$/.test(t)) return t;
    if (/^timestamp\s*(with(out)?\s+time\s+zone)?$/.test(t)) return t;
    if (/^time\s*(with(out)?\s+time\s+zone)?$/.test(t)) return t;
    if (/^bit\s*\(\s*\d+\s*\)$/.test(t)) return t;
    if (/^varbit\s*\(\s*\d+\s*\)$/.test(t)) return t;

    const exactTypes = new Set([
      'bigint',
      'bigserial',
      'smallint',
      'serial',
      'int',
      'integer',
      'json',
      'jsonb',
      'text',
      'date',
      'timestamp',
      'timestamptz',
      'datetime',
      'boolean',
      'bool',
      'uuid',
      'citext',
      'bytea',
      'real',
      'double precision',
      'money',
      'inet',
      'cidr',
      'macaddr',
      'macaddr8',
      'xml',
      'tsvector',
      'tsquery'
    ]);

    if (exactTypes.has(t)) return t;

    if (t.startsWith('varchar')) return t;
    if (t.startsWith('character varying')) return t;
    if (t.startsWith('char(') || t.startsWith('character(')) return t;
    if (t.startsWith('numeric')) return t;
    if (t.startsWith('decimal')) return t;
    if (t.startsWith('jsonb')) return 'jsonb';
    if (t.startsWith('json')) return 'json';
    if (t.startsWith('citext')) return 'citext';
    if (t.startsWith('text')) return 'text';
    if (t.startsWith('date')) return 'date';
    if (t.startsWith('timestamp')) return t;
    if (t.startsWith('datetime')) return 'timestamp';
    if (t.startsWith('boolean') || t.startsWith('bool')) return 'boolean';
    if (t.startsWith('bigint')) return 'bigint';
    if (t.startsWith('bigserial')) return 'bigserial';
    if (t.startsWith('smallint')) return 'smallint';
    if (t === 'integer' || t.startsWith('integer')) return 'integer';
    if (t === 'int' || t.startsWith('int')) return 'int';

    return t;
  }

  function parseFieldRelation(relationRaw) {
    const stripped = stripTrailingRelationSettings(relationRaw);
    const settings = extractTrailingRelationSettings(relationRaw);

    const parts = stripped.split(',');
    const relationType = String(parts[0] || '').trim();
    const targetSpec = parts.slice(1).join(',').trim();

    return {
      relationType,
      targetSpec,
      refSettings: settings
    };
  }

  function stripTrailingRelationSettings(relationRaw) {
    const s = String(relationRaw || '').trim();
    if (!s) return '';

    const match = s.match(/^(.*?)(\s*\[[^\]]+\]\s*)$/);
    if (!match) return s;

    const before = match[1].trim();
    const maybeSettings = match[2].trim();

    if (looksLikeRefSettingsBlock(maybeSettings)) {
      return before;
    }

    return s;
  }

  function extractTrailingRelationSettings(relationRaw) {
    const s = String(relationRaw || '').trim();
    if (!s) return '';

    const match = s.match(/^(.*?)(\s*\[[^\]]+\]\s*)$/);
    if (!match) return '';

    const maybeSettings = match[2].trim();
    if (!looksLikeRefSettingsBlock(maybeSettings)) return '';

    return normalizeRefSettingsBlock(maybeSettings);
  }

  function looksLikeRefSettingsBlock(block) {
    const inner = String(block || '').trim().replace(/^\[/, '').replace(/\]$/, '').trim().toLowerCase();
    if (!inner) return false;

    return /\b(delete|update|color)\s*:/.test(inner);
  }

  function normalizeRefSettingsBlock(block) {
    const inner = String(block || '')
      .trim()
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .trim();

    if (!inner) return '';

    const parts = splitByCommaRespectingParens(inner)
      .map(x => x.trim())
      .filter(Boolean);

    if (!parts.length) return '';

    return `[${parts.join(', ')}]`;
  }

  function parseForeignKeySpec(fkSpec, logicalName, currentTableName, refSettings) {
    const spec = String(fkSpec || '').trim();
    if (!spec) return null;

    const settingsSuffix = refSettings ? ` ${refSettings}` : '';

    if (spec.includes('>')) {
      const parts = spec.split('>');
      if (parts.length !== 2) return null;

      const sourceRaw = parts[0].trim();
      const targetRaw = parts[1].trim();

      const sourceExpr = normalizeRefSide(sourceRaw, true);
      const targetExpr = normalizeTargetRefSide(targetRaw);

      if (!sourceExpr || !targetExpr) return null;

      return `Ref: ${sourceExpr} > ${targetExpr}${settingsSuffix}`;
    }

    const dotIndex = spec.indexOf('.');
    if (dotIndex === -1) return null;

    const targetTableRaw = spec.slice(0, dotIndex).trim();
    const targetColsRaw = spec.slice(dotIndex + 1).trim();

    const targetExpr = normalizeTargetRefSide(`${targetTableRaw}.${targetColsRaw}`);
    if (!targetExpr) return null;

    if (targetColsRaw.startsWith('(') && targetColsRaw.endsWith(')')) {
      const sourceExpr = normalizeRefSide(logicalName, false);
      if (!sourceExpr.startsWith('(')) {
        return null;
      }
      return `Ref: ${sourceExpr} > ${targetExpr}${settingsSuffix}`;
    }

    return `Ref: ${sanitize(currentTableName)}.${sanitize(logicalName)} > ${targetExpr}${settingsSuffix}`;
  }

  function forceTupleIfCommaSeparated(raw) {
    const s = String(raw || '').trim();
    if (!s) return s;
    if (s.startsWith('(') && s.endsWith(')')) return s;
    if (s.includes(',')) return `(${s})`;
    return s;
  }

  function normalizeRefSectionSource(sourceRaw, currentTableName) {
    const s = String(sourceRaw || '').trim();
    if (!s) return '';

    if (s.includes('.')) {
      const dotIndex = s.indexOf('.');
      const tableRaw = s.slice(0, dotIndex).trim();
      const colsRaw = s.slice(dotIndex + 1).trim();
      return `${sanitize(tableRaw)}.${normalizeRefColumns(forceTupleIfCommaSeparated(colsRaw))}`;
    }

    return `${sanitize(currentTableName)}.${normalizeRefColumns(forceTupleIfCommaSeparated(s))}`;
  }

  function normalizeTargetRefSide(targetRaw) {
    const s = String(targetRaw || '').trim();
    const dotIndex = s.indexOf('.');
    if (dotIndex === -1) return null;

    const tableRaw = s.slice(0, dotIndex).trim();
    const colsRaw = s.slice(dotIndex + 1).trim();

    const tableName = sanitize(tableRaw);
    const colExpr = normalizeRefColumns(colsRaw);

    if (!tableName || !colExpr) return null;
    return `${tableName}.${colExpr}`;
  }

  function normalizeRefSide(sideRaw, allowQualified) {
    const s = String(sideRaw || '').trim();
    if (!s) return '';

    if (allowQualified && s.includes('.')) {
      const dotIndex = s.indexOf('.');
      const tableRaw = s.slice(0, dotIndex).trim();
      const colsRaw = s.slice(dotIndex + 1).trim();

      return `${sanitize(tableRaw)}.${normalizeRefColumns(colsRaw)}`;
    }

    return normalizeRefColumns(s);
  }

  function normalizeRefColumns(colsRaw) {
    const s = String(colsRaw || '').trim();
    if (!s) return '';

    if (s.startsWith('(') && s.endsWith(')')) {
      const inner = s.slice(1, -1).trim();
      const parts = splitByCommaRespectingParens(inner).map(x => sanitize(x));
      return `(${parts.join(', ')})`;
    }

    return sanitize(s);
  }

  function parseFieldConstraintsToSettings(constraintsRaw, options = {}) {
    const c = String(constraintsRaw || '').trim();
    if (!c) return [];

    const { allowDefault = true } = options;
    const lower = c.toLowerCase();
    const out = [];

    const clauses = lower.split(',').map(part => part.trim());
    if (clauses.includes('unique')) out.push('unique');
    if (clauses.includes('not null')) out.push('not null');
    if (clauses.includes('pk') || clauses.includes('primary key')) out.push('pk');

    if (allowDefault) {
      const defMatch = c.match(/default\s*[:=]?\s*(.+)$/i);
      if (defMatch && defMatch[1]) {
        const val = defMatch[1].trim();
        out.push(`default: ${normalizeDefaultValue(val)}`);
      }
    }

    const noteMatch = c.match(/note\s*[:=]?\s*(.+)$/i);
    if (noteMatch && noteMatch[1]) {
      const note = noteMatch[1].trim().replace(/'/g, "\\'");
      out.push(`note: '${note}'`);
    }

    return out;
  }

  function normalizeDefaultValue(valueRaw) {
    const v = String(valueRaw || '').trim();
    if (!v) return v;

    const lower = v.toLowerCase();

    if (lower === 'null') return 'null';
    if (lower === 'true') return 'true';
    if (lower === 'false') return 'false';

    if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return v;

    if (v.startsWith('`') && v.endsWith('`')) return v;
    if (/^'(?:[^']|'')*'$/.test(v)) return `'${escapeSingleQuotes(v.slice(1, -1).replace(/''/g, "'"))}'`;
    if (v.startsWith('"') && v.endsWith('"')) return `'${escapeSingleQuotes(v.slice(1, -1))}'`;
    if (v.includes('::') || /[()]/.test(v) || /^(current_timestamp|current_date|current_time|localtimestamp|localtime|current_user|session_user)$/i.test(v)) return normalizeCheckExpr(v);
    return `'${escapeSingleQuotes(v)}'`;
  }

  function normalizeCheckExpr(exprRaw) {
    const e = String(exprRaw || '').trim();
    if (!e) return '``';
    if (e.startsWith('`') && e.endsWith('`')) return e;
    return `\`${e}\``;
  }

  function escapeSingleQuotes(s) {
    return String(s).replace(/'/g, "\\'");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildIndexColumnMap(headerRow) {
    const map = {};
    headerRow.forEach((col, idx) => {
      const h = String(col || '').trim().toLowerCase();
      if (!h) return;

      if (h === 'index name') map.name = idx;
      if (h.includes('field')) map.expr = idx;
      if (h === 'type') map.type = idx;
      if (h === 'where') map.where = idx;
      if (h.includes('constraint')) map.constraint = idx;
      if (h === 'functions' || h === 'function') map.functions = idx;
    });
    return map;
  }

  function buildRefColumnMap(headerRow) {
    const map = {};
    headerRow.forEach((col, idx) => {
      const h = String(col || '').trim().toLowerCase();
      if (!h) return;

      if (h === 'ref name') map.name = idx;
      if (h === 'source') map.source = idx;
      if (h === 'target') map.target = idx;
      if (h.includes('constraint')) map.constraint = idx;
    });
    return map;
  }

  function buildCheckColumnMap(headerRow) {
    const map = {};
    headerRow.forEach((col, idx) => {
      const h = String(col || '').trim().toLowerCase();
      if (!h) return;

      if (h === 'check name') map.name = idx;
      if (h.includes('constraint') || h === 'expression' || h === 'check' || h === 'where') map.expr = idx;
    });
    return map;
  }

  function normalizeIndexExprWithFunctions(exprRaw, functionsRaw) {
    const base = String(exprRaw || '').trim();
    if (!base) return '(id)';

    if (base.startsWith('`')) return base;

    let items = [];

    if (base.startsWith('(') && base.endsWith(')')) {
      const inner = base.slice(1, -1).trim();
      items = splitByCommaRespectingParens(inner);
    } else if (base.includes(',')) {
      items = splitByCommaRespectingParens(base);
    } else {
      items = [base];
    }

    const fRaw = String(functionsRaw || '').trim();
    if (!fRaw) {
      const rendered = items.map(formatIndexItem);
      return rendered.length > 1 ? `(${rendered.join(', ')})` : rendered[0];
    }

    const fParts = splitByCommaRespectingParens(fRaw);
    const applyToAll = fParts.length === 1 && items.length > 1;

    const outItems = items.map((it, idx) => {
      const col = it.trim();
      const pat = (applyToAll ? fParts[0] : (fParts[idx] ?? '')).trim();

      if (!pat) return col;

      if (!pat.includes('{col}')) {
        const p = pat.trim();
        const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.+)\)$/);
        if (m) {
          const outer = m[1];
          const inner = m[2].trim();
          const innerApplied = applyWrapperChain(inner, col);
          return `${outer}(${innerApplied})`;
        }

        return `${p}(${col})`;
      }

      return pat.replace(/\{col\}/g, col);
    });

    return outItems.length > 1
      ? `(${outItems.map(formatIndexItem).join(', ')})`
      : formatIndexItem(outItems[0]);
  }

  function formatIndexItem(value) {
    const item = String(value).trim();
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(item) || (item.startsWith('`') && item.endsWith('`')) ? item : normalizeCheckExpr(item);
  }

  function splitByCommaRespectingParens(s) {
    const out = [];
    let cur = '';
    let depth = 0;
    let quote = null;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (quote) {
        cur += ch;
        if (ch === '\\' && i + 1 < s.length) cur += s[++i];
        else if (ch === quote) {
          if (s[i + 1] === quote) cur += s[++i];
          else quote = null;
        }
        continue;
      }
      if (ch === '`' || ch === "'" || ch === '"') {
        quote = ch;
        cur += ch;
        continue;
      }

      {
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth - 1);

        if (ch === ',' && depth === 0) {
          out.push(cur.trim());
          cur = '';
          continue;
        }
      }

      cur += ch;
    }

    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function applyWrapperChain(chainRaw, col) {
    const chain = String(chainRaw || '').trim();
    if (!chain) return col;

    if (chain.includes('{col}')) return chain.replace(/\{col\}/g, col);

    const m = chain.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.+)\)$/);
    if (m) {
      const outer = m[1];
      const inner = m[2].trim();
      return `${outer}(${applyWrapperChain(inner, col)})`;
    }

    return `${chain}(${col})`;
  }

  return {
    export: exportDBML,
    exportCurrentSheet: exportCurrentSheetDBML,
    exportCurrentSheetTablesOnly: exportCurrentSheetTablesOnlyDBML
  };
})();

function exportDBML() {
  ChartDB_DBMLExport.export();
}

function exportCurrentSheetDBML() {
  ChartDB_DBMLExport.exportCurrentSheet();
}

function exportCurrentSheetTablesOnlyDBML() {
  ChartDB_DBMLExport.exportCurrentSheetTablesOnly();
}
