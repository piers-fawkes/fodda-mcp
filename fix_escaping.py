import os

files = ['src/brandTemplate.ts', 'src/searchTemplate.ts', 'src/widgetShell.ts']

for file in files:
    with open(file, 'r') as f:
        content = f.read()
    
    # Revert the escaped backticks and dollar signs that the API introduced
    content = content.replace('\\`', '`')
    content = content.replace('\\${', '${')
    content = content.replace('\\n', '\n')
    
    with open(file, 'w') as f:
        f.write(content)

print("Fixed escaping")
