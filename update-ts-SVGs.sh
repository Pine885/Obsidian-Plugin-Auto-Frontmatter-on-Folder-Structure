#!/bin/bash

# For development use only. Updates .assets/auto-frontmatter-SVGs/*.svg in main.ts code block `const ICON_SVGS = { ... };`

# Directory containing the SVG files
SVG_DIR="assets/auto-frontmatter-SVGs"
# Target TypeScript file
TARGET_FILE="main.ts"

if [ ! -d "$SVG_DIR" ]; then
    echo "Error: SVG directory $SVG_DIR not found."
    exit 1
fi

# Build the ICON_SVGS object string
SVG_CONTENT="const ICON_SVGS = {"
for file in "$SVG_DIR"/*.svg; do
    [ -e "$file" ] || continue
    
    # Get filename without extension
    filename=$(basename "$file" .svg)
    
    # Convert filename to camelCase (e.g., multi-tag-script -> multiTagScript)
    key=$(echo "$filename" | sed -E 's/[-_]([a-z])/\U\1/g')
    
    # Read content, remove newlines, and escape single quotes
    content=$(cat "$file" | tr -d '\n' | sed "s/'/\\\\'/g")
    
    # Append with a real newline
    SVG_CONTENT="${SVG_CONTENT}
    ${key}: '${content}',"
done
SVG_CONTENT="${SVG_CONTENT}
};"

# Create a temporary file to store the updated content
# Keep everything before the 'const ICON_SVGS' line and then append the new block
sed -n '1,/const ICON_SVGS = {/p' "$TARGET_FILE" | sed '$d' > "$TARGET_FILE.tmp"
echo "$SVG_CONTENT" >> "$TARGET_FILE.tmp"
mv "$TARGET_FILE.tmp" "$TARGET_FILE"

echo "Successfully updated ICON_SVGS in $TARGET_FILE"
