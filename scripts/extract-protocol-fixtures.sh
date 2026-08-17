#!/usr/bin/env bash
# Extract pdftotext -layout fixtures for the protocol reconciliation parsers.
# Requires poppler: brew install poppler
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/src/lib/design-inputs/fixtures"
mkdir -p "$out"

pdftotext -layout \
  "$root/04 Pilot Design Verification/822-00007_Rev_AC_Solea_Model_3_Software_Requirements.pdf" \
  "$out/822-00007-Rev-AC.txt"

pdftotext -layout \
  "$root/04 Pilot Design Verification/790-00155_Rev_X_-_Solea_Model_3_SW_and_FW_Verification_Test_Plan.pdf" \
  "$out/790-00155-Rev-X.txt"

pdftotext -layout \
  "$root/04 Pilot Design Verification/Example Doc/790-00134_Rev_V_-_Solea_Model_3_Software_Design_Verification_Protocol.pdf" \
  "$out/790-00134-Rev-V.txt"

echo "Wrote fixtures to $out"
wc -l "$out"/*.txt
