#!/bin/bash

# Find all markdown files in the current directory and subdirectories
find . -type f -name "*.md" | while read -r file; do
    # Extract directory path, removing the leading './'
    dir_path=$(dirname "$file" | sed 's|^\./||')
    
    # 1. Build the tags YAML string
    tag_str="tags:"
    if [ "$dir_path" != "." ]; then
        IFS='/' read -ra ADDR <<< "$dir_path"
        for part in "${ADDR[@]}"; do
            tag_tag="${part// /_}"
            tag_str="$tag_str"$'\n'"  - \"#$tag_tag\""
        done
    else
        tag_str="tags: []"
    fi
    
    # 2. Build the nodes YAML string
    node_str="nodes:"
    has_nodes=0
    current_dir=$(dirname "$file")
    
    while read -r peer; do
        if [ -f "$peer" ] && [ "$peer" != "$file" ]; then
            peer_base=$(basename "$peer" .md)
            node_str="$node_str"$'\n'"  - \"[[$peer_base]]\""
            has_nodes=1
        fi
    done < <(find "$current_dir" -maxdepth 1 -type f -name "*.md" | sort)
    
    if [ $has_nodes -eq 0 ]; then
        node_str="nodes: []"
    fi

    # --- Edge Case: Handle completely empty files ---
    if [ ! -s "$file" ]; then
        {
            echo "---"
            echo "$tag_str"
            echo "$node_str"
            echo "---"
        } > "$file"
        echo "Initialized empty file: $file"
        continue
    fi
    # ------------------------------------------------

    # Export variables for awk (only runs if file has content)
    export tag_str
    export node_str
    
    awk '
    BEGIN {
        new_tags = ENVIRON["tag_str"];
        new_nodes = ENVIRON["node_str"];
        in_fm = 0;
        skip_block = 0;
        replaced_tags = 0;
        replaced_nodes = 0;
    }
    # File starts with frontmatter
    NR == 1 && /^---[ \r]*$/ {
        in_fm = 1;
        print $0;
        next;
    }
    # File does NOT start with frontmatter (Create brand new block)
    NR == 1 && !/^---[ \r]*$/ {
        print "---";
        print new_tags;
        print new_nodes;
        print "---";
        print $0;
        next;
    }
    # Inside frontmatter
    in_fm {
        if (/^---[ \r]*$/) {
            if (replaced_tags == 0) {
                print new_tags;
            }
            if (replaced_nodes == 0) {
                print new_nodes;
            }
            print $0;
            in_fm = 0;
            next;
        }
        if (/^tags:[ \r]*$/ || /^tags:/) {
            print new_tags;
            replaced_tags = 1;
            skip_block = 1;
            next;
        }
        if (/^nodes:[ \r]*$/ || /^nodes:/) {
            print new_nodes;
            replaced_nodes = 1;
            skip_block = 1;
            next;
        }
        if (skip_block) {
            if (/^[ \r\t]*$/ || /^ *- /) {
                next;
            } else {
                skip_block = 0;
            }
        }
        print $0;
        next;
    }
    # Outside frontmatter
    {
        print $0;
    }
    ' "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
    
    echo "Processed: $file"
done
