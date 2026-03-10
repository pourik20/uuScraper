function parseUU5(uu5string, lang = 'cs') {
    if (!uu5string) return '';

    // 1. Filter language blocks
    // <UU5.Bricks.Lsi.Item language="cs">...</UU5.Bricks.Lsi.Item>
    const lsiRegex = /<UU5\.Bricks\.Lsi\.Item[^>]*language=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/UU5\.Bricks\.Lsi\.Item>/gi;
    let match;
    let filteredStr = uu5string;
    
    // If there are Lsi Items, extract only the requested language
    if (uu5string.includes('<UU5.Bricks.Lsi>')) {
        let extracted = '';
        while ((match = lsiRegex.exec(uu5string)) !== null) {
            if (match[1] === lang) {
                extracted += match[2] + '\n';
            }
        }
        filteredStr = extracted || filteredStr; // fallback if language not found
    }

    // 2. Extract nested uu5string attributes from RichText.Block
    // <UU5.RichText.Block uu5string="..."/>
    // The string is XML escaped in the attribute
    const blockRegex = /<UU5\.RichText\.Block[^>]*uu5string=['"]([\s\S]*?)['"]\s*\/>/gi;
    filteredStr = filteredStr.replace(blockRegex, (m, content) => {
        return unescapeXml(content);
    });

    // 3. Transform headers
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Section[^>]*header=['"]([^'"]+)['"][^>]*>/gi, '\n## $1\n\n');
    filteredStr = filteredStr.replace(/<\/UU5\.Bricks\.Section>/gi, '\n');
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Header[^>]*level=['"](\d+)['"][^>]*>([\s\S]*?)<\/UU5\.Bricks\.Header>/gi, (m, level, content) => {
        return '\n' + '#'.repeat(Number(level) || 1) + ' ' + content + '\n';
    });

    // 4. Transform basic text blocks
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.P[^>]*>([\s\S]*?)<\/UU5\.Bricks\.P>/gi, '\n$1\n\n');
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Strong[^>]*>([\s\S]*?)<\/UU5\.Bricks\.Strong>/gi, '**$1**');
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Em[^>]*>([\s\S]*?)<\/UU5\.Bricks\.Em>/gi, '*$1*');
    filteredStr = filteredStr.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**');
    filteredStr = filteredStr.replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*');
    filteredStr = filteredStr.replace(/<br\s*\/?>/gi, '\n');

    // 5. Transform links
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Link[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/UU5\.Bricks\.Link>/gi, '[$2]($1)');

    // 6. Transform Code
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Code[^>]*>([\s\S]*?)<\/UU5\.Bricks\.Code>/gi, '`$1`');
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.CodeKit\.CodeViewer[^>]*code=['"]([\s\S]*?)['"][^>]*\/>/gi, '\n```\n$1\n```\n');

    // 7. Transform Lists
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Ul[^>]*>([\s\S]*?)<\/UU5\.Bricks\.Ul>/gi, '\n$1\n');
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Ol[^>]*>([\s\S]*?)<\/UU5\.Bricks\.Ol>/gi, '\n$1\n');
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Li[^>]*>([\s\S]*?)<\/UU5\.Bricks\.Li>/gi, '- $1\n');

    // 8. Transform Tables (simplified)
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Table[^>]*>([\s\S]*?)<\/UU5\.Bricks\.Table>/gi, '\n$1\n');
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Table\.Tr[^>]*>([\s\S]*?)<\/UU5\.Bricks\.Table\.Tr>/gi, '| $1 |\n');
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.Table\.(?:Th|Td)[^>]*>([\s\S]*?)<\/UU5\.Bricks\.Table\.(?:Th|Td)>/gi, ' $1 |');

    // 9. Strip out layout components and other tags completely
    filteredStr = filteredStr.replace(/<UU5\.Bricks\.(Row|Column|Card|Div|Span|Lsi)[^>]*>/gi, '');
    filteredStr = filteredStr.replace(/<\/UU5\.Bricks\.(Row|Column|Card|Div|Span|Lsi)>/gi, '');
    filteredStr = filteredStr.replace(/<UuBookKit[^>]*>/gi, '');
    filteredStr = filteredStr.replace(/<\/UuBookKit[^>]*>/gi, '');
    filteredStr = filteredStr.replace(/<uu5string\/>/gi, '');
    filteredStr = filteredStr.replace(/<uu5json\/>.*/gi, '');
    
    // Clean up generic tags
    filteredStr = filteredStr.replace(/<div[^>]*>/gi, '');
    filteredStr = filteredStr.replace(/<\/div>/gi, '');
    filteredStr = filteredStr.replace(/<span[^>]*>/gi, '');
    filteredStr = filteredStr.replace(/<\/span>/gi, '');

    // Unescape HTML entities
    filteredStr = unescapeXml(filteredStr);

    // Clean up multiple empty lines
    filteredStr = filteredStr.replace(/\n{3,}/g, '\n\n').trim();

    return filteredStr;
}

function unescapeXml(safe) {
    return safe
        .replace(/\\\\"/g, '"')
        .replace(/\\"/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
}

module.exports = { parseUU5 };
