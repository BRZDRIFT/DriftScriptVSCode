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
 
function stripLineComment(line)
{
    let commentBeginIndex = line.indexOf('#');
    if (commentBeginIndex == -1)
    {
        return '';
    }

    let sliceIndex = commentBeginIndex + 1;

    if (line[sliceIndex] == '@')
    {
        sliceIndex += 1;
    }

    if (line[sliceIndex] == ' ')
    {
        sliceIndex += 1;
    }

    return line.slice(sliceIndex);
}

function getFunctionSignature(namespace, lines, declIndex, backup)
{
    let idx = declIndex - 1;
    if (idx < 0) return backup;
 
    const line = lines[idx];
    if (!line) return backup;
 
    const trimmed = line.trim();
 
    if (trimmed.length === 0) return backup;
 
    if (trimmed.startsWith('#'))
    {    
        let i = idx;
 
        while (i >= 0 && lines[i].trim().startsWith('#'))
        {
            if (lines[i].trim().startsWith('#@'))
            {
                return stripLineComment(lines[i]);
            }
            i--;
        }
    }
 
    return backup;
}

function shouldSkip(lines, declIndex) {
    let idx = declIndex - 1;
    if (idx < 0) return false;
 
    const line = lines[idx];
    if (!line) return false;
 
    const trimmed = line.trim();
 
    if (trimmed.length === 0) return false;
 
    if (trimmed.startsWith('#')) {
        
        const collected = [];
        let i = idx;
 
        while (i >= 0 && lines[i].trim().startsWith('#')) {
            if (lines[i].trim().startsWith('#!'))
            {
                return true;
            }
            i--;
        }
 
        return false;
    }
 
    return false;
}

function getLeadingComment(lines, declIndex) {
    let idx = declIndex - 1;
    if (idx < 0) return '';
 
    const line = lines[idx];
    if (!line) return '';
 
    const trimmed = line.trim();
 
    if (trimmed.length === 0) return '';
 
    if (trimmed.startsWith('#')) {
        
        const collected = [];
        let i = idx;
 
        while (i >= 0 && lines[i].trim().startsWith('#')) {
            if (!lines[i].trim().startsWith('#@'))
            {
                collected.unshift(stripLineComment(lines[i]));
            }
            i--;
        }
 
        return collected.join("  \n");
    }
 
    return '';
}
 
function GetNameSpaceAndIdentifier(str) {
    const idx = str.lastIndexOf('.');

    if (idx === -1) {
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
    const lines = text.split(/\r?\n/);
    const symbols = [];

    const namespaces = {}

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m;
 
        // -------- ENUMS --------
        m = ENUM_START_RE.exec(line);
        if (m)
        {
            let [theNamespace, enumName] = GetNameSpaceAndIdentifier(m[1]);

            const braceOnSameLine = !!m[2];
            const bSkip = shouldSkip(lines, i);

            if (!bSkip)
            {
                AddNamespaces(namespaces, theNamespace);

                symbols.push({
                    kind: 'enum',
                    name: enumName,
                    namespace: theNamespace,
                    signature: 'enum ' + AppendNamespace(theNamespace, enumName),
                    doc: getLeadingComment(lines, i),
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
                const bLocalSkip = shouldSkip(lines, i);
                const trimmed = lines[i].trim();
                if (trimmed.length > 0)
                {
                    const memberMatch = ENUM_MEMBER_RE.exec(lines[i]);
 
                    if (memberMatch && !bSkip && !bLocalSkip) {
                        let theName = memberMatch[1];

                        symbols.push({
                            kind: 'enumMember',
                            name: theName,
                            enum: enumName,
                            namespace: theNamespace,
                            signature: 'enum_val ' + AppendNamespace(theNamespace, enumName) + '.' + theName,
                            doc: getLeadingComment(lines, i),
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
            const bSkip = shouldSkip(lines, i);
            if (!bSkip)
            {
                const comment = getLeadingComment(lines, i);

                let [theNamespace, functionName] = GetNameSpaceAndIdentifier(m[1]);
                AddNamespaces(namespaces, theNamespace);

                let defaultName = AppendNamespace(theNamespace, functionName);
                let sig = getFunctionSignature(theNamespace, lines, i, `function ${defaultName}(${m[2].trim()})`);

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
            const bSkip = shouldSkip(lines, i);
            if (!bSkip)
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
                    doc: getLeadingComment(lines, i),
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
            const bSkip = shouldSkip(lines, i);
            if (!bSkip)
            {
                symbols.push({
                    kind: 'variable',
                    name: m[1],
                    signature: `local ${m[1]}`,
                    doc: getLeadingComment(lines, i),
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
