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
    let outputLines = getCommentsAboveFunctionHashTag(lines, functionLineIndex);
    if (outputLines.length == 0)
    {
        outputLines = getCommentsAboveFunctionMultiBlock(lines, functionLineIndex);
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

        if (comment.length == 0)
        {
            comment += line;
        }
        else
        {
            comment += ('  \n' + line);
        }
    }

    console.log("Comment Start:")
    console.log(comment)
    console.log("Comment End:")
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

function ParseAndGetSymbols(uriStr, text) {
    const lines = text.split(/\r\n|\r|\n/);
    const symbols = [];

    const namespaces = {}

    for (let i = 0; i < lines.length; i++)
    {
        const line = lines[i];
        let m;
 
        // -------- ENUMS --------
        m = ENUM_START_RE.exec(line);
        if (m)
        {
            let [theNamespace, enumName] = GetNameSpaceAndIdentifier(m[1]);

            const braceOnSameLine = !!m[2];
            let [bShow, proto, comment] = getLeadingComment(lines, i);

            if (bShow)
            {
                AddNamespaces(namespaces, theNamespace);

                symbols.push({
                    kind: 'enum',
                    name: enumName,
                    namespace: theNamespace,
                    signature: 'enum ' + AppendNamespace(theNamespace, enumName),
                    doc: comment,
                    line: i,
                    uri: uriStr
                });
            }
 
            i++;
 
            // If the brace wasn't on the declaration line, scan forward for it.
            // Skip blank lines only - anything else means this isn't a real
            // enum block (malformed), so we bail out of enum parsing.
            if (!braceOnSameLine) {
                while (i < lines.length && lines[i].trim().length === 0) {
                    i++;
                }
 
                if (i >= lines.length || !/^\s*\{/.test(lines[i])) {
                    // No brace found - not a valid enum body, don't consume
                    // anything else. Back up so the outer loop re-examines
                    // this line normally.
                    i--;
                    continue;
                }
 
                // i is now on the line containing '{' - move past it
                i++;
            }
 
            // parse enum body
            while (i < lines.length && !/^\s*\}/.test(lines[i]))
            {
                let [bLocalShow, proto, comment] = getLeadingComment(lines, i);
                const trimmed = lines[i].trim();
                if (trimmed.length > 0)
                {
                    const memberMatch = ENUM_MEMBER_RE.exec(lines[i]);
 
                    if (memberMatch && bShow && bLocalShow) {
                        let theName = memberMatch[1];

                        symbols.push({
                            kind: 'enumMember',
                            name: theName,
                            enum: enumName,
                            namespace: theNamespace,
                            signature: 'enum_val ' + AppendNamespace(theNamespace, enumName) + '.' + theName,
                            doc: comment,
                            line: i,
                            uri: uriStr
                        });
                    }
                }
 
                i++;
            }
 
            // i is either at the closing '}' line or at EOF; the outer
            // for-loop's i++ will move past it (or past EOF harmlessly).
            continue;
        }
 
        // -------- FUNCTIONS --------
        m = FUNCTION_RE.exec(line);
        if (m)
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
            continue;
        }

        // -------- CLASS --------
        m = CLASS_RE.exec(line);
        if (m)
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
