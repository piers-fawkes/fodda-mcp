def fix_brand():
    with open('src/brandTemplate.ts', 'r') as f:
        content = f.read()
    
    if "export const TEMPLATE = `" not in content and "export const TEMPLATE = \\`" not in content:
        content = content.replace("<style>", "export const TEMPLATE = `\n<style>", 1)
        # the end of the template is likely already correctly closed with `;
        
    with open('src/brandTemplate.ts', 'w') as f:
        f.write(content)

def fix_search():
    with open('src/searchTemplate.ts', 'r') as f:
        content = f.read()
    
    if "const SEARCH_CSS = `" not in content and "const SEARCH_CSS = \\`" not in content:
        content = content.replace("/* Grid */\n.tgrid", "const SEARCH_CSS = `\n/* Grid */\n.tgrid", 1)
        # We need to find the end of SEARCH_CSS which is right before STAGES or STAGES definitions
        # In searchTemplate.ts, the CSS ends before `const STAGES = [`
        content = content.replace("}\n\n// ---------------------------------------------------------------------------", "}\n`;\n\n// ---------------------------------------------------------------------------", 1)
        
    with open('src/searchTemplate.ts', 'w') as f:
        f.write(content)

fix_brand()
fix_search()
