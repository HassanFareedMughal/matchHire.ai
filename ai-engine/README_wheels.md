Offline wheel bundle instructions
=================================

Use these steps on a machine that has Internet access to prepare a wheel bundle
you can transfer to the offline development machine.

1. On the internet-connected machine

PowerShell example:

```powershell
cd path\to\matchHire\ai-engine
# create wheels directory and download all dependencies
.\fetch_wheels.ps1 -OutDir .\wheels
```

Bash example:

```bash
cd /path/to/matchHire/ai-engine
./fetch_wheels.sh ./wheels
```

This will:
- Download wheels for packages in `requirements.txt` into `./wheels`.
- Attempt to download the spaCy model wheel – if unavailable it will tell you
  to run `python -m spacy download en_core_web_sm` and then copy the installed
  model package into `./wheels`.

2. Transfer the `wheels` folder to the offline machine (USB, network share, etc.)

3. On the offline machine (ai-engine directory):

```powershell
# Example PowerShell commands
python -m pip install --no-index --find-links=./wheels -r requirements.txt
# If you copied a spaCy model wheel, install it similarly:
# python -m pip install --no-index --find-links=./wheels en_core_web_sm-*.whl
```

If you cannot obtain a spaCy wheel, you can copy the installed model folder
from the internet machine into the offline Python's `site-packages` directory.
Find the model's package path on the internet machine with:

```python
import en_core_web_sm
print(en_core_web_sm.__file__)
```

Then copy the entire `en_core_web_sm` package folder into the offline
interpreter's `site-packages` (or ZIP it and place in `wheels` and unzip there).

Notes
-----
- Pre-downloading wheels avoids long compile/install times and network issues
  on the offline machine.
- On Windows, prefer using the same Python minor version as the offline target
  (e.g., Python 3.11) to ensure wheel compatibility.
- If you prefer conda, reproduce the environment using `conda install` on the
  internet machine and export packages with `conda pack` or similar tools.
