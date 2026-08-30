#!/usr/bin/env bash
# fetch_wheels.sh
# Run this on a machine that has Internet access to download wheels for offline install.
# Usage: ./fetch_wheels.sh ./wheels
OUTDIR=${1:-./wheels}
PYTHON=${PYTHON:-python3}

mkdir -p "$OUTDIR"

echo "Downloading Python package wheels from requirements.txt..."
$PYTHON -m pip download -r requirements.txt -d "$OUTDIR"
if [ $? -ne 0 ]; then
  echo "pip download returned non-zero exit code. Check network/proxy settings." >&2
fi

echo "Attempting to download spaCy model wheel (may not be available as a simple pip package)."
CANDIDATES=("en_core_web_sm" "en-core-web-sm")
DOWNLOADD=false
for m in "${CANDIDATES[@]}"; do
  echo "Trying: $m"
  $PYTHON -m pip download "$m" -d "$OUTDIR" --no-deps && DOWNLOADD=true && break
done

if [ "$DOWNLOADD" = false ]; then
  echo "Could not download a spaCy model wheel automatically." >&2
  echo "Next steps:" 
  echo " - Run 'python -m spacy download en_core_web_sm' on this machine to install the model;"
  echo "   then locate the installed package (import en_core_web_sm; print(en_core_web_sm.__file__)) and copy the package files into $OUTDIR as a zip or folder."
fi

echo "Done. Wheels saved to: $OUTDIR"
echo "Transfer $OUTDIR to the offline machine and run:"
echo "  pip install --no-index --find-links=./wheels -r requirements.txt"
echo "If you copied the spaCy model folder, install it by copying into site-packages or by pip installing the model wheel."
