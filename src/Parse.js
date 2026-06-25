'use strict';

const QUALIFIED_NAME = "[A-Za-z_]\\w*(?:\\.[A-Za-z_]\\w*)*";

const FUNCTION_RE =
    new RegExp(
        `^[ \\t]*function\\s+(${QUALIFIED_NAME}(?:::[A-Za-z_]\\w*)?)\\s*\\(([^)]*)\\)`
    );

const CLASS_RE =
    new RegExp(
        `^[ \\t]*class\\s+(${QUALIFIED_NAME})(?:\\s+extends\\s+(${QUALIFIED_NAME}))?`
    );

const LOCAL_RE = /^[ \t]*local\s+([A-Za-z_]\w*)\s*=/;
 
const ENUM_START_RE =
    new RegExp(
        `^[ \\t]*enum\\s+(${QUALIFIED_NAME})\\s*(\\{)?\\s*$`
    );

const ENUM_MEMBER_RE = /^[ \t]*([A-Za-z_]\w*)\s*(?:=\s*[^,\n\r}]*)?\s*,?\s*$/;

function getCommentsAboveFunctionMultiBlock(lines, functionLineIndex)
{
    let idx = functionLineIndex - 1;

    if (idx < 0)
    {
        return [];
    }

    if (lines[idx] != '*/')
    {
        return [];
    }

    let output = [];

    idx -= 1;
    while (true)
    {
        if (idx < 0)
        {
            return [];
        }

        if (lines[idx] == '/*')
        {
            break;
        }

        if (lines[idx].includes('/*'))
        {
            return [];
        }

        output.unshift(lines[idx]);
        idx = idx - 1;
    }

    return output;
}

function AppendTextBlocks(block0, block1)
{
    let text = block0;
    if ((block0.length > 0) && (block1.length > 0))
    {
        text += '\n';
    }
    text += block1;
    return text;
}

function getCommentsAboveFunctionHashTag(lines, functionLineIndex)
{
    let idx = functionLineIndex - 1;
    let output = [];

    while (true)
    {
        if (idx < 0)
        {
            break;
        }

        if (!lines[idx].startsWith('#'))
        {
            break;
        }

        output.unshift(lines[idx].substring(2));
        idx = idx - 1;
    }

    return output;
}

function getLeadingComment(lines, functionLineIndex)
{
    let outputLines = []

    {
        outputLines = getCommentsAboveFunctionHashTag(lines, functionLineIndex);
        if (outputLines.length == 0)
        {
            outputLines = getCommentsAboveFunctionMultiBlock(lines, functionLineIndex);
        }
    }

    let bShow = true;
    let proto = '';
    let comment = '';

    for (const line of outputLines)
    {
        if (line == '!')
        {
            bShow = false;
            continue;
        }

        if (line.startsWith('@ '))
        {
            proto = line.substring(2);
            continue;
        }

        comment += line + "\n";
    }

    comment = StripEndNewLine(comment);

    return [bShow, proto, comment];
}
 
function GetNameSpaceAndIdentifier(str)
{
    const idx = str.lastIndexOf('.');

    if (idx === -1)
    {
        return ["", str];
    }

    return [
        str.slice(0, idx),
        str.slice(idx + 1)
    ];
}

function AddNamespaces(obj, str)
{
    if (str == "")
    {
        return;
    }

    let strs = str.split(".");
    for (const s of strs)
    {
        if (s in obj)
        {
            obj = obj[s];
        }
        else
        {
            obj[s] = {}
            obj = obj[s];
        }
    }
}

function AppendNamespace(namespace, symbol)
{
    if (namespace != '')
    {
        return namespace + '.' + symbol;
    }
    return symbol;
}

function StripEndNewLine(theText)
{
    if (theText.length == 0)
    {
        return '';
    }
    return theText.slice(0, -1);
}

function CreateStrippedCommentFromEnumComment(enumComment)
{
    let finalOutput = '';

    let theLines = enumComment.split('\n');
    for (let line of theLines)
    {
        let idx = line.indexOf('#')
        if (idx != (-1))
        {
            finalOutput += line.slice(idx) + '\n';
        }
    }

    finalOutput = StripEndNewLine(finalOutput);
    if (finalOutput.length > 0)
    {    
        return '```\n' + finalOutput + '\n```';
    }
    return "";
}

function ReadEnumMemberComments(allLines, lineIdx)
{
    let [bShow, proto, enumComment] = getLeadingComment(allLines, lineIdx);
    
    let enumMemberDef = '';
    for (let i=lineIdx; i < allLines.length; ++i)
    {
        if (lineIdx != i)
        {
            if (!allLines[i].includes('#'))
            {
                break;
            }
            if (allLines[i].split('#')[0].trim() != '')
            {
                break;
            }
        }
        enumMemberDef += allLines[i] + '\n';
    }

    enumMemberDef = StripEndNewLine(enumMemberDef);
    return [enumMemberDef, enumComment];
}

function ParseEnum(symbolsOut, namespacesOut, allLines, lineIdx, uriStr)
{
    let enumMembers = []

    let bCommit = false;
    let bParsingEnumMembers = false;
    let enumWithNamespace = ''
    
    {
        let temp = allLines[lineIdx].split('enum');
        if (temp.length != 2)
        {
            return;
        }
        enumWithNamespace = temp[1].split('{')[0].trim().split(/\s+/)[0].trim();
    }
    
    let [bShow, proto, comment] = getLeadingComment(allLines, lineIdx);
    if (!bShow)
    {
        return;
    }
    comment = '';

    let bSkip = false;
    for (let i = lineIdx; i < allLines.length; i++)
    {
        if (allLines[i] == '/*')
        {
            bSkip = true;
            continue;
        }
        if (allLines[i] == '*/')
        {
            bSkip = false;
            continue;
        }
        if (bSkip)
        {
            continue;
        }
        if (allLines[i].includes('{'))
        {
            bParsingEnumMembers = true;
            continue;
        }
        if (allLines[i].includes('}'))
        {
            bCommit = true;
            break;
        }
        if (!bParsingEnumMembers)
        {
            continue;
        }

        let enumMemberName = allLines[i].split(/[=,#]/)[0].trim()
        if (enumMemberName != '')
        {
            let [enumMemberDef2, enumComment2] = ReadEnumMemberComments(allLines, i);
            enumMembers.push( {
                name: enumMemberName,
                line: i,
                enumMemberDef: enumMemberDef2,
                enumComment: enumComment2
            } )
        }
    }

    if (bCommit)
    {
        let [theNamespace, enumName] = GetNameSpaceAndIdentifier(enumWithNamespace);

        AddNamespaces(namespacesOut, theNamespace);

        let enumList = '```\nenum ' + AppendNamespace(theNamespace, enumName) + ' {\n';
        for (let enumMember of enumMembers)
        {
            enumList += enumMember['enumMemberDef'];
            enumList += '\n';
        }
        enumList += '}\n```\n';

        symbolsOut.push(
        {
            kind: 'enum',
            name: enumName,
            namespace: theNamespace,
            signature: 'enum ' + AppendNamespace(theNamespace, enumName),
            doc: enumList + comment,
            line: lineIdx,
            uri: uriStr
        });

        for (let enumMember of enumMembers)
        {
            let docText = CreateStrippedCommentFromEnumComment(enumMember['enumMemberDef']);
            docText = AppendTextBlocks(docText, enumMember['enumComment']);

            symbolsOut.push({
                kind: 'enumMember',
                name: enumMember['name'],
                enum: enumName,
                namespace: theNamespace,
                signature: 'enum_val ' + AppendNamespace(theNamespace, enumName) + '.' + enumMember['name'],
                doc: docText,
                line: enumMember['line'],
                uri: uriStr
            });
        }
    }
}

function ParseEnums(symbolsOut, namespacesOut, allLines, uriStr)
{
    for (let i = 0; i < allLines.length; i++)
    {
        if (allLines[i].startsWith('enum '))
        {
            ParseEnum(symbolsOut, namespacesOut, allLines, i, uriStr);
        }
    }
}

function ParseAndGetSymbols(uriStr, text) {
    const lines = text.split(/\r\n|\r|\n/);
    const symbols = [];

    const namespaces = {};

    ParseEnums(symbols, namespaces, lines, uriStr);

    for (let i = 0; i < lines.length; i++)
    {
        const line = lines[i];
        let m;
  
        // -------- FUNCTIONS --------
        m = FUNCTION_RE.exec(line);
        if (m)
        {
            let bRootLevel = line.startsWith("function");
            if (bRootLevel)
            {
                let [bShow, proto, comment] = getLeadingComment(lines, i);
                if (bShow)
                {
                    let [theNamespace, functionName] = GetNameSpaceAndIdentifier(m[1]);
                    AddNamespaces(namespaces, theNamespace);

                    let defaultName = AppendNamespace(theNamespace, functionName);
                    let sig = (proto != '') ? proto : `function ${defaultName}(${m[2].trim()})`;

                    symbols.push({
                        kind: 'function',
                        namespace: theNamespace,
                        name: functionName,
                        signature: sig,
                        doc: comment,
                        line: i,
                        uri: uriStr
                    });
                }
            }
            continue;
        }

        // -------- CLASS --------
        m = CLASS_RE.exec(line);
        if (m)
        {
            let bRootLevel = line.startsWith("class");
            if (bRootLevel)
            {
                let [bShow, proto, comment] = getLeadingComment(lines, i);
                if (bShow)
                {
                    let [theNamespace, className] = GetNameSpaceAndIdentifier(m[1]);
                    AddNamespaces(namespaces, theNamespace);

                    let sig = '';
                    if (m[2]) {
                        sig = 'class ' + AppendNamespace(theNamespace, className) + ' extends ' + m[2];
                    } else {
                        sig = 'class ' + AppendNamespace(theNamespace, className);
                    }

                    symbols.push({
                        kind: 'class',
                        name: className,
                        namespace: theNamespace,
                        signature: sig,
                        doc: comment,
                        line: i,
                        uri: uriStr
                    });
                }
            }
            continue;
        }
 
        // -------- LOCAL --------
        m = LOCAL_RE.exec(line);
        if (m)
        {
            let [bShow, proto, comment] = getLeadingComment(lines, i);
            if (bShow)
            {
                symbols.push({
                    kind: 'variable',
                    name: m[1],
                    signature: `local ${m[1]}`,
                    doc: comment,
                    namespace: '',
                    line: i,
                    uri: uriStr
                });
            }
            continue;
        }
    }

    function addNamespaceSymbols(rootNamespace, thisNamespace, thisNamespaceObj)
    {
        symbols.push({
            kind: 'namespace',
            name: thisNamespace,
            signature: "namespace " + thisNamespace,
            doc: '',
            namespace: rootNamespace,
            line: 0,
            uri: uriStr
        });

        for (const namespace in thisNamespaceObj)
        {
            addNamespaceSymbols(thisNamespace, thisNamespace + "." + namespace, thisNamespaceObj[namespace]);
        }
    }

    for (const namespace in namespaces)
    {
        addNamespaceSymbols("", namespace, namespaces[namespace]);
    }
 
    return symbols;
}
 
module.exports = { ParseAndGetSymbols }; 

