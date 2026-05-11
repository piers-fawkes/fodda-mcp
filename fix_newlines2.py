import re

def fix(filename):
    with open(filename, 'r') as f:
        text = f.read()
    
    # We want to find cases where there is a single quote, a literal newline, some spaces, and another single quote.
    # Pattern: ' \n spaces '
    # Replace with: '\\n spaces '
    
    # regex: /'(\n\s*)'/
    # But wait, it's not just single quotes. Sometimes it was `replace(/\n/g, '')` which became `replace(/
    # /g, '')`
    
    def replacer(match):
        # match.group(1) is the newline and spaces
        # we want to return '\n' + spaces
        inner = match.group(1).replace('\n', '\\n')
        return "'" + inner + "'"

    # fix single quotes
    text = re.sub(r"'(\n\s*)'", replacer, text)
    
    # fix regex
    text = text.replace("replace(/\n/g", "replace(/\\n/g")
    text = text.replace("replace(/\\n/g", "replace(/\\\\n/g") # wait, the previous one might have missed it
    
    with open(filename, 'w') as f:
        f.write(text)

fix('src/brandTemplate.ts')
fix('src/searchTemplate.ts')
fix('src/widgetShell.ts')
