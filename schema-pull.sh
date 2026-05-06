#!/bin/bash

# Extract DATABASE_URL from .dev.vars (ignoring lines with 'export')
DATABASE_URL=$(grep '^DATABASE_URL=' .dev.vars | sed 's/^DATABASE_URL=//' | tr -d '"')

# Check if DATABASE_URL was found
if [ -z "$DATABASE_URL" ]; then
    echo "DATABASE_URL not found in .dev.vars"
    exit 1
fi

# Dump schema only into schema.sql
pg_dump --schema-only --no-privileges --schema=public "$DATABASE_URL" > schema.sql

echo "Schema dumped to schema.sql"
