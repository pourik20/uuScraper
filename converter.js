const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs-extra');
// const { turndown } = require('turndown'); // Disabled for now

// Since we can't easily install new npm packages without checking, 
// I'll start by building the core logic.

class UuToMarkdown {
    constructor() {
        // Basic mapping of uu5 tags to Markdown
        this.tagMap = {
            'UU5.Bricks.Header': (content, attrs) => {
                const level = attrs.level || 1;
                return '\n' + '#'.repeat(level) + ' ' + content + '\n';
            },
            'UU5.Bricks.Section': (content) => '\n## ' + content + '\n',
            'UU5.RichText.Block': (content, attrs) => {
                // If it has a uu5string attribute, that's often the actual content
                if (attrs.uu5string) return attrs.uu5string + '\n\n';
                return content + '\n\n';
            },
            'UU5.Bricks.P': (content) => content + '\n\n',
            'UU5.Bricks.Strong': (content) => `**${content}**`,
            'UU5.Bricks.Em': (content) => `*${content}*`,
            'UU5.Bricks.Link': (content, attrs) => `[${content}](${attrs.href || ''})`,
            'UU5.Bricks.Code': (content) => `\`${content}\``,
            'UU5.Bricks.Pre': (content) => `\n\`\`\`\n${content}\n\`\`\`\n`,
            'UU5.Bricks.CodeBlock': (content) => `\n\`\`\`\n${content}\n\`\`\`\n`,
            'UU5.Bricks.Ul': (content) => '\n' + content + '\n',
            'UU5.Bricks.Li': (content) => `* ${content}\n`,
            'UuContentKit.Bricks.Block': (content) => content + '\n\n',
            // Handle LSI (localization)
            'UU5.Bricks.Lsi.Item': (content, attrs) => {
                // We'll prefer 'cs' or 'en'
                if (attrs.language === 'cs') return content;
                return ''; // Ignore other languages for now to avoid duplication
            }
        };
    }

    parse(uu5string, language = 'cs') {
        if (!uu5string) return '';
        
        // 1. Recursive cleaning of tags
        const cleanTags = (str) => {
            // Match any tag <Tag.Name attrs>content</Tag.Name> or <Tag.Name attrs/>
            const tagRegex = /<([\w\.]+)([^>]*?)>(.*?)<\/\1>|<([\w\.]+)([^>]*?)\/>/gs;
            
            let replaced = str.replace(tagRegex, (match, openTag, openAttrs, content, selfTag, selfAttrs) => {
                const tag = openTag || selfTag;
                const attrs = this.parseAttrs(openAttrs || selfAttrs);
                const innerContent = content ? cleanTags(content) : '';

                if (this.tagMap[tag]) {
                    return this.tagMap[tag](innerContent, attrs);
                }
                
                // Special case for uu5string/uu5json or other markers we want to ignore
                if (tag === 'uu5string' || tag === 'uu5json') return '';

                return innerContent; // Default: just strip tag, keep content
            });

            // If we made a replacement, try again (for nested tags)
            if (replaced !== str) {
                return cleanTags(replaced);
            }
            return replaced;
        };

        // Pre-processing
        let result = uu5string;
        
        // Use the recursive cleaner
        result = cleanTags(result);

        // Final cleanup of extra whitespace
        return result.replace(/\n{3,}/g, '\n\n').trim();
    }

    parseAttrs(attrStr) {
        const attrs = {};
        const regex = /(\w+)=["']?((?:.(?!["']?\s+(?:\w+)=|[>"']))+.)["']?/g;
        let m;
        while ((m = regex.exec(attrStr)) !== null) {
            attrs[m[1]] = m[2];
        }
        return attrs;
    }
}

module.exports = UuToMarkdown;
