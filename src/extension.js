'use strict';

const vscode = require('vscode');
const { ParseAndGetSymbols } = require('./Parse');
const fs = require('fs');
const path = require('path');
const os = require('os');
const console = require('console');

const g_keywordSymbols = [];
const g_docs = new Map();
const g_officialFile = new Set();

function Log(str)
{
    console.log("DriftScript: " + str);
}

function AnalyzeDoc(document)
{
    if (document.languageId !== "driftscript")
    {
        return;
    }

    g_docs.set(document.uri.toString(),
        ParseAndGetSymbols(document.uri.toString(), document.getText()));
}

function OnDocClosed(document)
{
    if (g_officialFile.has(document.uri.toString()))
    {
        return;
    }

    if (g_docs.has(document.uri.toString()))
    {
        g_docs.delete(document.uri.toString());
    }
}

function getFilesByExtension(absDirPath, ext, recursive = false) {
  if (!ext.startsWith('.')) ext = '.' + ext;

  if (!fs.existsSync(absDirPath) || !fs.statSync(absDirPath).isDirectory()) {
    return [];
  }

  const result = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(fullPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ext.toLowerCase()) {
        result.push(fullPath);
      }
    }
  }

  walk(absDirPath);
  return result;
}

async function getDocument(filePath) {
  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  return doc;
}

async function InitDriftLibs()
{
    const dirsToCheck = [];

    const driftDir = process.env["GX_DRIFT_LIBS_DIR"];
    if (driftDir)
    {
        dirsToCheck.push(driftDir);
    }

    if (process.platform === "win32") {
        const pf86 = process.env["ProgramFiles(x86)"];
        if (pf86)
        {
            dirsToCheck.push(path.join(pf86, 'Steam/steamapps/common/DriftWarsBeta/Dev/DriftLibs'));
            dirsToCheck.push(path.join(pf86, 'Steam/steamapps/common/DriftWarsRTS/Dev/DriftLibs'));
        }
    }

    if (process.platform === "linux") {
        const homeDir = os.homedir();
        dirsToCheck.push(path.join(homeDir, '.local/share/Steam/steamapps/common/DriftWarsBeta/Dev/DriftLibs'));
        dirsToCheck.push(path.join(homeDir, '.local/share/Steam/steamapps/common/DriftWarsRTS/Dev/DriftLibs'));
    }

    Log("Will scan for DriftLibs in these directories:");
    for (const dir of dirsToCheck)
    {
        Log(dir);
    }
            
    for (const dir of dirsToCheck)
    {
        const files = getFilesByExtension(dir, '.DriftScript');
        if (files.length > 0)
        {
            Log("Found DriftLibs in: " + dir);
            for (const f of files)
            {
                const doc = await getDocument(f);
                g_officialFile.add(doc.uri.toString());
                AnalyzeDoc(doc);
            }
            return;
        }
    }
}

function InitKeywordSymbols()
{
    const driftscript_keywords = [
        'function', 'local', 'class', 'extends', 'enum', 'constructor', 'base', 'this',
        'if', 'else', 'while', 'do', 'for', 'foreach', 'in', 'switch', 'case',
        'default', 'break', 'continue', 'return', 'try', 'catch', 'throw',
        'yield', 'resume', 'static', 'const', 'typeof', 'instanceof',
        'delete', 'clone', 'null', 'true', 'false', 'not_in', 'is_not'
    ];

    for (const keyword of driftscript_keywords)
    {
        let d = '';

        function addLine(line) {
            d += (line + '\n');
        }

        if (keyword == 'function')
        {
            addLine('function myFunction(a, b) {');
            addLine('  return a+b;');
            addLine('}');
        }
        if (keyword == 'for')
        {
            addLine('for (local i=0; i<5; ++i) {');
            addLine("  print('yay');");
            addLine('}');
        }
        if (keyword == 'foreach')
        {
            addLine('foreach (v in arrayOrTable) {');
            addLine("  print('value = ' + val);");
            addLine('}');
            addLine('');
            addLine('foreach (k, v in arrayOrTable) {');
            addLine("  print('key (or array index) = ' + k);");
            addLine("  print('value = ' + v);");
            addLine('}');
        }
        if ((keyword == 'if') || (keyword == 'else'))
        {
            addLine('if (4 < 7) {');
            addLine("  print('yay 1');");
            addLine('} else if (2 > 1) {');
            addLine("  print('yay 2');");
            addLine("} else {");
            addLine("  print('yay 3');");
            addLine('}');
        }
        if (d.length > 0)
        {
            d = 'Example(s):\n' + '```\n' + d + '\n```';
        }
        g_keywordSymbols.push(
            {
                kind: 'keyword',
                name: keyword,
                signature: keyword,
                doc: d,
                line: 0,
                uri: '',
                namespace: ''
            }
        );
    }

    function addConst(name, d)
    {
        g_keywordSymbols.push(
            {
                kind: 'constant',
                name: name,
                signature: name,
                doc: d,
                line: 0,
                uri: '',
                namespace: ''
            }
        );
    }

    addConst('RAND_MAX', 'Constant 64-bit int value of `0x7FFFFFFF` (`2147483647`)');
    addConst('INT_MAX', '`9223372036854775807`');
    addConst('INT_MIN', '`-9223372036854775808`');
    addConst('INT_SMALLEST', '`1`');
    addConst('FLOAT_MAX', '`+2147483647.99999999976716935634...`');
    addConst('FLOAT_MIN', '`-2147483648.0`');
    addConst('FLOAT_SMALLEST', '`0.00000000023283064365...`');
    addConst('PI', 'Constant float value for `PI` (`3.14159...`)');
    addConst('TAU', 'Constant float value for `2*PI` (`6.28318...`)');

    addConst('__LINE__', 'int: the line number');
    addConst('__FILE__', 'string: the file name');
    addConst('_versionnumber_', 'int: DriftScript version number');
    addConst('_version_', 'string: DriftScript version');
    addConst('_charsize_', 'int: 1');
    addConst('_intsize_', 'int: 8');
    addConst('_floatsize_', 'int: 8');

    let d = '';
    d += '```\n';
    d += '# Gets the global root table..\n\n';
    d += '# Useful for few things, such as\n';
    d += '# getting a global function by name.\n\n';
    d += '# Example:\n\n';
    d += 'local functionPtr = getrootable()["SomeFunctionName"];\n';
    d += 'functionPtr(2, 4); # call function\n';
    d += '```';

    g_keywordSymbols.push(
        {
            kind: 'function',
            name: 'getroottable',
            signature: 'table getroottable()',
            doc: d,
            line: 0,
            uri: '',
            namespace: ''
        }
    )
}

function GetAllSymbols()
{
    const result = [];

    for (const allSymbolsInDoc of g_docs.values())
    {
        for (const sym of allSymbolsInDoc)
        {
            result.push(sym);
        }
    }

    for (const sym of g_keywordSymbols)
    {
        result.push(sym);
    }

    return result;
}

function GetFunctionOrClassSymbol(namespace, name)
{
    let result = GetAllSymbols().filter(s =>
                                        (s.namespace == namespace) &&
                                        (s.name == name) &&
                                        ((s.kind === 'function') || (s.kind === 'class')));                                
    if (result.length == 0)
    {
        return null;
    }
    return result[0];
}

function GetNonEnumMemberByName(namespace, name, doc)
{
    let uriStr = doc.uri.toString();

    const IsValid = (s) => {
        if (s.kind == "variable")
        {
            if (uriStr != s.uri)
            {
                return false;
            }
        }
        if (s.kind == "enumMember")
        {
            return false;
        }
        if (s.namespace != namespace)
        {
            return false;
        }
        return (s.name === name);
    };

    let symbols = GetAllSymbols().filter(s => IsValid(s));
    if (symbols.length > 0)
    {
        return symbols[0];
    }

    return null;
}

function GetAllSymbolsInNamespace(namespace, doc)
{
    let uriStr = doc.uri.toString();

    const IsValid = (s) => {
        if (s.kind == "variable")
        {
            if (uriStr != s.uri)
            {
                return false;
            }
        }
        if (s.kind == "enumMember")
        {
            return false;
        }
        if (s.namespace != namespace)
        {
            return false;
        }
        return true;
    };

    return GetAllSymbols().filter(s => IsValid(s));
}

function GetEnumMemberSymbols(namespace, enumName)
{
    const IsValid = (s) => {
        if (s.kind == "enumMember")
        {
            if (s.enum == enumName)
            {
                return true;
            }
        }
        return false;
    };

    return GetAllSymbols().filter(s => IsValid(s));
}

function GetEnumMemberSymbol(namespace, enumName, enumMember)
{
    let arr = GetAllSymbols().filter(s =>   (s.kind == 'enumMember') &&
                                            (s.namespace == namespace) &&
                                            (s.enum === enumName) &&
                                            (s.name == enumMember));
    if (arr.length == 0)
    {
        return null;
    }
    return arr[0];
}

function CreateCompletionItemFromSymbol(sym)
{
    let kind = undefined;
    if (sym.kind == 'class')
    {
        kind = vscode.CompletionItemKind.Class;
    }
    else if (sym.kind == 'enumMember')
    {
        kind = vscode.CompletionItemKind.EnumMember;
    }
    else if (sym.kind == 'enum')
    {
        kind = vscode.CompletionItemKind.Enum;
    }
    else if (sym.kind == 'function')
    {
        kind = vscode.CompletionItemKind.Function;
    }
    else if (sym.kind == 'keyword')
    {
        kind = vscode.CompletionItemKind.Keyword;
    }
    else if (sym.kind == 'constant')
    {
        kind = vscode.CompletionItemKind.Value;
    }
    else if (sym.kind == 'variable')
    {
        kind = vscode.CompletionItemKind.Variable;
    }
    else if (sym.kind == 'namespace')
    {
        kind = vscode.CompletionItemKind.Module;
    }
    else
    {
        return null;
    }

    const item = new vscode.CompletionItem(sym.name, kind);
    if (sym.signature && (sym.signature != ''))
    {
        item.detail = sym.signature;
    }
    if (sym.doc && (sym.doc != ''))
    {
        item.documentation = new vscode.MarkdownString(sym.doc);
    }
    
    return item;
}

function getDottedExpressionRange(document, position) {
    const lineText = document.lineAt(position.line).text;
    const offset = position.character;

    const isNamePart = ch => /[A-Za-z0-9_]/.test(ch);

    let start = offset;
    while (start > 0) {
        const ch = lineText[start - 1];
        if (isNamePart(ch) || ch === '.') start--;
        else break;
    }

    let end = offset;
    while (end < lineText.length) {
        const ch = lineText[end];
        if (isNamePart(ch) || ch === '.') end++;
        else break;
    }

    if (start === end) return null;

    return new vscode.Range(
        new vscode.Position(position.line, start),
        new vscode.Position(position.line, end)
    );
}

function getDottedExpression(document, position) {
    let range = getDottedExpressionRange(document, position);
    if (range === null)
    {
        return null;
    }
    return document.getText(range);
}

function getActiveDotIndex(expr, offset) {
    let index = 0;

    for (let i = 0; i < offset; i++) {
        if (expr[i] === '.') {
            index++;
        }
    }

    return index;
}

// returns namespace
// returns kind (class, enum, enumMember, function, variable)
function GetNamespace(theText)
{
    let words = theText.split('.');
    if (words.length < 2)
    {
        return "";
    }

    words.pop();

    const copy = words.slice();
    copy.pop();
    if (IsEnum(copy.join("."), words[words.length-1]))
    {
        return copy.join(".");
    }

    return words.join(".");
}

function IsEnum(theNamespace, theEnum)
{
    let symbols = GetAllSymbols();
    for (const sym of symbols)
    {
        if ((sym.kind == 'enum') && (sym.namespace == theNamespace))
        {
            if (sym.name == theEnum)
            {
                return true;
            }
        }
    }
    return false;
}

function GetEnumName(theText)
{
    let arr = theText.split('.');
    if (arr.length < 2)
    {
        return null;
    }

    arr.pop();
    const copy = arr.slice();
    copy.pop();
    if (IsEnum(copy.join("."), arr[arr.length-1]))
    {
        return arr[arr.length-1];
    }

    return null;
}

function GetFinalChunkName(theText)
{
    let arr = theText.split('.');
    return arr[arr.length-1];
}

class DriftScriptProvideCompletionItems
{
    removeSymbolsWithSameName(theList)
    {
        let retList = [];

        let s = new Set();
        for (const item of theList)
        {
            if (s.has(item.name))
            {
                continue;
            }
            s.add(item.name);
            retList.push(item);
        }

        return retList;
    }

    provideCompletionItems(document, position)
    {
        let theText = getDottedExpression(document, position);
        if (theText === null)
        {
            return undefined;
        }

        let theNamespace = GetNamespace(theText);
        let enumName = GetEnumName(theText);

        let symbols = [];
        if (enumName !== null)
        {
            symbols = GetEnumMemberSymbols(theNamespace, enumName);
        }
        else
        {
            symbols = GetAllSymbolsInNamespace(theNamespace, document);
        }

        symbols = this.removeSymbolsWithSameName(symbols);

        const items = [];
        {
            for (const sym of symbols)
            {
                let item = CreateCompletionItemFromSymbol(sym);
                if (item != null)
                {
                    items.push(item);
                }
            }
        }
        return items;
    }
}

class DriftScriptHoverHelper
{
    getRangeUpToHover(document, range, position)
    {
        const text = document.getText(range);
        const offset = position.character - range.start.character;

        let hoverIndex = 0;
        let dotCount = 0;

        // find which segment we're in
        for (let i = 0; i < offset; i++) {
            if (text[i] === ".") {
                dotCount++;
            }
        }

        hoverIndex = dotCount;

        const parts = text.split(".");

        // compute end offset of hovered segment
        let endOffset = 0;

        for (let i = 0; i <= hoverIndex; i++) {
            endOffset += parts[i].length;
            if (i !== hoverIndex) endOffset += 1; // dot
        }

        const start = range.start;
        const end = start.translate(0, endOffset);

        return new vscode.Range(start, end);
    }

    provideHover(document, position)
    {
        let range = getDottedExpressionRange(document, position);
        if (range === null)
        {
            return undefined;
        }

        range = this.getRangeUpToHover(document, range, position);

        let theText = document.getText(range);
        let offset = position.character - range.start.character;

        let match = null;

        let theNamespace = GetNamespace(theText);
        let enumName = GetEnumName(theText);
        let finalChunkName = GetFinalChunkName(theText); 

        if (enumName !== null)
        {
            if (finalChunkName == "")
            {
                finalChunkName = enumName;
                enumName = null;
            }
        }

        if (enumName !== null)
        {
            match = GetEnumMemberSymbol(theNamespace, enumName, finalChunkName);
        }
        else
        {
            match = GetNonEnumMemberByName(theNamespace, finalChunkName, document);
        }

        if (match === null)
        {
            return undefined;
        }

        let signature = '';
        if (match.signature)
        {
            signature = match.signature;
        }

        const md = new vscode.MarkdownString();
        md.appendCodeblock(signature, 'driftscript');

        if (match.doc && match.doc != '') {
            md.appendMarkdown(match.doc);
        }

        return new vscode.Hover(md, range);
    }
}

class DriftScriptSignatureHelpProvider
{
    extractParamNames(signature) {
        const m = signature.match(/\(([^)]*)\)/);
        if (!m || !m[1].trim()) return [];
        return m[1].split(',').map(s => s.trim());
    }

    getTextBeforeCursor(document, position) {
        const range = new vscode.Range(new vscode.Position(0, 0), position);
        return document.getText(range);
    }

    findOpenParenOffset(text) {
        let depth = 0;
        for (let i = text.length - 1; i >= 0; i--) {
            const ch = text[i];
            if (ch === ')') {
                depth++;
            } else if (ch === '(') {
                if (depth === 0) {
                    return i;
                }
                depth--;
            }
        }
        return -1;
    }

    countActiveParameter(text, openParenOffset) {
        let depth = 0;
        let paramIndex = 0;
        for (let i = openParenOffset + 1; i < text.length; i++) {
            const ch = text[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === ',' && depth === 0) paramIndex++;
        }
        return paramIndex;
    }

    getFunctionNameAtSignatureHelp(document, position)
    {
        const lineText = document.lineAt(position.line).text;
        let offset = position.character;

        // Walk backward tracking paren depth to find the unmatched '(' 
        // that opens the call we're currently inside of.
        let depth = 0;
        let openParenIndex = -1;

        for (let i = offset - 1; i >= 0; i--) {
            const ch = lineText[i];
            if (ch === ')') {
                depth++;
            } else if (ch === '(') {
                if (depth === 0) {
                    openParenIndex = i;
                    break;
                }
                depth--;
            }
        }

        if (openParenIndex === -1) return null;

        // Now scan backward from just before that '(' to get the qualified name
        const isNamePart = ch => /[A-Za-z0-9_]/.test(ch);
        let start = openParenIndex;
        while (start > 0) {
            const ch = lineText[start - 1];
            if (isNamePart(ch) || ch === '.') {
                start--;
            } else {
                break;
            }
        }

        const name = lineText.slice(start, openParenIndex);
        return name.length > 0 ? name : null;
    }

    getActiveParameter(document, position)
    {
        const textBefore = this.getTextBeforeCursor(document, position);
        const openParenOffset = this.findOpenParenOffset(textBefore);
        if (openParenOffset === -1) return null;
        const activeParameter = this.countActiveParameter(textBefore, openParenOffset);
        return activeParameter;
    }

    provideSignatureHelp(document, position)
    {
        const funcName = this.getFunctionNameAtSignatureHelp(document, position);
        if (funcName === null)
        {
            return undefined;
        }

        const activeParameter = this.getActiveParameter(document, position);
        if (activeParameter == null)
        {
            return undefined;
        }

        let namespace = GetNamespace(funcName);
        let finalChunkName = GetFinalChunkName(funcName);

        let symbol = GetFunctionOrClassSymbol(namespace, finalChunkName);
        if (!symbol)
        {
            return undefined;
        }

        const sigInfo = new vscode.SignatureInformation(
            symbol.signature,
            new vscode.MarkdownString(symbol.doc)
        );

        // Optional: parse params out of the signature to highlight active one
        const paramNames = this.extractParamNames(symbol.signature);
        sigInfo.parameters = paramNames.map(p => new vscode.ParameterInformation(p));

        const help = new vscode.SignatureHelp();
        help.signatures = [sigInfo];
        help.activeSignature = 0;
        help.activeParameter = activeParameter;

        return help;
    }
}

async function activate(context)
{
    Log("Loading..");
    InitKeywordSymbols();
    await InitDriftLibs();

    // Index already-open documents
    for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId === "driftscript") {
            AnalyzeDoc(doc);
        }
    }

    const debounceTimers = new Map();
    const scheduleReindex = (document) => {
        const key = document.uri.toString();
        clearTimeout(debounceTimers.get(key));
        debounceTimers.set(
            key,
            setTimeout(() => {
                AnalyzeDoc(document);
                debounceTimers.delete(key);
            }, 300)
        );
    };

    context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(AnalyzeDoc),
            vscode.workspace.onDidChangeTextDocument(e => scheduleReindex(e.document)),
            vscode.workspace.onDidSaveTextDocument(AnalyzeDoc),
            vscode.workspace.onDidCloseTextDocument(OnDocClosed)
        );

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'driftscript',
            new DriftScriptProvideCompletionItems(),
            '.'
        )
    );

    context.subscriptions.push(
        vscode.languages.registerSignatureHelpProvider(
            'driftscript',
            new DriftScriptSignatureHelpProvider(),
            '(', ','
        )
    );

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            'driftscript',
            new DriftScriptHoverHelper()
        )
    );
    
    Log("Loading.. Completed.");
}

function deactivate()
{
    Log("Deactivated.");
}

module.exports = { activate, deactivate };

