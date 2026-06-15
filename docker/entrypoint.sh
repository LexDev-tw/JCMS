#!/bin/sh
set -e
mkdir -p /app/data /app/uploads /app/case_archive
exec "$@"
